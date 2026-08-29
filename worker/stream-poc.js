import v1Worker from './v1.js';
import {
  cleanupStreamDerivative,
  getStreamDerivative,
  provisionStreamDerivative,
} from './stream.js';

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

function safeId(raw) {
  const id = decodeURIComponent(String(raw || ''));
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid identifier');
  return id;
}

async function authenticateViaV1(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/v1/__stream-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await v1Worker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      let match = /^\/api\/v1\/stream\/([^/]+)\/provision$/.exec(url.pathname);
      if (match && request.method === 'POST') {
        const authFailure = await authenticateViaV1(request, env, ctx);
        if (authFailure) return authFailure;
        return await provisionStreamDerivative(request, env, safeId(match[1]));
      }

      match = /^\/api\/v1\/stream\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === 'GET') {
        const authFailure = await authenticateViaV1(request, env, ctx);
        if (authFailure) return authFailure;
        return await getStreamDerivative(env, safeId(match[1]));
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/media/')) {
        const mediaId = safeId(url.pathname.slice('/api/media/'.length));
        const response = await v1Worker.fetch(request, env, ctx);
        if (response.ok) {
          const cleanup = cleanupStreamDerivative(env, mediaId);
          if (ctx?.waitUntil) ctx.waitUntil(cleanup);
          else await cleanup;
        }
        return response;
      }

      return v1Worker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
