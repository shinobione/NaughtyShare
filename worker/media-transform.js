const DERIVATIVE_PREFIX = 'app-data/v1/compat-video/';
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_OUTPUT_SECONDS = 60;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
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

function derivativeKey(mediaId) {
  return `${DERIVATIVE_PREFIX}${mediaId}.mp4`;
}

async function mediaRow(env, mediaId) {
  return env.DB.prepare(
    `SELECT id, object_key, original_name, content_type, size_bytes
     FROM media
     WHERE id = ?1
     LIMIT 1`,
  ).bind(mediaId).first();
}

function parseDurationSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_OUTPUT_SECONDS) {
    throw httpError(422, 'Media Transformations POC requires a video duration between 1 and 60 seconds');
  }
  return Math.max(1, Math.ceil(seconds));
}

export async function getCompatDerivative(env, mediaId) {
  const row = await mediaRow(env, mediaId);
  if (!row) throw httpError(404, 'Media not found');
  if (!String(row.content_type || '').startsWith('video/')) {
    throw httpError(415, 'Only videos can use the compatibility derivative');
  }

  const object = await env.MEDIA.head(derivativeKey(mediaId));
  if (!object) throw httpError(404, 'No compatibility derivative for this media');

  return json({
    ok: true,
    mediaId,
    state: 'ready',
    url: `/compat-media/${encodeURIComponent(mediaId)}`,
    sizeBytes: Number(object.size || 0),
    contentType: object.httpMetadata?.contentType || 'video/mp4',
  });
}

export async function createCompatDerivative(request, env, mediaId) {
  if (!env.VIDEO_TRANSFORM) throw httpError(503, 'Cloudflare Media Transformations binding is not configured');

  const row = await mediaRow(env, mediaId);
  if (!row) throw httpError(404, 'Media not found');
  if (!String(row.content_type || '').startsWith('video/')) {
    throw httpError(415, 'Only videos can use the compatibility derivative');
  }

  const sizeBytes = Number(row.size_bytes || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw httpError(409, 'Video size is unavailable');
  if (sizeBytes >= MAX_INPUT_BYTES) {
    throw httpError(413, 'Media Transformations POC requires a source video smaller than 100 MB');
  }

  const body = await request.json().catch(() => null);
  const durationSeconds = parseDurationSeconds(body?.durationSeconds);
  const key = derivativeKey(mediaId);

  const existing = await env.MEDIA.head(key);
  if (existing) {
    return json({
      ok: true,
      mediaId,
      state: 'ready',
      created: false,
      url: `/compat-media/${encodeURIComponent(mediaId)}`,
      sizeBytes: Number(existing.size || 0),
    });
  }

  const source = await env.MEDIA.get(row.object_key);
  if (!source || !('body' in source)) throw httpError(404, 'Source video object not found');

  try {
    const result = env.VIDEO_TRANSFORM
      .input(source.body)
      .output({
        mode: 'video',
        time: '0s',
        duration: `${durationSeconds}s`,
        audio: true,
      });

    const [media, contentType] = await Promise.all([
      result.media(),
      result.contentType(),
    ]);

    const stored = await env.MEDIA.put(key, media, {
      httpMetadata: {
        contentType: contentType || 'video/mp4',
        cacheControl: 'private, no-store',
      },
      customMetadata: {
        sourceMediaId: mediaId,
        sourceObjectKey: String(row.object_key).slice(0, 1024),
        sourceContentType: String(row.content_type || '').slice(0, 128),
        generatedAt: new Date().toISOString(),
        transform: `h264-aac-${durationSeconds}s`,
      },
    });

    if (!stored) throw httpError(502, 'Compatibility derivative was not stored');

    return json({
      ok: true,
      mediaId,
      state: 'ready',
      created: true,
      url: `/compat-media/${encodeURIComponent(mediaId)}`,
      sizeBytes: Number(stored.size || 0),
      contentType: contentType || 'video/mp4',
    }, 201);
  } catch (error) {
    if (Number.isInteger(error?.status)) throw error;
    const detail = Number.isFinite(Number(error?.code))
      ? `Media Transformations error ${error.code}`
      : 'Media Transformations failed';
    throw httpError(502, `${detail}: ${error?.message || 'unknown error'}`);
  }
}

export async function cleanupCompatDerivative(env, mediaId) {
  await env.MEDIA.delete(derivativeKey(mediaId));
}

export async function derivativeObject(env, mediaId) {
  return env.MEDIA.get(derivativeKey(mediaId));
}

export async function derivativeHead(env, mediaId) {
  return env.MEDIA.head(derivativeKey(mediaId));
}
