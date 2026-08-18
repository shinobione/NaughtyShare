import { createRemoteJWKSet, jwtVerify } from 'jose';

const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const MEDIA_TYPES = ['image/', 'video/'];
const BLOCKED_MEDIA_TYPES = new Set(['image/svg+xml']);
const jwksByIssuer = new Map();

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

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new HttpError(503, `Missing server configuration: ${key}`);
  return value;
}

function normalizeIssuer(teamDomain) {
  const raw = teamDomain.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  return url.origin;
}

function allowedEmails(env) {
  return new Set(
    required(env, 'ALLOWED_EMAILS')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function authenticate(request, env) {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) throw new HttpError(401, 'Missing Cloudflare Access assertion');

  const issuer = normalizeIssuer(required(env, 'ACCESS_TEAM_DOMAIN'));
  const audience = required(env, 'ACCESS_AUD');

  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(assertion, jwks, {
      issuer,
      audience,
    }));
  } catch {
    throw new HttpError(401, 'Invalid Cloudflare Access assertion');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  if (!email || !allowedEmails(env).has(email)) {
    throw new HttpError(403, 'User is not allowed in this vault');
  }

  return { email, subject: payload.sub ?? null };
}

function safeFilename(raw) {
  let decoded = raw || 'media';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the raw value if percent-decoding fails.
  }

  return decoded
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 240) || 'media';
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

async function health(env, user) {
  await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM media').first(),
    env.MEDIA.list({ limit: 1 }),
  ]);

  return json({
    ok: true,
    user: user.email,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    googlePhotosPicker: false,
  });
}

async function listMedia(env) {
  const result = await env.DB.prepare(
    `SELECT id, original_name, content_type, size_bytes, uploaded_by, created_at
     FROM media
     ORDER BY created_at DESC
     LIMIT 200`,
  ).all();

  return json({ items: (result.results ?? []).map(publicMedia) });
}

async function uploadMedia(request, env, user) {
  if (!request.body) throw new HttpError(400, 'Empty upload');

  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (
    !MEDIA_TYPES.some((prefix) => contentType.startsWith(prefix)) ||
    BLOCKED_MEDIA_TYPES.has(contentType)
  ) {
    throw new HttpError(415, 'Unsupported image or video type');
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'File exceeds the 95 MB direct-upload limit');
  }

  const originalName = safeFilename(request.headers.get('x-file-name'));
  const id = crypto.randomUUID();
  const now = new Date();
  const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;

  const stored = await env.MEDIA.put(key, request.body, {
    httpMetadata: {
      contentType,
      cacheControl: 'private, no-store',
    },
  });

  if (!stored) throw new HttpError(500, 'R2 did not commit the upload');

  if (stored.size > MAX_UPLOAD_BYTES) {
    await env.MEDIA.delete(key);
    throw new HttpError(413, 'File exceeds the 95 MB direct-upload limit');
  }

  const row = {
    id,
    object_key: key,
    original_name: originalName,
    content_type: contentType,
    size_bytes: stored.size,
    uploaded_by: user.email,
    created_at: now.toISOString(),
  };

  try {
    await env.DB.prepare(
      `INSERT INTO media (
        id, object_key, original_name, content_type, size_bytes, uploaded_by, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        row.id,
        row.object_key,
        row.original_name,
        row.content_type,
        row.size_bytes,
        row.uploaded_by,
        row.created_at,
      )
      .run();
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }

  return json({ item: publicMedia(row) }, 201);
}

async function serveMedia(request, env, id) {
  const row = await env.DB.prepare(
    `SELECT id, object_key, original_name, content_type, size_bytes, uploaded_by, created_at
     FROM media
     WHERE id = ?1
     LIMIT 1`,
  )
    .bind(id)
    .first();

  if (!row) throw new HttpError(404, 'Media not found');

  const rangeHeader = request.headers.get('range');
  const object = await env.MEDIA.get(
    row.object_key,
    rangeHeader ? { range: request.headers } : undefined,
  );

  if (!object || !('body' in object)) throw new HttpError(404, 'Media object not found');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', row.content_type);
  headers.set('cache-control', 'private, no-store');
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('content-disposition', 'inline');
  headers.set('content-security-policy', "default-src 'none'; sandbox");

  let status = 200;
  if (rangeHeader && object.range) {
    let start;
    let length;

    if (typeof object.range.offset === 'number') {
      start = object.range.offset;
      length = typeof object.range.length === 'number' ? object.range.length : object.size - start;
    } else if (typeof object.range.suffix === 'number') {
      length = Math.min(object.range.suffix, object.size);
      start = object.size - length;
    }

    if (typeof start === 'number' && typeof length === 'number' && length > 0) {
      const end = start + length - 1;
      headers.set('content-range', `bytes ${start}-${end}/${object.size}`);
      headers.set('content-length', String(length));
      status = 206;
    }
  } else {
    headers.set('content-length', String(object.size));
  }

  return new Response(object.body, { status, headers });
}

function errorResponse(error) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  return json({ error: 'Internal server error' }, 500);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPrivateRoute = url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/');

    if (!isPrivateRoute) return env.ASSETS.fetch(request);

    try {
      const user = await authenticate(request, env);

      if (request.method === 'GET' && url.pathname === '/api/health') {
        return await health(env, user);
      }

      if (request.method === 'GET' && url.pathname === '/api/media') {
        return await listMedia(env);
      }

      if (request.method === 'POST' && url.pathname === '/api/media') {
        return await uploadMedia(request, env, user);
      }

      if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
        const id = decodeURIComponent(url.pathname.slice('/media/'.length));
        if (!id) throw new HttpError(404, 'Media not found');
        return await serveMedia(request, env, id);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
