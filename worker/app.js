import baseWorker from './index.js';

const DATA_PREFIX = 'app-data/';
const COLLECTION_PREFIX = `${DATA_PREFIX}collections/`;
const MEMBERSHIP_PREFIX = `${DATA_PREFIX}collection-members/`;
const META_PREFIX = `${DATA_PREFIX}media-meta/`;
const UPLOAD_PREFIX = `${DATA_PREFIX}multipart/`;
const MAX_DIRECT_BYTES = 95 * 1024 * 1024;
const MAX_LARGE_BYTES = 5 * 1024 * 1024 * 1024;
const LARGE_PART_BYTES = 20 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const COLLECTION_KINDS = new Set(['moment', 'collection', 'theme']);
const COLLECTION_ICONS = new Set(['♡', '✦', '☾', '⚡', '✿', '∞']);

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

function decodeJwtPayload(assertion) {
  try {
    const payload = String(assertion || '').split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function authenticateLibrary(request, env, ctx) {
  // Reuse the canonical Worker authentication path. Unknown /api/library/*
  // requests return 404 only after Access JWT + exact-email verification.
  const probe = new Request(request.url, {
    method: 'GET',
    headers: request.headers,
  });
  const authResponse = await baseWorker.fetch(probe, env, ctx);
  if (authResponse.status !== 404) return { response: authResponse };

  const payload = decodeJwtPayload(request.headers.get('Cf-Access-Jwt-Assertion'));
  const email = typeof payload?.email === 'string' ? payload.email.toLowerCase() : '';
  if (!email) return { response: json({ error: 'Authenticated user identity unavailable' }, 401) };
  return { user: { email } };
}

function safeText(value, max = 240, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
  return cleaned || fallback;
}

function safeFilename(value) {
  return safeText(value, 240, 'media').replace(/[\\/]/g, '_');
}

function safeDate(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(400, 'Invalid date');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new HttpError(400, 'Invalid date');
  }
  return text;
}

function safeTone(value) {
  const tone = Number(value);
  if (!Number.isInteger(tone) || tone < 0 || tone > 5) return 0;
  return tone;
}

function safeIcon(value) {
  return COLLECTION_ICONS.has(value) ? value : '♡';
}

function safeKind(value) {
  return COLLECTION_KINDS.has(value) ? value : 'collection';
}

function validMediaType(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase();
  if ((!type.startsWith('image/') && !type.startsWith('video/')) || type === 'image/svg+xml') {
    throw new HttpError(415, 'Unsupported image or video type');
  }
  return type;
}

function idFromPath(value) {
  const id = decodeURIComponent(value || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid identifier');
  return id;
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

function collectionKey(id) {
  return `${COLLECTION_PREFIX}${id}.json`;
}

function membershipKey(collectionId, mediaId) {
  return `${MEMBERSHIP_PREFIX}${collectionId}/${mediaId}.json`;
}

function metaKey(mediaId) {
  return `${META_PREFIX}${mediaId}.json`;
}

function uploadKey(id) {
  return `${UPLOAD_PREFIX}${id}.json`;
}

async function mediaExists(env, id) {
  const row = await env.DB.prepare('SELECT id FROM media WHERE id = ?1 LIMIT 1').bind(id).first();
  return Boolean(row?.id);
}

async function libraryState(env) {
  const [collectionObjects, membershipObjects, metaObjects] = await Promise.all([
    listObjects(env, COLLECTION_PREFIX),
    listObjects(env, MEMBERSHIP_PREFIX),
    listObjects(env, META_PREFIX),
  ]);

  const collections = (await Promise.all(
    collectionObjects.map((object) => readJsonObject(env, object.key)),
  )).filter((entry) => entry?.id && entry?.name);

  const memberships = (await Promise.all(
    membershipObjects.map((object) => readJsonObject(env, object.key)),
  )).filter((entry) => entry?.collectionId && entry?.mediaId);

  const metaEntries = (await Promise.all(
    metaObjects.map((object) => readJsonObject(env, object.key)),
  )).filter((entry) => entry?.mediaId);

  const membersByCollection = new Map();
  for (const membership of memberships) {
    const list = membersByCollection.get(membership.collectionId) || [];
    list.push(membership);
    membersByCollection.set(membership.collectionId, list);
  }

  for (const collection of collections) {
    const members = (membersByCollection.get(collection.id) || [])
      .sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
    collection.mediaIds = members.map((entry) => entry.mediaId);
    collection.itemCount = collection.mediaIds.length;
    collection.coverMediaId = collection.mediaIds[0] || null;
  }

  collections.sort((a, b) => {
    const aDate = a.eventDate || a.createdAt || '';
    const bDate = b.eventDate || b.createdAt || '';
    return String(bDate).localeCompare(String(aDate));
  });

  const mediaMeta = {};
  for (const entry of metaEntries) {
    mediaMeta[entry.mediaId] = {
      favorite: entry.favorite === true,
      caption: safeText(entry.caption, 1200, ''),
      eventDate: entry.eventDate || null,
      updatedAt: entry.updatedAt || null,
    };
  }

  return json({ collections, mediaMeta });
}

function collectionFromBody(body, previous = null) {
  const now = new Date().toISOString();
  const name = Object.hasOwn(body || {}, 'name')
    ? safeText(body.name, 80, '')
    : previous?.name || '';
  if (!name) throw new HttpError(400, 'Collection name is required');

  return {
    id: previous?.id || crypto.randomUUID(),
    name,
    kind: Object.hasOwn(body || {}, 'kind') ? safeKind(body.kind) : previous?.kind || 'collection',
    description: Object.hasOwn(body || {}, 'description')
      ? safeText(body.description, 500, '')
      : previous?.description || '',
    eventDate: Object.hasOwn(body || {}, 'eventDate') ? safeDate(body.eventDate) : previous?.eventDate || null,
    icon: Object.hasOwn(body || {}, 'icon') ? safeIcon(body.icon) : previous?.icon || '♡',
    tone: Object.hasOwn(body || {}, 'tone') ? safeTone(body.tone) : safeTone(previous?.tone),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}

async function createCollection(request, env) {
  const body = await request.json().catch(() => null);
  const collection = collectionFromBody(body || {});
  await writeJsonObject(env, collectionKey(collection.id), collection);
  return json({ collection: { ...collection, mediaIds: [], itemCount: 0, coverMediaId: null } }, 201);
}

async function updateCollection(request, env, id) {
  const existing = await readJsonObject(env, collectionKey(id));
  if (!existing) throw new HttpError(404, 'Collection not found');
  const body = await request.json().catch(() => null);
  const collection = collectionFromBody(body || {}, existing);
  await writeJsonObject(env, collectionKey(id), collection);
  return json({ collection });
}

async function deleteCollection(env, id) {
  const existing = await readJsonObject(env, collectionKey(id));
  if (!existing) throw new HttpError(404, 'Collection not found');

  const members = await listObjects(env, `${MEMBERSHIP_PREFIX}${id}/`);
  for (const object of members) await env.MEDIA.delete(object.key);
  await env.MEDIA.delete(collectionKey(id));
  return json({ ok: true, id });
}

async function setCollectionMembership(env, collectionId, mediaId, enabled) {
  const collection = await readJsonObject(env, collectionKey(collectionId));
  if (!collection) throw new HttpError(404, 'Collection not found');
  if (!(await mediaExists(env, mediaId))) throw new HttpError(404, 'Media not found');

  const key = membershipKey(collectionId, mediaId);
  if (enabled) {
    await writeJsonObject(env, key, {
      collectionId,
      mediaId,
      addedAt: new Date().toISOString(),
    });
  } else {
    await env.MEDIA.delete(key);
  }
  return json({ ok: true, collectionId, mediaId, enabled });
}

async function updateMediaMeta(request, env, mediaId) {
  if (!(await mediaExists(env, mediaId))) throw new HttpError(404, 'Media not found');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid metadata');

  const existing = await readJsonObject(env, metaKey(mediaId)) || {
    mediaId,
    favorite: false,
    caption: '',
    eventDate: null,
  };

  const next = {
    mediaId,
    favorite: Object.hasOwn(body, 'favorite') ? body.favorite === true : existing.favorite === true,
    caption: Object.hasOwn(body, 'caption') ? safeText(body.caption, 1200, '') : safeText(existing.caption, 1200, ''),
    eventDate: Object.hasOwn(body, 'eventDate') ? safeDate(body.eventDate) : existing.eventDate || null,
    updatedAt: new Date().toISOString(),
  };

  await writeJsonObject(env, metaKey(mediaId), next);
  return json({ meta: next });
}

async function cleanupDeletedMedia(env, mediaId) {
  try {
    await env.MEDIA.delete(metaKey(mediaId));
    const memberships = await listObjects(env, MEMBERSHIP_PREFIX);
    const suffix = `/${mediaId}.json`;
    for (const object of memberships) {
      if (object.key.endsWith(suffix)) await env.MEDIA.delete(object.key);
    }
  } catch {
    // Best effort organization cleanup. The media bytes/index are already deleted.
  }
}

function publicMedia(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    url: `/media/${encodeURIComponent(row.id)}`,
  };
}

async function startLargeUpload(request, env, user) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid upload request');

  const originalName = safeFilename(body.name);
  const contentType = validMediaType(body.contentType);
  const sizeBytes = Number(body.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= MAX_DIRECT_BYTES) {
    throw new HttpError(400, 'Multipart upload is only for files above 95 MB');
  }
  if (sizeBytes > MAX_LARGE_BYTES) throw new HttpError(413, 'File exceeds the 5 GB NaughtyShare limit');

  const id = crypto.randomUUID();
  const now = new Date();
  const objectKey = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
  const multipart = await env.MEDIA.createMultipartUpload(objectKey, {
    httpMetadata: {
      contentType,
      cacheControl: 'private, no-store',
    },
  });

  const state = {
    id,
    uploadId: multipart.uploadId,
    objectKey,
    originalName,
    contentType,
    sizeBytes,
    uploadedBy: user.email,
    createdAt: now.toISOString(),
    expiresAt: Date.now() + UPLOAD_TTL_MS,
  };
  await writeJsonObject(env, uploadKey(id), state);

  return json({
    id,
    partSizeBytes: LARGE_PART_BYTES,
    maxBytes: MAX_LARGE_BYTES,
  }, 201);
}

async function loadUploadState(env, user, id) {
  const state = await readJsonObject(env, uploadKey(id));
  if (!state) throw new HttpError(404, 'Upload session not found');
  if (state.uploadedBy !== user.email) throw new HttpError(403, 'Upload session belongs to another user');
  if (!Number.isFinite(state.expiresAt) || state.expiresAt <= Date.now()) {
    try {
      const multipart = env.MEDIA.resumeMultipartUpload(state.objectKey, state.uploadId);
      await multipart.abort();
    } catch {
      // Best effort expiration cleanup.
    }
    await env.MEDIA.delete(uploadKey(id));
    throw new HttpError(410, 'Upload session expired');
  }
  return state;
}

async function uploadLargePart(request, env, user, id, rawPartNumber) {
  const state = await loadUploadState(env, user, id);
  const partNumber = Number(rawPartNumber);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new HttpError(400, 'Invalid part number');
  }
  if (!request.body) throw new HttpError(400, 'Empty upload part');

  const declared = Number(request.headers.get('content-length') || request.headers.get('x-part-size') || 0);
  if (declared > LARGE_PART_BYTES) throw new HttpError(413, 'Upload part exceeds the configured part size');

  const multipart = env.MEDIA.resumeMultipartUpload(state.objectKey, state.uploadId);
  const part = await multipart.uploadPart(partNumber, request.body);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

async function completeLargeUpload(request, env, user, id) {
  const state = await loadUploadState(env, user, id);
  const body = await request.json().catch(() => null);
  const rawParts = Array.isArray(body?.parts) ? body.parts : [];
  if (!rawParts.length || rawParts.length > 10000) throw new HttpError(400, 'Invalid multipart completion');

  const seen = new Set();
  const parts = rawParts.map((entry) => {
    const partNumber = Number(entry?.partNumber);
    const etag = safeText(entry?.etag, 200, '');
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !etag || seen.has(partNumber)) {
      throw new HttpError(400, 'Invalid multipart completion');
    }
    seen.add(partNumber);
    return { partNumber, etag };
  }).sort((a, b) => a.partNumber - b.partNumber);

  const multipart = env.MEDIA.resumeMultipartUpload(state.objectKey, state.uploadId);
  await multipart.complete(parts);
  const stored = await env.MEDIA.head(state.objectKey);
  if (!stored) throw new HttpError(500, 'R2 did not commit the multipart upload');
  if (Number(stored.size) !== Number(state.sizeBytes)) {
    await env.MEDIA.delete(state.objectKey);
    await env.MEDIA.delete(uploadKey(id));
    throw new HttpError(400, 'Uploaded file size does not match the selected file');
  }

  const row = {
    id: state.id,
    object_key: state.objectKey,
    original_name: state.originalName,
    content_type: state.contentType,
    size_bytes: stored.size,
    uploaded_by: state.uploadedBy,
    created_at: state.createdAt,
  };

  try {
    await env.DB.prepare(
      `INSERT INTO media (
        id, object_key, original_name, content_type, size_bytes, uploaded_by, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      row.id,
      row.object_key,
      row.original_name,
      row.content_type,
      row.size_bytes,
      row.uploaded_by,
      row.created_at,
    ).run();
  } catch (error) {
    await env.MEDIA.delete(state.objectKey);
    throw error;
  } finally {
    await env.MEDIA.delete(uploadKey(id));
  }

  return json({ item: publicMedia(row) }, 201);
}

async function abortLargeUpload(env, user, id) {
  const state = await readJsonObject(env, uploadKey(id));
  if (!state) return json({ ok: true, id });
  if (state.uploadedBy !== user.email) throw new HttpError(403, 'Upload session belongs to another user');

  try {
    const multipart = env.MEDIA.resumeMultipartUpload(state.objectKey, state.uploadId);
    await multipart.abort();
  } catch {
    // Best effort abort; the upload will expire server-side if already gone.
  }
  await env.MEDIA.delete(uploadKey(id));
  return json({ ok: true, id });
}

async function handleLibrary(request, env, ctx, user) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/library/state') return libraryState(env);
  if (request.method === 'POST' && path === '/api/library/collections') return createCollection(request, env);
  if (request.method === 'POST' && path === '/api/library/uploads') return startLargeUpload(request, env, user);

  let match = /^\/api\/library\/collections\/([^/]+)$/.exec(path);
  if (match) {
    const id = idFromPath(match[1]);
    if (request.method === 'PATCH') return updateCollection(request, env, id);
    if (request.method === 'DELETE') return deleteCollection(env, id);
  }

  match = /^\/api\/library\/collections\/([^/]+)\/items\/([^/]+)$/.exec(path);
  if (match) {
    const collectionId = idFromPath(match[1]);
    const mediaId = idFromPath(match[2]);
    if (request.method === 'PUT') return setCollectionMembership(env, collectionId, mediaId, true);
    if (request.method === 'DELETE') return setCollectionMembership(env, collectionId, mediaId, false);
  }

  match = /^\/api\/library\/media\/([^/]+)$/.exec(path);
  if (match && request.method === 'PATCH') {
    return updateMediaMeta(request, env, idFromPath(match[1]));
  }

  match = /^\/api\/library\/uploads\/([^/]+)\/parts\/(\d+)$/.exec(path);
  if (match && request.method === 'PUT') {
    return uploadLargePart(request, env, user, idFromPath(match[1]), match[2]);
  }

  match = /^\/api\/library\/uploads\/([^/]+)\/complete$/.exec(path);
  if (match && request.method === 'POST') {
    return completeLargeUpload(request, env, user, idFromPath(match[1]));
  }

  match = /^\/api\/library\/uploads\/([^/]+)$/.exec(path);
  if (match && request.method === 'DELETE') {
    return abortLargeUpload(env, user, idFromPath(match[1]));
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/library/')) {
      try {
        const auth = await authenticateLibrary(request, env, ctx);
        if (auth.response) return auth.response;
        return await handleLibrary(request, env, ctx, auth.user);
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/media/')) {
      const response = await baseWorker.fetch(request, env, ctx);
      if (response.ok) {
        const id = decodeURIComponent(url.pathname.slice('/api/media/'.length));
        if (id) {
          if (ctx?.waitUntil) ctx.waitUntil(cleanupDeletedMedia(env, id));
          else await cleanupDeletedMedia(env, id);
        }
      }
      return response;
    }

    return baseWorker.fetch(request, env, ctx);
  },
};
