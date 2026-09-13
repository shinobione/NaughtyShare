const DERIVATIVE_PREFIX = 'app-data/v1/compat-video/';
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_OUTPUT_SECONDS = 60;
const MAX_BUFFERED_OUTPUT_BYTES = 64 * 1024 * 1024;
const OUTPUT_CONTENT_TYPE = 'video/mp4';

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
  return seconds;
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
    contentType: OUTPUT_CONTENT_TYPE,
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
      contentType: OUTPUT_CONTENT_TYPE,
    });
  }

  const source = await env.MEDIA.get(row.object_key);
  if (!source || !('body' in source)) throw httpError(404, 'Source video object not found');

  let transformedResponse;
  try {
    const result = env.VIDEO_TRANSFORM
      .input(source.body)
      .output({
        mode: 'video',
        time: '0s',
        audio: true,
      });

    transformedResponse = await result.response();
  } catch (error) {
    const detail = Number.isFinite(Number(error?.code))
      ? `Media Transformations error ${error.code}`
      : 'Media Transformations failed';
    throw httpError(502, `${detail}: ${error?.message || 'unknown error'}`);
  }

  if (!transformedResponse?.ok) {
    const detail = await transformedResponse?.text().catch(() => '');
    throw httpError(
      502,
      `Media Transformations returned HTTP ${transformedResponse?.status || '?'}${detail ? `: ${detail.slice(0, 240)}` : ''}`,
    );
  }
  if (!transformedResponse.body) throw httpError(502, 'Media Transformations returned an empty response body');

  const transformedContentType = (
    transformedResponse.headers.get('content-type') || OUTPUT_CONTENT_TYPE
  ).split(';')[0].trim() || OUTPUT_CONTENT_TYPE;

  const declaredLength = Number(transformedResponse.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BUFFERED_OUTPUT_BYTES) {
    throw httpError(413, 'Compatibility derivative exceeds the 64 MB buffered POC limit');
  }

  let transformedBytes;
  try {
    // The Media Transformations beta currently yields an ordinary ReadableStream.
    // R2 rejects that stream because it does not carry a known length, even when
    // obtained from result.response(). Buffering converts it to an ArrayBuffer,
    // which is an accepted fixed-size R2 put value for this deliberately short POC.
    transformedBytes = await transformedResponse.arrayBuffer();
  } catch (error) {
    throw httpError(502, `Compatibility derivative buffering failed: ${error?.message || 'unknown error'}`);
  }

  if (!transformedBytes.byteLength) {
    throw httpError(502, 'Media Transformations returned an empty compatibility derivative');
  }
  if (transformedBytes.byteLength > MAX_BUFFERED_OUTPUT_BYTES) {
    throw httpError(413, 'Compatibility derivative exceeds the 64 MB buffered POC limit');
  }

  let stored;
  try {
    stored = await env.MEDIA.put(key, transformedBytes, {
      httpMetadata: {
        contentType: transformedContentType,
        cacheControl: 'private, no-store',
      },
      customMetadata: {
        sourceMediaId: mediaId,
        sourceObjectKey: String(row.object_key).slice(0, 1024),
        sourceContentType: String(row.content_type || '').slice(0, 128),
        generatedAt: new Date().toISOString(),
        transform: `h264-aac-full-short-video-${durationSeconds.toFixed(3)}s`,
        bufferedBytes: String(transformedBytes.byteLength),
      },
    });
  } catch (error) {
    throw httpError(502, `R2 derivative storage failed: ${error?.message || 'unknown error'}`);
  }

  if (!stored) throw httpError(502, 'R2 derivative storage failed: object was not stored');

  return json({
    ok: true,
    mediaId,
    state: 'ready',
    created: true,
    url: `/compat-media/${encodeURIComponent(mediaId)}`,
    sizeBytes: Number(stored.size || transformedBytes.byteLength || 0),
    contentType: transformedContentType,
  }, 201);
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
