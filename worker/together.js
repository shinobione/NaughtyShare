import { DurableObject } from 'cloudflare:workers';
import mediaPocWorker from './media-poc.js';

const ROOM_NAME = 'shared';
const MAX_MESSAGE_BYTES = 8 * 1024;
const ROOM_STATE_KEY = 'room-state-v1';

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

function safePosition(raw, fallback = 0) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return Math.max(0, Number(fallback) || 0);
  return Math.max(0, Math.min(value, 7 * 24 * 60 * 60));
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

async function authenticateViaMediaPoc(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/v1/__together-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: sanitizedProbeHeaders(request),
  });
  const response = await mediaPocWorker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

function validateWebSocketOrigin(request) {
  const url = new URL(request.url);
  const expected = `${url.protocol}//${url.host}`;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected) throw new HttpError(403, 'Invalid WebSocket origin');
}

async function routeTogetherSocket(request, env, ctx) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
    throw new HttpError(426, 'Expected WebSocket upgrade');
  }
  validateWebSocketOrigin(request);

  const authFailure = await authenticateViaMediaPoc(request, env, ctx);
  if (authFailure) return authFailure;

  const email = accessEmail(request);
  if (!email) throw new HttpError(403, 'Authenticated user email is unavailable');
  const participantId = await participantIdFor(email);

  const url = new URL(request.url);
  const room = url.searchParams.get('room') || ROOM_NAME;
  if (room !== ROOM_NAME) throw new HttpError(404, 'Together room not found');

  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('cf-access-jwt-assertion');
  headers.set('x-naughtyshare-participant-id', participantId);
  headers.set('x-naughtyshare-room', ROOM_NAME);

  const stub = env.TOGETHER_ROOMS.getByName(ROOM_NAME);
  return stub.fetch(new Request(request.url, {
    method: 'GET',
    headers,
  }));
}

function defaultRoomState() {
  return {
    mediaId: null,
    playing: false,
    position: 0,
    updatedAt: Date.now(),
    revision: 0,
    controller: 'shared',
  };
}

function normalizeStoredState(value) {
  if (!value || typeof value !== 'object') return defaultRoomState();
  let mediaId = null;
  if (typeof value.mediaId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.mediaId)) {
    mediaId = value.mediaId;
  }
  return {
    mediaId,
    playing: Boolean(value.playing && mediaId),
    position: safePosition(value.position),
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    revision: Number.isSafeInteger(Number(value.revision)) ? Math.max(0, Number(value.revision)) : 0,
    controller: value.controller === 'shared' ? 'shared' : 'shared',
  };
}

export class TogetherRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.roomState = defaultRoomState();
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.roomState = normalizeStoredState(await this.ctx.storage.get(ROOM_STATE_KEY));
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
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

    this.send(server, {
      type: 'WELCOME',
      participantId,
      sessionId: attachment.sessionId,
      state: this.snapshot(),
      presence: this.presence(),
    });
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  projectedPosition(now = Date.now()) {
    const base = safePosition(this.roomState.position);
    if (!this.roomState.playing) return base;
    const elapsed = Math.max(0, now - Number(this.roomState.updatedAt || now)) / 1000;
    return safePosition(base + elapsed);
  }

  snapshot(now = Date.now()) {
    return {
      ...this.roomState,
      position: this.projectedPosition(now),
      serverTimeMs: now,
    };
  }

  presence() {
    const sockets = this.ctx.getWebSockets();
    const participantIds = [];
    for (const socket of sockets) {
      const attachment = socket.deserializeAttachment();
      if (attachment?.participantId && !participantIds.includes(attachment.participantId)) {
        participantIds.push(attachment.participantId);
      }
    }
    return {
      participants: participantIds,
      participantCount: participantIds.length,
      sessionCount: sockets.length,
    };
  }

  send(socket, payload) {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // Socket teardown is handled by the runtime close/error callbacks.
    }
  }

  broadcast(payload, except = null) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      this.send(socket, payload);
    }
  }

  broadcastPresence() {
    this.broadcast({
      type: 'PRESENCE',
      ...this.presence(),
      serverTimeMs: Date.now(),
    });
  }

  async persistState() {
    await this.ctx.storage.put(ROOM_STATE_KEY, this.roomState);
  }

  async commitState(actor, reason, patch) {
    const now = Date.now();
    const currentPosition = this.projectedPosition(now);
    const next = {
      ...this.roomState,
      position: currentPosition,
      updatedAt: now,
      ...patch,
      revision: this.roomState.revision + 1,
    };
    if (!next.mediaId) {
      next.playing = false;
      next.position = 0;
    }
    this.roomState = normalizeStoredState(next);
    this.roomState.revision = next.revision;
    this.roomState.updatedAt = now;
    await this.persistState();
    this.broadcast({
      type: 'STATE',
      reason,
      actor,
      state: this.snapshot(now),
    });
  }

  sendError(socket, code, message) {
    this.send(socket, { type: 'ERROR', code, message, serverTimeMs: Date.now() });
  }

  async webSocketMessage(socket, message) {
    await this.ready;
    if (typeof message !== 'string') {
      this.sendError(socket, 'TEXT_ONLY', 'Together messages must be JSON text');
      return;
    }
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, 'MESSAGE_TOO_LARGE', 'Together message is too large');
      return;
    }

    let data;
    try {
      data = JSON.parse(message);
    } catch {
      this.sendError(socket, 'BAD_JSON', 'Invalid Together message');
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

    if (type === 'SYNC') {
      this.send(socket, { type: 'STATE', reason: 'sync', actor: null, state: this.snapshot() });
      return;
    }

    if (type === 'MEDIA') {
      let mediaId;
      try {
        mediaId = safeMediaId(data?.mediaId);
      } catch {
        this.sendError(socket, 'BAD_MEDIA', 'Invalid media identifier');
        return;
      }
      await this.commitState(actor, 'media', {
        mediaId,
        playing: false,
        position: safePosition(data?.position),
      });
      return;
    }

    if (!this.roomState.mediaId) {
      this.sendError(socket, 'NO_MEDIA', 'No media is selected in this room');
      return;
    }

    if (String(data?.mediaId || '') !== this.roomState.mediaId) {
      this.sendError(socket, 'MEDIA_MISMATCH', 'This command targets another media item');
      return;
    }

    if (type === 'PLAY') {
      await this.commitState(actor, 'play', {
        playing: true,
        position: safePosition(data?.position, this.projectedPosition()),
      });
      return;
    }

    if (type === 'PAUSE') {
      await this.commitState(actor, 'pause', {
        playing: false,
        position: safePosition(data?.position, this.projectedPosition()),
      });
      return;
    }

    if (type === 'SEEK') {
      await this.commitState(actor, 'seek', {
        position: safePosition(data?.position, this.projectedPosition()),
      });
      return;
    }

    this.sendError(socket, 'UNKNOWN_MESSAGE', 'Unknown Together message type');
  }

  async webSocketClose(socket) {
    try {
      socket.close();
    } catch {
      // The close handshake may already be complete.
    }
    this.broadcastPresence();
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, 'Together socket error');
    } catch {
      // Ignore teardown errors.
    }
    this.broadcastPresence();
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/together/ws') {
        return await routeTogetherSocket(request, env, ctx);
      }
      return mediaPocWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
