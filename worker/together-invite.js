import { DurableObject } from 'cloudflare:workers';
import togetherWorker, { TogetherRoom } from './together.js';

const ROOM_NAME = 'shared';
const INVITE_KEY = 'invite-state-v1';
const INVITE_TTL_MS = 10 * 60 * 1000;
const MAX_MESSAGE_BYTES = 8 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
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

function safeMediaId(raw) {
  const value = String(raw || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new HttpError(400, 'Invalid media identifier');
  return value;
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

async function authenticateViaTogether(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/v1/__together-invite-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: sanitizedProbeHeaders(request),
  });
  const response = await togetherWorker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

function validateWebSocketOrigin(request) {
  const url = new URL(request.url);
  const expected = `${url.protocol}//${url.host}`;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected) throw new HttpError(403, 'Invalid WebSocket origin');
}

async function routeInviteSocket(request, env, ctx) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
    throw new HttpError(426, 'Expected WebSocket upgrade');
  }
  validateWebSocketOrigin(request);

  const authFailure = await authenticateViaTogether(request, env, ctx);
  if (authFailure) return authFailure;

  const email = accessEmail(request);
  if (!email) throw new HttpError(403, 'Authenticated user email is unavailable');
  const participantId = await participantIdFor(email);

  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('cf-access-jwt-assertion');
  headers.set('x-naughtyshare-participant-id', participantId);

  const stub = env.TOGETHER_INVITES.getByName(ROOM_NAME);
  return stub.fetch(new Request(request.url, {
    method: 'GET',
    headers,
  }));
}

function normalizeInvite(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '');
  const actor = String(value.actor || '');
  const mediaId = String(value.mediaId || '');
  const createdAt = Number(value.createdAt);
  const expiresAt = Number(value.expiresAt);
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) return null;
  if (!/^[a-f0-9]{20}$/.test(actor)) return null;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(mediaId)) return null;
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null;
  return { id, actor, mediaId, createdAt, expiresAt };
}

export class TogetherInviteRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.invite = null;
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.invite = normalizeInvite(await this.ctx.storage.get(INVITE_KEY));
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async currentInvite(now = Date.now()) {
    await this.ready;
    if (!this.invite) return null;
    if (this.invite.expiresAt <= now) {
      this.invite = null;
      await this.ctx.storage.delete(INVITE_KEY);
      this.broadcast({ type: 'INVITE_CLEARED', reason: 'expired', serverTimeMs: now });
      return null;
    }
    return this.invite;
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

    const invite = await this.currentInvite();
    this.send(server, {
      type: 'WELCOME',
      participantId,
      sessionId: attachment.sessionId,
      serverTimeMs: Date.now(),
      invite: invite && invite.actor !== participantId ? invite : null,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, payload) {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // Socket teardown is handled by the runtime callbacks.
    }
  }

  broadcast(payload, { exceptParticipantId = null } = {}) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const attachment = socket.deserializeAttachment();
      if (exceptParticipantId && attachment?.participantId === exceptParticipantId) continue;
      this.send(socket, payload);
    }
  }

  async videoExists(mediaId) {
    const row = await this.env.DB.prepare(
      `SELECT id, content_type
       FROM media
       WHERE id = ?1
       LIMIT 1`,
    ).bind(mediaId).first();
    return Boolean(row?.id && String(row.content_type || '').startsWith('video/'));
  }

  async clearInvite(reason, extra = {}) {
    const previous = this.invite;
    this.invite = null;
    await this.ctx.storage.delete(INVITE_KEY);
    this.broadcast({
      type: 'INVITE_CLEARED',
      reason,
      inviteId: previous?.id || null,
      serverTimeMs: Date.now(),
      ...extra,
    });
  }

  sendError(socket, code, message) {
    this.send(socket, { type: 'ERROR', code, message, serverTimeMs: Date.now() });
  }

  async webSocketMessage(socket, message) {
    await this.ready;
    if (typeof message !== 'string') {
      this.sendError(socket, 'TEXT_ONLY', 'Invite messages must be JSON text');
      return;
    }
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, 'MESSAGE_TOO_LARGE', 'Invite message is too large');
      return;
    }

    let data;
    try {
      data = JSON.parse(message);
    } catch {
      this.sendError(socket, 'BAD_JSON', 'Invalid invite message');
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

    if (type === 'INVITE') {
      let mediaId;
      try {
        mediaId = safeMediaId(data?.mediaId);
      } catch {
        this.sendError(socket, 'BAD_MEDIA', 'Invalid media identifier');
        return;
      }
      if (!(await this.videoExists(mediaId))) {
        this.sendError(socket, 'MEDIA_NOT_FOUND', 'Invite media is missing or is not a video');
        return;
      }

      const now = Date.now();
      this.invite = {
        id: crypto.randomUUID(),
        actor,
        mediaId,
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
      };
      await this.ctx.storage.put(INVITE_KEY, this.invite);

      this.send(socket, { type: 'INVITE_SENT', invite: this.invite, serverTimeMs: now });
      this.broadcast({ type: 'INVITE', invite: this.invite, serverTimeMs: now }, { exceptParticipantId: actor });
      return;
    }

    const invite = await this.currentInvite();

    if (type === 'ACCEPT') {
      if (!invite || String(data?.inviteId || '') !== invite.id) {
        this.sendError(socket, 'INVITE_GONE', 'This invite is no longer active');
        return;
      }
      if (invite.actor === actor) {
        this.sendError(socket, 'SELF_ACCEPT', 'The inviter cannot accept their own invite');
        return;
      }
      const inviteId = invite.id;
      this.invite = null;
      await this.ctx.storage.delete(INVITE_KEY);
      this.broadcast({ type: 'INVITE_ACCEPTED', inviteId, acceptedBy: actor, serverTimeMs: Date.now() });
      return;
    }

    if (type === 'DECLINE') {
      if (!invite || String(data?.inviteId || '') !== invite.id) return;
      if (invite.actor === actor) return;
      const inviteId = invite.id;
      this.invite = null;
      await this.ctx.storage.delete(INVITE_KEY);
      this.broadcast({ type: 'INVITE_DECLINED', inviteId, declinedBy: actor, serverTimeMs: Date.now() });
      return;
    }

    if (type === 'CANCEL_INVITE') {
      if (!invite || invite.actor !== actor) return;
      if (data?.inviteId && String(data.inviteId) !== invite.id) return;
      await this.clearInvite('cancelled', { cancelledBy: actor });
      return;
    }

    this.sendError(socket, 'UNKNOWN_MESSAGE', 'Unknown invite message type');
  }

  async webSocketClose() {
    // Invite state intentionally survives short disconnects until cancelled or expired.
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, 'Together invite socket error');
    } catch {
      // Ignore teardown errors.
    }
  }
}

export { TogetherRoom };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/together/invite/ws') {
        return await routeInviteSocket(request, env, ctx);
      }
      return togetherWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
