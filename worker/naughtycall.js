import { DurableObject } from 'cloudflare:workers';
import togetherInviteWorker, { TogetherRoom, TogetherInviteRoom } from './together-invite.js';

const ROOM_NAME = 'shared';
const CALL_STATE_KEY = 'call-state-v1';
const RING_TTL_MS = 2 * 60 * 1000;
const ACTIVE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const DEFAULT_ICE_SERVERS = [{ urls: ['stun:stun.cloudflare.com:3478'] }];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...extraHeaders,
    },
  });
}

function errorResponse(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return json({ error: error?.message || 'Request failed' }, status);
  }
  return json({ error: 'Internal server error' }, 500);
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

function accessEmail(request) {
  const assertion = request.headers.get('cf-access-jwt-assertion') || '';
  const payload = assertion.split('.')[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload));
    const email = String(parsed?.email || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

async function participantIdFor(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest).slice(0, 10), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizedProbeHeaders(request) {
  const headers = new Headers(request.headers);
  for (const name of [
    'upgrade',
    'connection',
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-extensions',
    'sec-websocket-protocol',
  ]) headers.delete(name);
  return headers;
}

async function authenticateViaTogetherInvite(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/v1/__naughtycall-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: sanitizedProbeHeaders(request),
  });
  const response = await togetherInviteWorker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

function validateWebSocketOrigin(request) {
  const url = new URL(request.url);
  const expected = `${url.protocol}//${url.host}`;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected) throw new HttpError(403, 'Invalid WebSocket origin');
}

async function authenticatedParticipant(request, env, ctx) {
  const authFailure = await authenticateViaTogetherInvite(request, env, ctx);
  if (authFailure) return { authFailure, participantId: null };
  const email = accessEmail(request);
  if (!email) throw new HttpError(403, 'Authenticated user email is unavailable');
  return { authFailure: null, participantId: await participantIdFor(email) };
}

async function routeCallSocket(request, env, ctx) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
    throw new HttpError(426, 'Expected WebSocket upgrade');
  }
  validateWebSocketOrigin(request);

  const { authFailure, participantId } = await authenticatedParticipant(request, env, ctx);
  if (authFailure) return authFailure;

  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('cf-access-jwt-assertion');
  headers.set('x-naughtyshare-participant-id', participantId);

  const stub = env.NAUGHTYCALL_ROOMS.getByName(ROOM_NAME);
  return stub.fetch(new Request(request.url, { method: 'GET', headers }));
}

function safeIceServers(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  for (const entry of value.slice(0, 8)) {
    if (!entry || typeof entry !== 'object') continue;
    const rawUrls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
    const urls = rawUrls
      .map((url) => String(url || '').trim())
      .filter((url) => /^(stun|turn|turns):/i.test(url))
      .slice(0, 12);
    if (!urls.length) continue;
    const next = { urls };
    if (entry.username) next.username = String(entry.username);
    if (entry.credential) next.credential = String(entry.credential);
    result.push(next);
  }
  return result.length ? result : null;
}

async function routeIceServers(request, env, ctx) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const { authFailure } = await authenticatedParticipant(request, env, ctx);
  if (authFailure) return authFailure;

  const turnKeyId = String(env.TURN_KEY_ID || '').trim();
  const turnApiToken = String(env.TURN_KEY_API_TOKEN || '').trim();
  if (!turnKeyId || !turnApiToken) {
    return json({ iceServers: DEFAULT_ICE_SERVERS, mode: 'stun' });
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${turnApiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: 4 * 60 * 60 }),
      },
    );
    if (!response.ok) throw new Error(`TURN HTTP ${response.status}`);
    const data = await response.json();
    const iceServers = safeIceServers(data?.iceServers);
    if (!iceServers) throw new Error('TURN response missing iceServers');
    return json({ iceServers, mode: 'turn' });
  } catch {
    return json({ iceServers: DEFAULT_ICE_SERVERS, mode: 'stun-fallback' });
  }
}

function normalizeCall(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '');
  const caller = String(value.caller || '');
  const callee = value.callee ? String(value.callee) : null;
  const status = value.status === 'active' ? 'active' : value.status === 'ringing' ? 'ringing' : null;
  const createdAt = Number(value.createdAt);
  const updatedAt = Number(value.updatedAt);
  const expiresAt = Number(value.expiresAt);
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) return null;
  if (!/^[a-f0-9]{20}$/.test(caller)) return null;
  if (callee && !/^[a-f0-9]{20}$/.test(callee)) return null;
  if (!status || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || !Number.isFinite(expiresAt)) return null;
  return { id, caller, callee, status, createdAt, updatedAt, expiresAt };
}

export class NaughtyCallRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.call = null;
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.call = normalizeCall(await this.ctx.storage.get(CALL_STATE_KEY));
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async currentCall(now = Date.now()) {
    await this.ready;
    if (!this.call) return null;
    if (this.call.expiresAt <= now) {
      const expired = this.call;
      this.call = null;
      await this.ctx.storage.delete(CALL_STATE_KEY);
      this.broadcast({ type: 'CALL_ENDED', callId: expired.id, reason: 'expired', serverTimeMs: now });
      return null;
    }
    return this.call;
  }

  async fetch(request) {
    await this.ready;
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade' }, 426);
    }

    const participantId = String(request.headers.get('x-naughtyshare-participant-id') || '');
    if (!/^[a-f0-9]{20}$/.test(participantId)) return json({ error: 'Missing participant identity' }, 403);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment = {
      participantId,
      sessionId: crypto.randomUUID(),
      joinedAt: Date.now(),
    };

    this.ctx.acceptWebSocket(server, [`participant:${participantId}`]);
    server.serializeAttachment(attachment);

    const call = await this.currentCall();
    this.send(server, {
      type: 'WELCOME',
      participantId,
      sessionId: attachment.sessionId,
      presence: this.presence(),
      incomingCall: call?.status === 'ringing' && call.caller !== participantId ? call : null,
      serverTimeMs: Date.now(),
    });
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  presence(excludeSocket = null) {
    const participants = [];
    let sessionCount = 0;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeSocket || socket.readyState !== 1) continue;
      sessionCount += 1;
      const attachment = socket.deserializeAttachment();
      if (attachment?.participantId && !participants.includes(attachment.participantId)) {
        participants.push(attachment.participantId);
      }
    }
    return { participants, participantCount: participants.length, sessionCount };
  }

  send(socket, payload) {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // Runtime teardown handles dead sockets.
    }
  }

  broadcast(payload, { exceptParticipantId = null, onlyParticipantId = null } = {}) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const attachment = socket.deserializeAttachment();
      const participantId = attachment?.participantId || null;
      if (exceptParticipantId && participantId === exceptParticipantId) continue;
      if (onlyParticipantId && participantId !== onlyParticipantId) continue;
      this.send(socket, payload);
    }
  }

  broadcastPresence(excludeSocket = null) {
    this.broadcast({ type: 'PRESENCE', ...this.presence(excludeSocket), serverTimeMs: Date.now() });
  }

  sendError(socket, code, message) {
    this.send(socket, { type: 'ERROR', code, message, serverTimeMs: Date.now() });
  }

  async persistCall() {
    if (this.call) await this.ctx.storage.put(CALL_STATE_KEY, this.call);
    else await this.ctx.storage.delete(CALL_STATE_KEY);
  }

  async clearCall(reason, actor = null) {
    const previous = this.call;
    this.call = null;
    await this.ctx.storage.delete(CALL_STATE_KEY);
    if (previous) {
      this.broadcast({
        type: 'CALL_ENDED',
        callId: previous.id,
        reason,
        actor,
        serverTimeMs: Date.now(),
      });
    }
  }

  otherParticipant(call, actor) {
    if (!call) return null;
    if (actor === call.caller) return call.callee || null;
    if (actor === call.callee) return call.caller;
    return null;
  }

  async webSocketMessage(socket, message) {
    await this.ready;
    if (typeof message !== 'string') {
      this.sendError(socket, 'TEXT_ONLY', 'NaughtyCall messages must be JSON text');
      return;
    }
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, 'MESSAGE_TOO_LARGE', 'NaughtyCall message is too large');
      return;
    }

    let data;
    try {
      data = JSON.parse(message);
    } catch {
      this.sendError(socket, 'BAD_JSON', 'Invalid NaughtyCall message');
      return;
    }

    const attachment = socket.deserializeAttachment();
    const actor = attachment?.participantId;
    if (!actor) {
      socket.close(1008, 'Missing session identity');
      return;
    }

    const type = String(data?.type || '').toUpperCase();
    if (type === 'PING') {
      this.send(socket, {
        type: 'PONG',
        clientTimeMs: Number(data?.clientTimeMs) || null,
        serverTimeMs: Date.now(),
      });
      return;
    }

    if (type === 'CALL') {
      const existing = await this.currentCall();
      if (existing && existing.status === 'active') {
        this.sendError(socket, 'CALL_BUSY', 'A NaughtyCall is already active');
        return;
      }
      if (existing?.status === 'ringing' && existing.caller !== actor) {
        this.sendError(socket, 'CALL_BUSY', 'A NaughtyCall is already ringing');
        return;
      }

      const now = Date.now();
      this.call = {
        id: existing?.caller === actor ? existing.id : crypto.randomUUID(),
        caller: actor,
        callee: null,
        status: 'ringing',
        createdAt: existing?.caller === actor ? existing.createdAt : now,
        updatedAt: now,
        expiresAt: now + RING_TTL_MS,
      };
      await this.persistCall();
      this.send(socket, { type: 'CALLING', call: this.call, serverTimeMs: now });
      this.broadcast({ type: 'INCOMING_CALL', call: this.call, serverTimeMs: now }, { exceptParticipantId: actor });
      return;
    }

    const call = await this.currentCall();

    if (type === 'ACCEPT') {
      if (!call || call.status !== 'ringing' || String(data?.callId || '') !== call.id) {
        this.sendError(socket, 'CALL_GONE', 'This NaughtyCall is no longer ringing');
        return;
      }
      if (call.caller === actor) {
        this.sendError(socket, 'SELF_ACCEPT', 'Caller cannot accept their own call');
        return;
      }
      const now = Date.now();
      this.call = {
        ...call,
        callee: actor,
        status: 'active',
        updatedAt: now,
        expiresAt: now + ACTIVE_TTL_MS,
      };
      await this.persistCall();
      this.broadcast({ type: 'CALL_ACCEPTED', call: this.call, serverTimeMs: now });
      return;
    }

    if (type === 'DECLINE') {
      if (!call || call.status !== 'ringing' || String(data?.callId || '') !== call.id) return;
      if (call.caller === actor) return;
      const callId = call.id;
      this.call = null;
      await this.ctx.storage.delete(CALL_STATE_KEY);
      this.broadcast({ type: 'CALL_DECLINED', callId, actor, serverTimeMs: Date.now() });
      return;
    }

    if (type === 'CANCEL' || type === 'HANGUP') {
      if (!call || String(data?.callId || '') !== call.id) return;
      const isMember = call.caller === actor || call.callee === actor;
      if (!isMember) return;
      await this.clearCall(type === 'CANCEL' ? 'cancelled' : 'hangup', actor);
      return;
    }

    if (['OFFER', 'ANSWER', 'ICE'].includes(type)) {
      if (!call || call.status !== 'active' || String(data?.callId || '') !== call.id) {
        this.sendError(socket, 'CALL_GONE', 'No active NaughtyCall for signaling');
        return;
      }
      const target = this.otherParticipant(call, actor);
      if (!target) {
        this.sendError(socket, 'NOT_IN_CALL', 'This participant is not part of the active NaughtyCall');
        return;
      }
      const payload = type === 'ICE' ? data?.candidate : data?.description;
      if (!payload || typeof payload !== 'object') {
        this.sendError(socket, 'BAD_SIGNAL', 'Invalid WebRTC signaling payload');
        return;
      }
      this.broadcast(
        {
          type,
          callId: call.id,
          actor,
          ...(type === 'ICE' ? { candidate: payload } : { description: payload }),
          serverTimeMs: Date.now(),
        },
        { onlyParticipantId: target },
      );
      return;
    }

    this.sendError(socket, 'UNKNOWN_MESSAGE', 'Unknown NaughtyCall message type');
  }

  async webSocketClose(socket) {
    this.broadcastPresence(socket);
  }

  async webSocketError(socket) {
    this.broadcastPresence(socket);
    try {
      socket.close(1011, 'NaughtyCall socket error');
    } catch {
      // Ignore teardown errors.
    }
  }
}

export { TogetherRoom, TogetherInviteRoom };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/naughtycall/ws') {
        return await routeCallSocket(request, env, ctx);
      }
      if (url.pathname === '/api/naughtycall/ice') {
        return await routeIceServers(request, env, ctx);
      }
      return togetherInviteWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
