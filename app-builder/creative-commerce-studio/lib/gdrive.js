/**
 * Google Drive connector (same contract as lib/box.js).
 * - OAuth 2.0 web-server flow with PKCE, server-side code exchange, offline access
 * - per-author encrypted token storage, serialized refresh
 * - read-only (drive.readonly) access to one allowed folder tree (GDRIVE_ALLOWED_FOLDER_ID)
 * - downloads the exact revision the author selected
 * Never writes to Drive.
 */
const crypto = require('crypto');
const { AppError } = require('./http');
const { encrypt, decrypt, randomId } = require('./crypto');
const store = require('./store');

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FOLDER = 'application/vnd.google-apps.folder';
const SUPPORTED_MIME = /^image\/(png|jpe?g)$/i;
const SUPPORTED_NAME = /\.(png|jpe?g)$/i;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const ID_RE = /^[\w-]{10,200}$/;
const THUMB_HOST = /^https:\/\/([\w-]+\.)*(googleusercontent\.com|google\.com|googleapis\.com)\//;
const THUMB_MAX_BYTES = 150 * 1024;

const connKey = (user) => `gdrive.conn.${user.key}`;
const stateKey = (nonce) => `gdrive.oauth.${nonce}`;
const refreshing = new Map();

function configured(params) {
  return !!(params.GDRIVE_CLIENT_ID && params.GDRIVE_CLIENT_SECRET && params.GDRIVE_REDIRECT_URI && params.GDRIVE_ALLOWED_FOLDER_ID);
}

function requireConfig(params) {
  ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REDIRECT_URI', 'GDRIVE_ALLOWED_FOLDER_ID'].forEach((k) => {
    if (!params[k]) throw new AppError(500, 'misconfigured', `Google Drive is not configured (${k} missing).`);
  });
}

/* ---------- OAuth ---------- */

async function startAuth(params, user) {
  requireConfig(params);
  const nonce = randomId();
  const verifier = randomId(48);
  await store.putJSON(stateKey(nonce), {
    user: user.key, createdAt: Date.now(), sealedVerifier: encrypt(params, { verifier }, stateKey(nonce)),
  }, 10 / 1440);
  const url = new URL(AUTHORIZE);
  url.searchParams.set('client_id', params.GDRIVE_CLIENT_ID);
  url.searchParams.set('redirect_uri', params.GDRIVE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', nonce);
  url.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
  url.searchParams.set('code_challenge_method', 'S256');
  return { authorizeUrl: url.href };
}

async function tokenRequest(params, form, fetchImpl) {
  const res = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...form, client_id: params.GDRIVE_CLIENT_ID, client_secret: params.GDRIVE_CLIENT_SECRET }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const reauth = body.error === 'invalid_grant';
    throw new AppError(401, reauth ? 'gdrive-reauth' : 'gdrive-auth-failed', reauth
      ? 'Your Google Drive connection expired or was revoked. Reconnect Google Drive.'
      : 'Google sign-in failed. Reconnect Google Drive and try again.');
  }
  return body;
}

async function saveConnection(params, user, tokens, extra = {}) {
  const prev = await store.getJSON(connKey(user));
  let old = {};
  if (prev?.sealed) {
    try { old = decrypt(params, prev.sealed, connKey(user)); } catch (e) { old = {}; }
  }
  await store.putJSON(connKey(user), {
    ...prev,
    ...extra,
    sealed: encrypt(params, {
      accessToken: tokens.access_token,
      // Google usually returns a refresh token only on the first consent; keep the old one.
      refreshToken: tokens.refresh_token || old.refreshToken || null,
      expiresAt: Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000,
    }, connKey(user)),
    updatedAt: Date.now(),
  }, 60);
}

async function completeAuth(params, { code, state, error }, fetchImpl = fetch) {
  requireConfig(params);
  if (!state || !/^[\w-]{20,64}$/.test(state)) return { ok: false, message: 'Missing or invalid sign-in state.' };
  const pending = await store.getJSON(stateKey(state));
  await store.del(stateKey(state)).catch(() => {});
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    return { ok: false, message: 'This Google sign-in link expired. Start again from the plugin.' };
  }
  if (error) return { ok: false, message: error === 'access_denied' ? 'Google Drive access was not granted.' : 'Google sign-in failed.' };
  if (!code) return { ok: false, message: 'Google did not return an authorization code.' };
  const { verifier } = decrypt(params, pending.sealedVerifier, stateKey(state));
  const tokens = await tokenRequest(params, {
    grant_type: 'authorization_code', code, redirect_uri: params.GDRIVE_REDIRECT_URI, code_verifier: verifier,
  }, fetchImpl);
  if (tokens.scope && !String(tokens.scope).split(' ').includes(SCOPE)) {
    return { ok: false, message: 'Google Drive read access was not granted. Connect again and allow access to Drive files.' };
  }
  const aboutRes = await fetchImpl(`${API}/about?fields=user(displayName,emailAddress)`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const about = aboutRes.ok ? await aboutRes.json() : {};
  await saveConnection(params, { key: pending.user }, tokens, {
    driveUser: { name: about.user?.displayName, login: about.user?.emailAddress },
  });
  return { ok: true, message: 'Google Drive is connected. You can close this window.' };
}

async function readConnection(params, user) {
  const conn = await store.getJSON(connKey(user));
  if (!conn?.sealed) return null;
  try {
    return { ...conn, tokens: decrypt(params, conn.sealed, connKey(user)) };
  } catch (e) {
    return null;
  }
}

async function doRefresh(params, user, conn, fetchImpl) {
  if (!conn.tokens.refreshToken) {
    await store.del(connKey(user)).catch(() => {});
    throw new AppError(401, 'gdrive-reauth', 'Your Google Drive connection expired. Reconnect Google Drive.');
  }
  try {
    const tokens = await tokenRequest(params, { grant_type: 'refresh_token', refresh_token: conn.tokens.refreshToken }, fetchImpl);
    await saveConnection(params, user, tokens);
    return tokens.access_token;
  } catch (e) {
    if (e.code === 'gdrive-reauth') await store.del(connKey(user)).catch(() => {});
    throw e;
  }
}

async function accessToken(params, user, fetchImpl = fetch, { force = false } = {}) {
  const conn = await readConnection(params, user);
  if (!conn) throw new AppError(401, 'gdrive-reauth', 'Connect Google Drive to continue.');
  if (!force && conn.tokens.expiresAt > Date.now()) return conn.tokens.accessToken;
  if (!refreshing.has(user.key)) {
    refreshing.set(user.key, doRefresh(params, user, conn, fetchImpl).finally(() => refreshing.delete(user.key)));
  }
  return refreshing.get(user.key);
}

async function status(params, user) {
  const conn = await readConnection(params, user);
  return { connected: !!conn, user: conn?.driveUser || null };
}

async function disconnect(params, user, fetchImpl = fetch) {
  const conn = await readConnection(params, user);
  if (conn) {
    const token = conn.tokens.refreshToken || conn.tokens.accessToken;
    await fetchImpl(REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }).catch(() => {});
  }
  await store.del(connKey(user)).catch(() => {});
  return { connected: false };
}

/* ---------- API ---------- */

async function api(params, user, url, fetchImpl = fetch, { retried = false } = {}) {
  const token = await accessToken(params, user, fetchImpl, { force: retried });
  const full = url.startsWith('https://') ? url : `${API}${url}`;
  const res = await fetchImpl(full, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) return api(params, user, url, fetchImpl, { retried: true });
  if (res.status === 401) throw new AppError(401, 'gdrive-reauth', 'Your Google Drive connection expired or was revoked. Reconnect Google Drive.');
  if (res.status === 403 || res.status === 404) throw new AppError(404, 'gdrive-not-found', 'That Google Drive item is not available to your account.');
  if (!res.ok) throw new AppError(502, 'gdrive-error', `Google Drive returned an error (${res.status}).`);
  return res;
}

const FILE_FIELDS = 'id,name,mimeType,size,headRevisionId,md5Checksum,parents,trashed,thumbnailLink';

async function getItem(params, user, id, fetchImpl) {
  return (await api(params, user, `/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}&supportsAllDrives=true`, fetchImpl)).json();
}

/** Ensures the item is the allowed folder or inside it, by walking up its parents. */
async function assertAllowed(params, user, item, fetchImpl) {
  const root = String(params.GDRIVE_ALLOWED_FOLDER_ID);
  if (item.id === root) return;
  let parents = item.parents || [];
  const seen = new Set();
  for (let depth = 0; depth < 12 && parents.length; depth += 1) {
    if (parents.includes(root)) return;
    const next = parents[0];
    if (seen.has(next)) break;
    seen.add(next);
    // eslint-disable-next-line no-await-in-loop
    const parent = await getItem(params, user, next, fetchImpl).catch(() => null);
    parents = parent?.parents || [];
  }
  throw new AppError(403, 'gdrive-folder-not-allowed', 'Only the configured campaign folder can be browsed.');
}

function isSupported(f) {
  return SUPPORTED_MIME.test(f.mimeType || '') || SUPPORTED_NAME.test(f.name || '');
}

async function thumbnail(params, user, f, fetchImpl) {
  if (!f.thumbnailLink || !THUMB_HOST.test(f.thumbnailLink)) return null;
  try {
    const url = f.thumbnailLink.replace(/=s\d+$/, '=s320');
    const res = await api(params, user, url, fetchImpl);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > THUMB_MAX_BYTES) return null;
    const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

async function listFolder(params, user, folderId, fetchImpl = fetch) {
  requireConfig(params);
  const id = folderId ? String(folderId) : String(params.GDRIVE_ALLOWED_FOLDER_ID);
  if (!ID_RE.test(id)) throw new AppError(400, 'bad-request', 'Invalid folder.');
  const folder = await getItem(params, user, id, fetchImpl);
  if (folder.mimeType !== FOLDER) throw new AppError(400, 'bad-request', 'That item is not a folder.');
  await assertAllowed(params, user, folder, fetchImpl);
  const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
  const listing = await (await api(params, user, `/files?q=${q}&orderBy=folder,name&pageSize=200&fields=files(${FILE_FIELDS})&supportsAllDrives=true&includeItemsFromAllDrives=true`, fetchImpl)).json();
  let thumbs = 0;
  const entries = await Promise.all((listing.files || []).map(async (f) => {
    if (f.mimeType === FOLDER) return { type: 'folder', id: f.id, name: f.name };
    const supported = isSupported(f);
    thumbs += supported ? 1 : 0;
    return {
      type: 'file',
      id: f.id,
      name: f.name,
      size: Number(f.size) || null,
      versionId: f.headRevisionId || null,
      supported,
      thumbnail: supported && thumbs <= 24 ? await thumbnail(params, user, f, fetchImpl) : null,
    };
  }));
  const isRoot = id === String(params.GDRIVE_ALLOWED_FOLDER_ID);
  return {
    folder: { id: folder.id, name: folder.name, parentId: isRoot ? null : (folder.parents || [])[0] || null },
    entries,
  };
}

/** Verifies the exact file/revision and downloads its bytes. */
async function downloadVersion(params, user, fileId, versionId, fetchImpl = fetch) {
  requireConfig(params);
  if (!ID_RE.test(String(fileId)) || !ID_RE.test(String(versionId))) {
    throw new AppError(400, 'bad-request', 'Invalid Google Drive file reference.');
  }
  const info = await getItem(params, user, fileId, fetchImpl);
  if (info.trashed) throw new AppError(404, 'gdrive-not-found', 'That file is in the Google Drive trash.');
  await assertAllowed(params, user, info, fetchImpl);
  if (!isSupported(info)) throw new AppError(415, 'unsupported-source', 'Only PNG or JPEG packshots are supported.');
  if (Number(info.size) > MAX_SOURCE_BYTES) throw new AppError(413, 'source-too-large', 'The packshot is larger than 50 MB.');
  const current = info.headRevisionId === versionId;
  const path = current
    ? `/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
    : `/files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(versionId)}?alt=media`;
  const res = await api(params, user, path, fetchImpl);
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    name: info.name,
    sha1: null,
    md5: current ? info.md5Checksum || null : null,
    contentType: /png/i.test(info.mimeType || info.name) ? 'image/png' : 'image/jpeg',
  };
}

module.exports = {
  configured, startAuth, completeAuth, status, disconnect, listFolder, downloadVersion, accessToken, SCOPE,
};
