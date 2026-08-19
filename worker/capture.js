import appWorker from './app.js';

const CAPTURE_PREFIX = 'app-data/capture-meta/';
const CAPTURE_SOURCES = new Set(['exif', 'container', 'file', 'manual']);
const ROTATIONS = new Set([0, 90, 180, 270]);

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

function idFromPath(raw) {
  const id = decodeURIComponent(raw || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid identifier');
  return id;
}

function captureKey(mediaId) {
  return `${CAPTURE_PREFIX}${mediaId}.json`;
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

async function listObjects(env, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    objects.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

async function mediaExists(env, mediaId) {
  const row = await env.DB.prepare('SELECT id FROM media WHERE id = ?1 LIMIT 1').bind(mediaId).first();
  return Boolean(row?.id);
}

async function authenticateViaApp(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/library/__capture-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await appWorker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

function safeCapturedAt(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid capture date');
  const year = date.getUTCFullYear();
  if (year < 1800 || year > 2200) throw new HttpError(400, 'Capture date is outside the supported range');
  return date.toISOString();
}

function safeCaptureSource(value, capturedAt) {
  if (!capturedAt) return null;
  return CAPTURE_SOURCES.has(value) ? value : 'manual';
}

function safeRotation(value, fallback = 0) {
  if (value == null || value === '') return ROTATIONS.has(fallback) ? fallback : 0;
  const normalized = ((Number(value) % 360) + 360) % 360;
  if (!ROTATIONS.has(normalized)) throw new HttpError(400, 'Rotation must be 0, 90, 180 or 270 degrees');
  return normalized;
}

function publicCapture(entry) {
  return {
    capturedAt: entry?.capturedAt || null,
    capturedAtSource: entry?.capturedAtSource || null,
    rotation: safeRotation(entry?.rotation, 0),
    captureUpdatedAt: entry?.updatedAt || null,
  };
}

async function captureState(env) {
  const objects = await listObjects(env, CAPTURE_PREFIX);
  const entries = (await Promise.all(objects.map((object) => readJsonObject(env, object.key))))
    .filter((entry) => entry?.mediaId);
  const result = {};
  for (const entry of entries) result[entry.mediaId] = publicCapture(entry);
  return result;
}

async function enrichedLibraryState(request, env, ctx) {
  const response = await appWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  const data = await response.json();
  const captures = await captureState(env);
  if (!data.mediaMeta || typeof data.mediaMeta !== 'object') data.mediaMeta = {};
  for (const [mediaId, capture] of Object.entries(captures)) {
    data.mediaMeta[mediaId] = { ...(data.mediaMeta[mediaId] || {}), ...capture };
  }
  return json(data);
}

async function patchMediaMeta(request, env, ctx, mediaId) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid metadata');
  }

  const basePayload = {};
  for (const key of ['favorite', 'caption', 'eventDate']) {
    if (Object.hasOwn(body, key)) basePayload[key] = body[key];
  }
  const hasBaseFields = Object.keys(basePayload).length > 0;
  const hasCaptureFields = ['capturedAt', 'capturedAtSource', 'rotation'].some((key) => Object.hasOwn(body, key));

  let baseMeta = null;
  if (hasBaseFields) {
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    headers.set('accept', 'application/json');
    headers.delete('content-length');
    const delegated = new Request(request.url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(basePayload),
    });
    const response = await appWorker.fetch(delegated, env, ctx);
    if (!response.ok) return response;
    const data = await response.json();
    baseMeta = data?.meta || null;
  } else {
    const authFailure = await authenticateViaApp(request, env, ctx);
    if (authFailure) return authFailure;
  }

  if (!hasCaptureFields) {
    return json({ meta: baseMeta || {} });
  }

  if (!(await mediaExists(env, mediaId))) throw new HttpError(404, 'Media not found');

  const existing = await readJsonObject(env, captureKey(mediaId)) || {
    mediaId,
    capturedAt: null,
    capturedAtSource: null,
    rotation: 0,
  };

  const capturedAt = Object.hasOwn(body, 'capturedAt')
    ? safeCapturedAt(body.capturedAt)
    : existing.capturedAt || null;
  const capturedAtSource = Object.hasOwn(body, 'capturedAtSource')
    ? safeCaptureSource(body.capturedAtSource, capturedAt)
    : safeCaptureSource(existing.capturedAtSource, capturedAt);
  const rotation = Object.hasOwn(body, 'rotation')
    ? safeRotation(body.rotation, existing.rotation)
    : safeRotation(existing.rotation, 0);

  const next = {
    mediaId,
    capturedAt,
    capturedAtSource,
    rotation,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonObject(env, captureKey(mediaId), next);

  return json({ meta: { ...(baseMeta || {}), ...publicCapture(next) } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/api/library/state') {
        return await enrichedLibraryState(request, env, ctx);
      }

      let match = /^\/api\/library\/media\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === 'PATCH') {
        return await patchMediaMeta(request, env, ctx, idFromPath(match[1]));
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/media/')) {
        const response = await appWorker.fetch(request, env, ctx);
        if (response.ok) {
          const mediaId = idFromPath(url.pathname.slice('/api/media/'.length));
          const cleanup = env.MEDIA.delete(captureKey(mediaId));
          if (ctx?.waitUntil) ctx.waitUntil(cleanup);
          else await cleanup;
        }
        return response;
      }

      return appWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
