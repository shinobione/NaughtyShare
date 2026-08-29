const STREAM_INDEX_KEY = 'app-data/v1/stream-derivatives.json';
const STREAM_POC_MAX_BYTES = 200 * 1024 * 1024;
const STREAM_POC_MAX_DURATION_SECONDS = 60 * 60;
const STREAM_UPLOAD_TTL_MS = 30 * 60 * 1000;

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

async function readIndex(env) {
  const object = await env.MEDIA.get(STREAM_INDEX_KEY);
  if (!object || !('body' in object)) return {};
  try {
    const data = JSON.parse(await object.text());
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

async function writeIndex(env, index) {
  await env.MEDIA.put(STREAM_INDEX_KEY, JSON.stringify(index), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, no-store',
    },
  });
}

async function mediaRow(env, mediaId) {
  return env.DB.prepare(
    `SELECT id, original_name, content_type, size_bytes
     FROM media
     WHERE id = ?1
     LIMIT 1`,
  ).bind(mediaId).first();
}

function signedHlsUrl(video, token) {
  const raw = String(video?.hlsPlaybackUrl || '');
  if (!raw || !token) throw httpError(502, 'Stream playback URL unavailable');
  const url = new URL(raw);
  const marker = `/${video.id}/`;
  if (!url.pathname.includes(marker)) throw httpError(502, 'Unexpected Stream playback URL');
  url.pathname = url.pathname.replace(marker, `/${token}/`);
  return url.toString();
}

function publicState(details, entry) {
  const state = String(details?.status?.state || '');
  if (details?.readyToStream || state === 'ready') return 'ready';
  if (state === 'error') return 'error';
  if (entry?.uploadExpiresAt && Date.parse(entry.uploadExpiresAt) <= Date.now() && !details?.uploaded) return 'expired';
  return 'processing';
}

async function detailsFor(env, uid) {
  try {
    return await env.STREAM.video(uid).details();
  } catch (error) {
    if (error?.name === 'NotFoundError') return null;
    throw error;
  }
}

export async function getStreamDerivative(env, mediaId) {
  if (!env.STREAM) throw httpError(503, 'Cloudflare Stream is not configured');
  const index = await readIndex(env);
  const entry = index[mediaId];
  if (!entry?.uid) throw httpError(404, 'No Stream derivative for this media');

  const details = await detailsFor(env, entry.uid);
  if (!details) {
    delete index[mediaId];
    await writeIndex(env, index);
    throw httpError(404, 'No Stream derivative for this media');
  }

  const state = publicState(details, entry);
  if (state === 'ready') {
    const token = await env.STREAM.video(entry.uid).generateToken();
    if (entry.uploadUrl) {
      index[mediaId] = { ...entry, uploadUrl: null, updatedAt: new Date().toISOString() };
      await writeIndex(env, index);
    }
    return json({
      ok: true,
      mediaId,
      state,
      hlsUrl: signedHlsUrl(details, token),
      durationSeconds: Number.isFinite(details.duration) ? details.duration : null,
    });
  }

  if (state === 'error') {
    return json({
      ok: false,
      mediaId,
      state,
      errorCode: details?.status?.errorReasonCode || null,
      error: details?.status?.errorReasonText || 'Stream encoding failed',
    }, 409);
  }

  return json({
    ok: true,
    mediaId,
    state,
    pctComplete: details?.status?.pctComplete || null,
  });
}

export async function provisionStreamDerivative(request, env, mediaId) {
  if (!env.STREAM) throw httpError(503, 'Cloudflare Stream is not configured');

  const row = await mediaRow(env, mediaId);
  if (!row) throw httpError(404, 'Media not found');
  if (!String(row.content_type || '').startsWith('video/')) throw httpError(415, 'Only videos can use Stream playback');
  const sizeBytes = Number(row.size_bytes || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw httpError(409, 'Video size is unavailable');
  if (sizeBytes > STREAM_POC_MAX_BYTES) {
    throw httpError(413, 'Stream POC is limited to videos of 200 MB or less');
  }

  const index = await readIndex(env);
  const existing = index[mediaId];
  if (existing?.uid) {
    const details = await detailsFor(env, existing.uid);
    if (details) {
      const state = publicState(details, existing);
      if (state === 'ready') {
        return json({ ok: true, mediaId, state: 'ready', uploadRequired: false });
      }
      if (
        existing.uploadUrl &&
        existing.uploadExpiresAt &&
        Date.parse(existing.uploadExpiresAt) > Date.now() &&
        state !== 'error'
      ) {
        return json({
          ok: true,
          mediaId,
          state,
          uploadRequired: true,
          uploadUrl: existing.uploadUrl,
          uploadExpiresAt: existing.uploadExpiresAt,
          maxBytes: STREAM_POC_MAX_BYTES,
        });
      }
      try {
        await env.STREAM.video(existing.uid).delete();
      } catch {
        // Best-effort cleanup before reprovisioning a failed/expired POC derivative.
      }
      delete index[mediaId];
    }
  }

  const uploadExpiresAt = new Date(Date.now() + STREAM_UPLOAD_TTL_MS).toISOString();
  const direct = await env.STREAM.createDirectUpload({
    maxDurationSeconds: STREAM_POC_MAX_DURATION_SECONDS,
    expiry: uploadExpiresAt,
    creator: 'naughtyshare',
    meta: {
      naughtyShareMediaId: mediaId,
      originalName: String(row.original_name || '').slice(0, 240),
    },
    requireSignedURLs: true,
  });

  if (!direct?.id || !direct?.uploadURL) throw httpError(502, 'Stream direct upload could not be provisioned');

  index[mediaId] = {
    uid: direct.id,
    uploadUrl: direct.uploadURL,
    uploadExpiresAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeIndex(env, index);

  return json({
    ok: true,
    mediaId,
    state: 'pendingupload',
    uploadRequired: true,
    uploadUrl: direct.uploadURL,
    uploadExpiresAt,
    maxBytes: STREAM_POC_MAX_BYTES,
  }, 201);
}

export async function cleanupStreamDerivative(env, mediaId) {
  if (!env.STREAM) return;
  const index = await readIndex(env);
  const entry = index[mediaId];
  if (!entry?.uid) return;

  try {
    await env.STREAM.video(entry.uid).delete();
  } catch {
    // Media deletion must not be blocked by best-effort derivative cleanup.
  }

  delete index[mediaId];
  await writeIndex(env, index);
}
