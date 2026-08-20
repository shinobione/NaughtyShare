import momentsWorker from './moments.js';

const V1_DURATION_KEY = 'app-data/v1/durations.json';
const THUMBNAIL_PREFIX = 'app-data/v1/thumbnails/';
const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60;

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
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  return json({ error: 'Internal server error' }, 500);
}

function safeId(raw) {
  const id = decodeURIComponent(String(raw || ''));
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid identifier');
  return id;
}

function thumbnailKey(mediaId) {
  return `${THUMBNAIL_PREFIX}${mediaId}.webp`;
}

async function authenticateViaMoments(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/library/__v1-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await momentsWorker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

async function mediaExists(env, mediaId) {
  const row = await env.DB.prepare('SELECT id FROM media WHERE id = ?1 LIMIT 1').bind(mediaId).first();
  return Boolean(row?.id);
}

async function mediaDeliveryRow(env, mediaId) {
  return env.DB.prepare(
    `SELECT object_key, content_type, size_bytes
     FROM media
     WHERE id = ?1
     LIMIT 1`,
  ).bind(mediaId).first();
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
    const start = totalSize - length;
    return { start, end: totalSize - 1, length };
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

function mediaHeaders(metadata, row) {
  const headers = new Headers();
  metadata.writeHttpMetadata(headers);
  headers.set('content-type', row.content_type);
  headers.set('cache-control', 'private, no-store');
  headers.set('etag', metadata.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('content-disposition', 'inline');
  return headers;
}

async function serveMediaCompat(request, env, ctx, mediaId) {
  const authFailure = await authenticateViaMoments(request, env, ctx);
  if (authFailure) return authFailure;

  const row = await mediaDeliveryRow(env, mediaId);
  if (!row) throw new HttpError(404, 'Media not found');

  const metadata = await env.MEDIA.head(row.object_key);
  if (!metadata) throw new HttpError(404, 'Media object not found');
  const totalSize = Number(metadata.size || row.size_bytes || 0);
  const headers = mediaHeaders(metadata, row);
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

    const object = await env.MEDIA.get(row.object_key, {
      range: { offset: range.start, length: range.length },
    });
    if (!object || !('body' in object)) throw new HttpError(404, 'Media object not found');
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(totalSize));
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

  const object = await env.MEDIA.get(row.object_key);
  if (!object || !('body' in object)) throw new HttpError(404, 'Media object not found');
  return new Response(object.body, { status: 200, headers });
}

async function readJsonObject(env, key) {
  const object = await env.MEDIA.get(key);
  if (!object || !('body' in object)) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
}

async function writeJsonObject(env, key, value) {
  await env.MEDIA.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, no-store',
    },
  });
}

async function readDurations(env) {
  const raw = await readJsonObject(env, V1_DURATION_KEY);
  const entries = raw?.durations && typeof raw.durations === 'object' && !Array.isArray(raw.durations)
    ? raw.durations
    : {};
  const durations = {};
  for (const [id, value] of Object.entries(entries)) {
    const seconds = Number(value);
    if (/^[A-Za-z0-9_-]{1,100}$/.test(id) && Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_DURATION_SECONDS) {
      durations[id] = seconds;
    }
  }
  return durations;
}

async function writeDurations(env, durations) {
  await writeJsonObject(env, V1_DURATION_KEY, {
    durations,
    updatedAt: new Date().toISOString(),
  });
}

async function enrichMediaList(request, env, ctx) {
  const response = await momentsWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  const data = await response.json();
  const durations = await readDurations(env);
  if (Array.isArray(data?.items)) {
    data.items = data.items.map((item) => ({
      ...item,
      durationSeconds: Object.hasOwn(durations, item.id) ? durations[item.id] : item.durationSeconds,
      thumbnailUrl: `/thumbnail/${encodeURIComponent(item.id)}`,
    }));
  }
  return json(data);
}

async function patchDuration(request, env, ctx, mediaId) {
  const authFailure = await authenticateViaMoments(request, env, ctx);
  if (authFailure) return authFailure;
  if (!(await mediaExists(env, mediaId))) throw new HttpError(404, 'Media not found');

  const body = await request.json().catch(() => null);
  const seconds = Number(body?.durationSeconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_DURATION_SECONDS) {
    throw new HttpError(400, 'Invalid media duration');
  }

  const durations = await readDurations(env);
  durations[mediaId] = Math.round(seconds * 1000) / 1000;
  await writeDurations(env, durations);
  return json({ ok: true, mediaId, durationSeconds: durations[mediaId] });
}

async function serveThumbnail(request, env, ctx, mediaId) {
  const authFailure = await authenticateViaMoments(request, env, ctx);
  if (authFailure) return authFailure;
  if (!(await mediaExists(env, mediaId))) throw new HttpError(404, 'Media not found');

  const object = await env.MEDIA.get(thumbnailKey(mediaId));
  if (!object || !('body' in object)) throw new HttpError(404, 'Thumbnail not found');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', 'image/webp');
  headers.set('cache-control', 'private, no-store');
  headers.set('content-length', String(object.size));
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('content-disposition', 'inline');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  return new Response(object.body, { status: 200, headers });
}

async function putThumbnail(request, env, ctx, mediaId) {
  const authFailure = await authenticateViaMoments(request, env, ctx);
  if (authFailure) return authFailure;
  if (!(await mediaExists(env, mediaId))) throw new HttpError(404, 'Media not found');
  if (!request.body) throw new HttpError(400, 'Empty thumbnail');

  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'image/webp') throw new HttpError(415, 'Thumbnail must be WebP');
  const declaredLength = Number(request.headers.get('content-length') || request.headers.get('x-thumbnail-size') || 0);
  if (declaredLength > MAX_THUMBNAIL_BYTES) throw new HttpError(413, 'Thumbnail is too large');

  const stored = await env.MEDIA.put(thumbnailKey(mediaId), request.body, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'private, no-store',
    },
  });
  if (!stored) throw new HttpError(500, 'Thumbnail upload failed');
  if (stored.size > MAX_THUMBNAIL_BYTES) {
    await env.MEDIA.delete(thumbnailKey(mediaId));
    throw new HttpError(413, 'Thumbnail is too large');
  }

  return json({ ok: true, mediaId, sizeBytes: stored.size }, 201);
}

async function cleanupV1Media(env, mediaId) {
  await env.MEDIA.delete(thumbnailKey(mediaId));
  const durations = await readDurations(env);
  if (Object.hasOwn(durations, mediaId)) {
    delete durations[mediaId];
    await writeDurations(env, durations);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/media/')) {
        const mediaId = safeId(url.pathname.slice('/media/'.length));
        return await serveMediaCompat(request, env, ctx, mediaId);
      }

      if (request.method === 'GET' && url.pathname === '/api/media') {
        return await enrichMediaList(request, env, ctx);
      }

      let match = /^\/api\/v1\/media\/([^/]+)\/duration$/.exec(url.pathname);
      if (match && request.method === 'PATCH') {
        return await patchDuration(request, env, ctx, safeId(match[1]));
      }

      match = /^\/api\/v1\/thumbnails\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === 'PUT') {
        return await putThumbnail(request, env, ctx, safeId(match[1]));
      }

      match = /^\/thumbnail\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === 'GET') {
        return await serveThumbnail(request, env, ctx, safeId(match[1]));
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/media/')) {
        const mediaId = safeId(url.pathname.slice('/api/media/'.length));
        const response = await momentsWorker.fetch(request, env, ctx);
        if (response.ok) {
          const cleanup = cleanupV1Media(env, mediaId);
          if (ctx?.waitUntil) ctx.waitUntil(cleanup);
          else await cleanup;
        }
        return response;
      }

      return momentsWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
