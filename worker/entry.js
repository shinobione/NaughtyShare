import { createRemoteJWKSet, jwtVerify } from 'jose';
import baseWorker from './index.js';

const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const PHOTOS_API = 'https://photospicker.googleapis.com/v1';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SESSION_COOKIE = '__Host-ns_google_photos';
const STATE_TTL_MS = 10 * 60 * 1000;
const IMPORT_PAGE_SIZE = 10;
const MAX_SINGLE_R2_BYTES = 5 * 1024 ** 3 - 5 * 1024 ** 2;
const jwksByIssuer = new Map();

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

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new HttpError(503, `Missing server configuration: ${key}`);
  return value;
}

function photosConfigured(env) {
  return Boolean(env.GOOGLE_PHOTOS_CLIENT_ID?.trim() && env.GOOGLE_PHOTOS_CLIENT_SECRET?.trim());
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
    ({ payload } = await jwtVerify(assertion, jwks, { issuer, audience }));
  } catch {
    throw new HttpError(401, 'Invalid Cloudflare Access assertion');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  if (!email || !allowedEmails(env).has(email)) {
    throw new HttpError(403, 'User is not allowed in this vault');
  }

  return { email, subject: payload.sub ?? null };
}

function utf8(value) {
  return new TextEncoder().encode(value);
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signState(payload, secret) {
  const body = base64UrlEncode(utf8(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(body));
  return `${body}.${base64UrlEncode(signature)}`;
}

async function verifyState(value, secret) {
  const [body, signature] = String(value || '').split('.');
  if (!body || !signature) throw new HttpError(400, 'Invalid OAuth state');

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    base64UrlDecode(signature),
    utf8(body),
  );
  if (!valid) throw new HttpError(400, 'Invalid OAuth state');

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    throw new HttpError(400, 'Invalid OAuth state');
  }

  if (!Number.isFinite(payload?.exp) || payload.exp < Date.now()) {
    throw new HttpError(400, 'Expired OAuth state');
  }
  return payload;
}

async function sessionCipherKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', utf8(`naughtyshare-google-photos:${secret}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sealSession(payload, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sessionCipherKey(secret),
    utf8(JSON.stringify(payload)),
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return base64UrlEncode(combined);
}

async function unsealSession(value, secret) {
  if (!value) throw new HttpError(401, 'No active Google Photos session');
  try {
    const bytes = base64UrlDecode(value);
    const iv = bytes.slice(0, 12);
    const cipher = bytes.slice(12);
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await sessionCipherKey(secret),
      cipher,
    );
    return JSON.parse(new TextDecoder().decode(clear));
  } catch {
    throw new HttpError(401, 'Invalid Google Photos session');
  }
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return cookies;
}

function sessionCookie(value, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${value}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function redirectUri(request) {
  return `${new URL(request.url).origin}/api/google/photos/callback`;
}

function popupHtml(title, message, state = 'error') {
  const payload = JSON.stringify({ type: 'naughtyshare-google-photos', state, message });
  const safeTitle = String(title).replace(/[<>&"']/g, '');
  const safeMessage = String(message).replace(/[<>&"']/g, '');
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title></head><body style="font-family:system-ui;background:#0b0b10;color:#fff;padding:2rem"><h1>${safeTitle}</h1><p>${safeMessage}</p><script>try{window.opener&&window.opener.postMessage(${payload},location.origin)}catch{};setTimeout(()=>window.close(),300);</script></body></html>`, {
    status: state === 'error' ? 400 : 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

async function googleJson(url, token, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw new HttpError(response.status === 401 || response.status === 403 ? 401 : 502, 'Google Photos API request failed');
  }
  if (response.status === 204) return null;
  return response.json();
}

async function beginPhotosOAuth(request, env, user) {
  const clientId = required(env, 'GOOGLE_PHOTOS_CLIENT_ID');
  const clientSecret = required(env, 'GOOGLE_PHOTOS_CLIENT_SECRET');
  const state = await signState(
    {
      email: user.email,
      exp: Date.now() + STATE_TTL_MS,
      nonce: crypto.randomUUID(),
    },
    clientSecret,
  );

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri(request));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', PHOTOS_SCOPE);
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('login_hint', user.email);

  return Response.redirect(authUrl.toString(), 302);
}

async function exchangeCode(request, env, code) {
  const body = new URLSearchParams({
    code,
    client_id: required(env, 'GOOGLE_PHOTOS_CLIENT_ID'),
    client_secret: required(env, 'GOOGLE_PHOTOS_CLIENT_SECRET'),
    redirect_uri: redirectUri(request),
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  if (!response.ok) throw new HttpError(502, 'Google OAuth token exchange failed');
  const data = await response.json();
  if (!data?.access_token || !Number.isFinite(Number(data?.expires_in))) {
    throw new HttpError(502, 'Google OAuth returned an invalid token response');
  }
  return data;
}

async function completePhotosOAuth(request, env, user) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) {
    return popupHtml('Google Photos', 'Autorisation Google Photos annulée.');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) throw new HttpError(400, 'Missing OAuth callback parameters');

  const clientSecret = required(env, 'GOOGLE_PHOTOS_CLIENT_SECRET');
  const statePayload = await verifyState(state, clientSecret);
  if (statePayload.email !== user.email) throw new HttpError(403, 'OAuth user mismatch');

  const token = await exchangeCode(request, env, code);
  const pickingSession = await googleJson(`${PHOTOS_API}/sessions`, token.access_token, {
    method: 'POST',
    body: JSON.stringify({ pickingConfig: { maxItemCount: '100' } }),
  });

  if (!pickingSession?.id || !pickingSession?.pickerUri) {
    throw new HttpError(502, 'Google Photos did not create a picker session');
  }

  const accessExpiry = Date.now() + Number(token.expires_in) * 1000;
  const pickerExpiry = Date.parse(pickingSession.expireTime || '') || accessExpiry;
  const expiresAt = Math.min(accessExpiry, pickerExpiry);
  const sealed = await sealSession(
    {
      email: user.email,
      accessToken: token.access_token,
      expiresAt,
      sessionId: pickingSession.id,
      nextPageToken: null,
    },
    clientSecret,
  );

  const pickerUrl = `${String(pickingSession.pickerUri).replace(/\/$/, '')}/autoclose`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: pickerUrl,
      'Set-Cookie': sessionCookie(sealed, Math.max(60, (expiresAt - Date.now()) / 1000)),
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function activeSession(request, env, user) {
  const clientSecret = required(env, 'GOOGLE_PHOTOS_CLIENT_SECRET');
  const sealed = parseCookies(request).get(SESSION_COOKIE);
  const session = await unsealSession(sealed, clientSecret);
  if (session.email !== user.email) throw new HttpError(403, 'Google Photos session user mismatch');
  if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    throw new HttpError(401, 'Google Photos session expired');
  }
  return session;
}

function durationMs(value, fallback) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(value || ''));
  if (!match) return fallback;
  return Math.max(500, Math.round(Number(match[1]) * 1000));
}

async function photosStatus(request, env, user) {
  try {
    const session = await activeSession(request, env, user);
    const state = await googleJson(`${PHOTOS_API}/sessions/${encodeURIComponent(session.sessionId)}`, session.accessToken);
    return json({
      active: true,
      ready: state?.mediaItemsSet === true,
      pollIntervalMs: durationMs(state?.pollingConfig?.pollInterval, 1800),
      timeoutMs: durationMs(state?.pollingConfig?.timeoutIn, 300000),
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return json({ active: false, ready: false, expired: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }
    throw error;
  }
}

function safeFilename(raw) {
  return String(raw || 'google-photo')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 240) || 'google-photo';
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', utf8(value));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function importPickedItem(env, user, session, pickedItem) {
  const mediaFile = pickedItem?.mediaFile;
  const mimeType = String(mediaFile?.mimeType || '').toLowerCase();
  if (!pickedItem?.id || !mediaFile?.baseUrl || (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) || mimeType === 'image/svg+xml') {
    return { imported: false, skipped: true, reason: 'unsupported' };
  }

  const userHash = await shortHash(user.email);
  const itemHash = await shortHash(pickedItem.id);
  const objectKey = `google/${userHash}/${itemHash}`;
  const existing = await env.DB.prepare('SELECT id FROM media WHERE object_key = ?1 LIMIT 1').bind(objectKey).first();
  if (existing) return { imported: false, skipped: true, reason: 'duplicate' };

  const downloadUrl = `${mediaFile.baseUrl}=${mimeType.startsWith('video/') ? 'dv' : 'd'}`;
  const download = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Cache-Control': 'no-store',
    },
  });
  if (!download.ok || !download.body) {
    return { imported: false, skipped: true, reason: 'download' };
  }

  const declaredSize = Number(download.headers.get('content-length') || 0);
  if (declaredSize > MAX_SINGLE_R2_BYTES) {
    return { imported: false, skipped: true, reason: 'too-large' };
  }

  const stored = await env.MEDIA.put(objectKey, download.body, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'private, no-store',
    },
  });
  if (!stored) return { imported: false, skipped: true, reason: 'storage' };

  const row = {
    id: crypto.randomUUID(),
    objectKey,
    originalName: safeFilename(mediaFile.filename),
    contentType: mimeType,
    sizeBytes: stored.size,
    uploadedBy: user.email,
    createdAt: new Date().toISOString(),
  };

  try {
    await env.DB.prepare(
      `INSERT INTO media (id, object_key, original_name, content_type, size_bytes, uploaded_by, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(row.id, row.objectKey, row.originalName, row.contentType, row.sizeBytes, row.uploadedBy, row.createdAt)
      .run();
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    throw error;
  }

  return { imported: true, skipped: false, name: row.originalName, sizeBytes: row.sizeBytes };
}

async function importPhotosBatch(request, env, user) {
  const session = await activeSession(request, env, user);
  const params = new URLSearchParams({
    sessionId: session.sessionId,
    pageSize: String(IMPORT_PAGE_SIZE),
  });
  if (session.nextPageToken) params.set('pageToken', session.nextPageToken);

  const page = await googleJson(`${PHOTOS_API}/mediaItems?${params}`, session.accessToken);
  const mediaItems = Array.isArray(page?.mediaItems) ? page.mediaItems : [];
  const results = [];

  for (const item of mediaItems) {
    try {
      results.push(await importPickedItem(env, user, session, item));
    } catch {
      results.push({ imported: false, skipped: true, reason: 'import' });
    }
  }

  const imported = results.filter((result) => result.imported).length;
  const skipped = results.length - imported;
  const nextPageToken = page?.nextPageToken || null;
  const done = !nextPageToken;
  const headers = {};

  if (done) {
    try {
      await googleJson(`${PHOTOS_API}/sessions/${encodeURIComponent(session.sessionId)}`, session.accessToken, { method: 'DELETE' });
    } catch {
      // The local session is still cleared; Google will expire the picker session automatically.
    }
    headers['Set-Cookie'] = clearSessionCookie();
  } else {
    const clientSecret = required(env, 'GOOGLE_PHOTOS_CLIENT_SECRET');
    const sealed = await sealSession({ ...session, nextPageToken }, clientSecret);
    headers['Set-Cookie'] = sessionCookie(sealed, Math.max(60, (session.expiresAt - Date.now()) / 1000));
  }

  return json({ imported, skipped, processed: results.length, done }, 200, headers);
}

async function cancelPhotosSession(request, env, user) {
  try {
    const session = await activeSession(request, env, user);
    try {
      await googleJson(`${PHOTOS_API}/sessions/${encodeURIComponent(session.sessionId)}`, session.accessToken, { method: 'DELETE' });
    } catch {
      // Best effort cleanup.
    }
  } catch {
    // A missing/expired session is already effectively cancelled.
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

async function enhancedHealth(request, env) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;

  const data = await response.json();
  data.googlePhotosPicker = photosConfigured(env);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'private, no-store');
  return new Response(JSON.stringify(data), { status: response.status, headers });
}

function errorResponse(error) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  return json({ error: 'Internal server error' }, 500);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return enhancedHealth(request, env);
    }

    if (!url.pathname.startsWith('/api/google/photos/')) {
      return baseWorker.fetch(request, env, ctx);
    }

    try {
      if (!photosConfigured(env)) throw new HttpError(503, 'Google Photos Picker is not configured');
      const user = await authenticate(request, env);

      if (request.method === 'GET' && url.pathname === '/api/google/photos/start') {
        return await beginPhotosOAuth(request, env, user);
      }
      if (request.method === 'GET' && url.pathname === '/api/google/photos/callback') {
        try {
          return await completePhotosOAuth(request, env, user);
        } catch (error) {
          if (error instanceof HttpError) return popupHtml('Google Photos', error.message);
          throw error;
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/google/photos/status') {
        return await photosStatus(request, env, user);
      }
      if (request.method === 'POST' && url.pathname === '/api/google/photos/import') {
        return await importPhotosBatch(request, env, user);
      }
      if (request.method === 'DELETE' && url.pathname === '/api/google/photos/session') {
        return await cancelPhotosSession(request, env, user);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
