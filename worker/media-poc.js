import v1Worker from './v1.js';
import {
  cleanupCompatDerivative,
  createCompatDerivative,
  derivativeHead,
  derivativeObject,
  getCompatDerivative,
} from './media-transform.js';

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
  probeUrl.pathname = '/api/v1/__compat-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await v1Worker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

function parseByteRange(header, totalSize) {
  if (!header) return null;
  const value = String(header).trim();
  if (value.includes(',')) return { invalid: true };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return { invalid: true };

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || totalSize <= 0) return { invalid: true };
    const length = Math.min(suffix, totalSize);
    return { start: totalSize - length, end: totalSize - 1, length };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start < 0 || start >= totalSize) return { invalid: true };
  let end = totalSize - 1;
  if (match[2]) {
    const requestedEnd = Number(match[2]);
    if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { invalid: true };
    end = Math.min(requestedEnd, totalSize - 1);
  }
  return { start, end, length: end - start + 1 };
}

function compatHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', 'video/mp4');
  headers.set('cache-control', 'private, no-store');
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('content-disposition', 'inline');
  return headers;
}

async function serveCompatMedia(request, env, mediaId) {
  const metadata = await derivativeHead(env, mediaId);
  if (!metadata) throw new HttpError(404, 'Compatibility derivative not found');

  const totalSize = Number(metadata.size || 0);
  const headers = compatHeaders(metadata);
  const range = parseByteRange(request.headers.get('range'), totalSize);

  if (range?.invalid) {
    headers.set('content-range', `bytes */${totalSize}`);
    headers.set('content-length', '0');
    return new Response(null, { status: 416, headers });
  }

  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${totalSize}`);
    headers.set('content-length', String(range.length));
    if (request.method === 'HEAD') return new Response(null, { status: 206, headers });

    const object = await env.MEDIA.get(`app-data/v1/compat-video/${mediaId}.mp4`, {
      range: { offset: range.start, length: range.length },
    });
    if (!object || !('body' in object)) throw new HttpError(404, 'Compatibility derivative not found');
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(totalSize));
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

  const object = await derivativeObject(env, mediaId);
  if (!object || !('body' in object)) throw new HttpError(404, 'Compatibility derivative not found');
  return new Response(object.body, { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      let match = /^\/api\/v1\/compat-video\/([^/]+)$/.exec(url.pathname);
      if (match && (request.method === 'GET' || request.method === 'POST')) {
        const authFailure = await authenticateViaV1(request, env, ctx);
        if (authFailure) return authFailure;
        const mediaId = safeId(match[1]);
        if (request.method === 'POST') return await createCompatDerivative(request, env, mediaId);
        return await getCompatDerivative(env, mediaId);
      }

      match = /^\/compat-media\/([^/]+)$/.exec(url.pathname);
      if (match && (request.method === 'GET' || request.method === 'HEAD')) {
        const authFailure = await authenticateViaV1(request, env, ctx);
        if (authFailure) return authFailure;
        return await serveCompatMedia(request, env, safeId(match[1]));
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/media/')) {
        const mediaId = safeId(url.pathname.slice('/api/media/'.length));
        const response = await v1Worker.fetch(request, env, ctx);
        if (response.ok) {
          const cleanup = cleanupCompatDerivative(env, mediaId);
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
