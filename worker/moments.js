import captureWorker from './capture.js';

const MOMENTS_UI_KEY = 'app-data/moments-ui.json';

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
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  return json({ error: 'Internal server error' }, 500);
}

function safeId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid identifier');
  return id;
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

async function authenticateViaCapture(request, env, ctx) {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = '/api/library/__moments-auth-probe';
  probeUrl.search = '';
  const probe = new Request(probeUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await captureWorker.fetch(probe, env, ctx);
  if (response.status === 404) return null;
  return response;
}

async function getLibraryData(request, env, ctx) {
  const stateUrl = new URL(request.url);
  stateUrl.pathname = '/api/library/state';
  stateUrl.search = '';
  const stateRequest = new Request(stateUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await captureWorker.fetch(stateRequest, env, ctx);
  if (!response.ok) return { response };
  return { data: await response.json() };
}

function normalizePrefs(raw, collections) {
  const existingCollections = Array.isArray(collections) ? collections : [];
  const ids = existingCollections.map((entry) => entry?.id).filter(Boolean);
  const allowed = new Set(ids);
  const requestedOrder = Array.isArray(raw?.collectionOrder) ? raw.collectionOrder : [];
  const order = [];
  const seen = new Set();
  for (const value of requestedOrder) {
    const id = String(value || '');
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of ids) {
    if (!seen.has(id)) order.push(id);
  }

  const covers = {};
  const rawCovers = raw?.covers && typeof raw.covers === 'object' && !Array.isArray(raw.covers)
    ? raw.covers
    : {};
  for (const collection of existingCollections) {
    const mediaId = rawCovers[collection.id];
    if (typeof mediaId !== 'string') continue;
    if ((collection.mediaIds || []).includes(mediaId)) covers[collection.id] = mediaId;
  }

  return {
    collectionOrder: order,
    covers,
    updatedAt: raw?.updatedAt || null,
  };
}

async function readPrefs(env, collections) {
  return normalizePrefs(await readJsonObject(env, MOMENTS_UI_KEY), collections);
}

function applyPrefsToState(data, prefs) {
  const collections = Array.isArray(data?.collections) ? data.collections : [];
  const orderIndex = new Map(prefs.collectionOrder.map((id, index) => [id, index]));

  for (const collection of collections) {
    const requested = prefs.covers[collection.id];
    if (requested && (collection.mediaIds || []).includes(requested)) {
      collection.coverMediaId = requested;
    }
    collection.uiOrder = orderIndex.get(collection.id) ?? Number.MAX_SAFE_INTEGER;
  }

  collections.sort((a, b) => {
    const aOrder = orderIndex.get(a.id);
    const bOrder = orderIndex.get(b.id);
    if (aOrder != null || bOrder != null) {
      if (aOrder == null) return 1;
      if (bOrder == null) return -1;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    const aDate = a.eventDate || a.createdAt || '';
    const bDate = b.eventDate || b.createdAt || '';
    return String(bDate).localeCompare(String(aDate));
  });

  data.collections = collections;
  data.momentsUi = prefs;
  return data;
}

async function enrichedLibraryState(request, env, ctx) {
  const response = await captureWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  const data = await response.json();
  const prefs = await readPrefs(env, data.collections);
  return json(applyPrefsToState(data, prefs));
}

async function getPrefs(request, env, ctx) {
  const authFailure = await authenticateViaCapture(request, env, ctx);
  if (authFailure) return authFailure;
  const state = await getLibraryData(request, env, ctx);
  if (state.response) return state.response;
  return json(await readPrefs(env, state.data.collections));
}

async function patchPrefs(request, env, ctx) {
  const authFailure = await authenticateViaCapture(request, env, ctx);
  if (authFailure) return authFailure;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid moments UI metadata');
  }

  const state = await getLibraryData(request, env, ctx);
  if (state.response) return state.response;
  const collections = Array.isArray(state.data.collections) ? state.data.collections : [];
  const byId = new Map(collections.map((entry) => [entry.id, entry]));
  const current = await readPrefs(env, collections);

  let collectionOrder = current.collectionOrder;
  if (Object.hasOwn(body, 'collectionOrder')) {
    if (!Array.isArray(body.collectionOrder)) throw new HttpError(400, 'collectionOrder must be an array');
    const requested = [];
    const seen = new Set();
    for (const value of body.collectionOrder) {
      const id = safeId(value);
      if (!byId.has(id) || seen.has(id)) continue;
      seen.add(id);
      requested.push(id);
    }
    for (const collection of collections) {
      if (!seen.has(collection.id)) requested.push(collection.id);
    }
    collectionOrder = requested;
  }

  const covers = { ...current.covers };
  if (Object.hasOwn(body, 'covers')) {
    if (!body.covers || typeof body.covers !== 'object' || Array.isArray(body.covers)) {
      throw new HttpError(400, 'covers must be an object');
    }
    for (const [rawCollectionId, rawMediaId] of Object.entries(body.covers)) {
      const collectionId = safeId(rawCollectionId);
      const collection = byId.get(collectionId);
      if (!collection) continue;
      if (rawMediaId == null || rawMediaId === '') {
        delete covers[collectionId];
        continue;
      }
      const mediaId = safeId(rawMediaId);
      if (!(collection.mediaIds || []).includes(mediaId)) {
        throw new HttpError(400, 'Cover media must belong to the collection');
      }
      covers[collectionId] = mediaId;
    }
  }

  const next = normalizePrefs({
    collectionOrder,
    covers,
    updatedAt: new Date().toISOString(),
  }, collections);
  next.updatedAt = new Date().toISOString();
  await writeJsonObject(env, MOMENTS_UI_KEY, next);
  return json(next);
}

async function cleanupCollectionPref(env, collectionId) {
  const raw = await readJsonObject(env, MOMENTS_UI_KEY);
  if (!raw) return;
  const order = Array.isArray(raw.collectionOrder)
    ? raw.collectionOrder.filter((id) => id !== collectionId)
    : [];
  const covers = raw.covers && typeof raw.covers === 'object' ? { ...raw.covers } : {};
  delete covers[collectionId];
  await writeJsonObject(env, MOMENTS_UI_KEY, {
    collectionOrder: order,
    covers,
    updatedAt: new Date().toISOString(),
  });
}

async function cleanupMediaCover(env, mediaId) {
  const raw = await readJsonObject(env, MOMENTS_UI_KEY);
  if (!raw?.covers || typeof raw.covers !== 'object') return;
  const covers = { ...raw.covers };
  let changed = false;
  for (const [collectionId, coverId] of Object.entries(covers)) {
    if (coverId === mediaId) {
      delete covers[collectionId];
      changed = true;
    }
  }
  if (!changed) return;
  await writeJsonObject(env, MOMENTS_UI_KEY, {
    collectionOrder: Array.isArray(raw.collectionOrder) ? raw.collectionOrder : [],
    covers,
    updatedAt: new Date().toISOString(),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/api/library/state') {
        return await enrichedLibraryState(request, env, ctx);
      }

      if (url.pathname === '/api/library/moments-ui') {
        if (request.method === 'GET') return await getPrefs(request, env, ctx);
        if (request.method === 'PATCH') return await patchPrefs(request, env, ctx);
      }

      const collectionDelete = /^\/api\/library\/collections\/([^/]+)$/.exec(url.pathname);
      if (collectionDelete && request.method === 'DELETE') {
        const collectionId = safeId(decodeURIComponent(collectionDelete[1]));
        const response = await captureWorker.fetch(request, env, ctx);
        if (response.ok) {
          const cleanup = cleanupCollectionPref(env, collectionId);
          if (ctx?.waitUntil) ctx.waitUntil(cleanup);
          else await cleanup;
        }
        return response;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/media/')) {
        const mediaId = safeId(decodeURIComponent(url.pathname.slice('/api/media/'.length)));
        const response = await captureWorker.fetch(request, env, ctx);
        if (response.ok) {
          const cleanup = cleanupMediaCover(env, mediaId);
          if (ctx?.waitUntil) ctx.waitUntil(cleanup);
          else await cleanup;
        }
        return response;
      }

      return captureWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
