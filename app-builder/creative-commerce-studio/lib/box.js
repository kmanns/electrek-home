/**
 * Box connector (single provider, deliberately small).
 * - OAuth 2.0 authorization-code flow, server-side code exchange
 * - per-author encrypted token storage, refresh-token rotation
 * - read-only access to one allowed folder tree (BOX_ALLOWED_FOLDER_ID)
 * Never writes to Box.
 */
const { AppError } = require('./http');
const { encrypt, decrypt, randomId } = require('./crypto');
const store = require('./store');

const AUTHORIZE = 'https://account.box.com/api/oauth2/authorize';
const TOKEN = 'https://api.box.com/oauth2/token';
const REVOKE = 'https://api.box.com/oauth2/revoke';
const API = 'https://api.box.com/2.0';
const SUPPORTED = /\.(png|jpe?g)$/i;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

const connKey = (user) => `box.conn.${user.key}`;
const stateKey = (nonce) => `box.oauth.${nonce}`;
const refreshing = new Map(); // per-container serialization of refreshes

function requireConfig(params) {
  ['BOX_CLIENT_ID', 'BOX_CLIENT_SECRET', 'BOX_REDIRECT_URI', 'BOX_ALLOWED_FOLDER_ID'].forEach((k) => {
    if (!params[k]) throw new AppError(500, 'misconfigured', `Box is not configured (${k} missing).`);
  });
}

/* ---------- OAuth ---------- */

async function startAuth(params, user) {
  requireConfig(params);
  const nonce = randomId();
  await store.putJSON(stateKey(nonce), { user: user.key, createdAt: Date.now() }, 10 / 1440);
  const url = new URL(AUTHORIZE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.BOX_CLIENT_ID);
  url.searchParams.set('redirect_uri', params.BOX_REDIRECT_URI);
  url.searchParams.set('state', nonce);
  return { authorizeUrl: url.href };
}

async function tokenRequest(params, form, fetchImpl = fetch) {
  const res = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...form, client_id: params.BOX_CLIENT_ID, client_secret: params.BOX_CLIENT_SECRET,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new AppError(res.status === 400 ? 401 : 502, body.error === 'invalid_grant' ? 'box-reauth' : 'box-auth-failed', 'Box sign-in failed. Reconnect Box and try again.');
    err.boxError = body.error;
    throw err;
  }
  return body;
}

function seal(params, user, tokens) {
  return {
    sealed: encrypt(params, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000,
    }, connKey(user)),
    updatedAt: Date.now(),
  };
}

async function saveConnection(params, user, tokens, extra = {}) {
  const prev = await store.getJSON(connKey(user));
  // Box refresh tokens are valid for 60 days.
  await store.putJSON(connKey(user), { ...prev, ...extra, ...seal(params, user, tokens) }, 60);
}

/** Handles the Box redirect. Returns { ok, message } for the callback page. */
async function completeAuth(params, { code, state, error }, fetchImpl = fetch) {
  requireConfig(params);
  if (!state || !/^[\w-]{20,64}$/.test(state)) return { ok: false, message: 'Missing or invalid sign-in state.' };
  const pending = await store.getJSON(stateKey(state));
  await store.del(stateKey(state)).catch(() => {});
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    return { ok: false, message: 'This Box sign-in link expired. Start again from the plugin.' };
  }
  if (error) return { ok: false, message: 'Box access was not granted.' };
  if (!code) return { ok: false, message: 'Box did not return an authorization code.' };

  const user = { key: pending.user };
  const tokens = await tokenRequest(params, {
    grant_type: 'authorization_code', code, redirect_uri: params.BOX_REDIRECT_URI,
  }, fetchImpl);
  const meRes = await fetchImpl(`${API}/users/me?fields=name,login`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const me = meRes.ok ? await meRes.json() : {};
  await saveConnection(params, user, tokens, { boxUser: { name: me.name, login: me.login } });
  return { ok: true, message: 'Box is connected. You can close this window.' };
}

async function readConnection(params, user) {
  const conn = await store.getJSON(connKey(user));
  if (!conn?.sealed) return null;
  try {
    return { ...conn, tokens: decrypt(params, conn.sealed, connKey(user)) };
  } catch (e) {
    return null; // key rotated or tampered: treat as disconnected
  }
}

async function doRefresh(params, user, conn, fetchImpl) {
  try {
    const tokens = await tokenRequest(params, { grant_type: 'refresh_token', refresh_token: conn.tokens.refreshToken }, fetchImpl);
    await saveConnection(params, user, tokens);
    return tokens.access_token;
  } catch (e) {
    if (e.code !== 'box-reauth') throw e;
    // Another container may have rotated the refresh token first: re-read once.
    const latest = await readConnection(params, user);
    if (latest && latest.tokens.refreshToken !== conn.tokens.refreshToken
      && latest.tokens.expiresAt > Date.now()) {
      return latest.tokens.accessToken;
    }
    await store.del(connKey(user)).catch(() => {});
    throw new AppError(401, 'box-reauth', 'Your Box connection expired or was revoked. Reconnect Box.');
  }
}

/** Returns a valid access token, refreshing (serialized per user) when needed. */
async function accessToken(params, user, fetchImpl = fetch) {
  const conn = await readConnection(params, user);
  if (!conn) throw new AppError(401, 'box-reauth', 'Connect Box to continue.');
  if (conn.tokens.expiresAt > Date.now()) return conn.tokens.accessToken;
  if (!refreshing.has(user.key)) {
    refreshing.set(user.key, doRefresh(params, user, conn, fetchImpl)
      .finally(() => refreshing.delete(user.key)));
  }
  return refreshing.get(user.key);
}

async function status(params, user) {
  const conn = await readConnection(params, user);
  return { connected: !!conn, user: conn?.boxUser || null };
}

async function disconnect(params, user, fetchImpl = fetch) {
  const conn = await readConnection(params, user);
  if (conn) {
    await fetchImpl(REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: params.BOX_CLIENT_ID, client_secret: params.BOX_CLIENT_SECRET, token: conn.tokens.refreshToken,
      }),
    }).catch(() => {});
  }
  await store.del(connKey(user)).catch(() => {});
  return { connected: false };
}

/* ---------- API ---------- */

async function api(params, user, path, fetchImpl = fetch, { retried = false, headers = {} } = {}) {
  const token = await accessToken(params, user, fetchImpl);
  const url = path.startsWith('https://') ? path : `${API}${path}`;
  const res = await fetchImpl(url, { headers: { ...headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) {
    const conn = await readConnection(params, user);
    if (conn) {
      conn.tokens.expiresAt = 0;
      await doRefresh(params, user, conn, fetchImpl);
      return api(params, user, path, fetchImpl, { retried: true, headers });
    }
  }
  if (res.status === 401) throw new AppError(401, 'box-reauth', 'Your Box connection expired or was revoked. Reconnect Box.');
  if (res.status === 403 || res.status === 404) {
    throw new AppError(404, 'box-not-found', 'That Box item is not available to your account.');
  }
  if (!res.ok) throw new AppError(502, 'box-error', `Box returned an error (${res.status}).`);
  return res;
}

/** Ensures an item sits inside the allowed folder tree. */
function assertAllowed(params, item) {
  const root = String(params.BOX_ALLOWED_FOLDER_ID);
  const inTree = String(item.id) === root && item.type === 'folder'
    || (item.path_collection?.entries || []).some((e) => String(e.id) === root);
  if (!inTree) throw new AppError(403, 'box-folder-not-allowed', 'Only the configured campaign folder can be browsed.');
}

const THUMB_MAX_BYTES = 150 * 1024;
const THUMB_HINT = '[jpg?dimensions=320x320]';
const BOX_CONTENT_HOST = /^https:\/\/([\w-]+\.)*(boxcloud\.com|box\.com)\//;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function dataUrl(buf, type) {
  if (!buf.length || buf.length > THUMB_MAX_BYTES) return null;
  return `data:${type};base64,${buf.toString('base64')}`;
}

/**
 * Current Box method: Representations API. New uploads are processed
 * asynchronously, so a pending/none state triggers generation and is retried briefly.
 */
async function representationThumbnail(params, user, fileId, fetchImpl, waitMs) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const body = await (await api(params, user, `/files/${fileId}?fields=representations`, fetchImpl, { headers: { 'x-rep-hints': THUMB_HINT } })).json();
    const rep = body.representations?.entries?.find((r) => r.representation === 'jpg');
    if (!rep) return null;
    const state = rep.status?.state;
    if (state === 'success' || state === 'viewable') {
      const url = rep.content?.url_template?.replace('{+asset_path}', '');
      if (!url || !BOX_CONTENT_HOST.test(url)) return null;
      // eslint-disable-next-line no-await-in-loop
      const res = await api(params, user, url, fetchImpl);
      if (res.status !== 200) return null;
      // eslint-disable-next-line no-await-in-loop
      return dataUrl(Buffer.from(await res.arrayBuffer()), 'image/jpeg');
    }
    if (state === 'error') return null;
    if (state === 'none' && rep.info?.url && BOX_CONTENT_HOST.test(rep.info.url)) {
      // Asking for the representation info starts generation.
      // eslint-disable-next-line no-await-in-loop
      await api(params, user, rep.info.url, fetchImpl).catch(() => {});
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(waitMs);
  }
  return null;
}

/** Legacy thumbnail endpoint: 200 = image, 202 = still generating. */
async function legacyThumbnail(params, user, fileId, fetchImpl) {
  const res = await api(params, user, `/files/${fileId}/thumbnail.png?min_height=160&min_width=160`, fetchImpl);
  if (res.status !== 200) return null;
  return dataUrl(Buffer.from(await res.arrayBuffer()), 'image/png');
}

async function thumbnail(params, user, fileId, fetchImpl, waitMs = 1200) {
  try {
    const rep = await representationThumbnail(params, user, fileId, fetchImpl, waitMs);
    if (rep) return rep;
  } catch (e) { /* fall through to legacy */ }
  try {
    return await legacyThumbnail(params, user, fileId, fetchImpl);
  } catch (e) {
    return null;
  }
}

async function listFolder(params, user, folderId, fetchImpl = fetch) {
  requireConfig(params);
  const id = folderId ? String(folderId) : String(params.BOX_ALLOWED_FOLDER_ID);
  if (!/^\d{1,20}$/.test(id)) throw new AppError(400, 'bad-request', 'Invalid folder.');
  const folder = await (await api(params, user, `/folders/${id}?fields=id,type,name,parent,path_collection`, fetchImpl)).json();
  assertAllowed(params, folder);
  const items = await (await api(params, user, `/folders/${id}/items?fields=id,type,name,size,file_version,extension&limit=200`, fetchImpl)).json();
  const entries = (items.entries || []).filter((e) => e.type === 'folder' || e.type === 'file');
  let thumbs = 0;
  const out = await Promise.all(entries.map(async (e) => {
    if (e.type === 'folder') return { type: 'folder', id: e.id, name: e.name };
    const supported = SUPPORTED.test(e.name);
    thumbs += supported ? 1 : 0;
    return {
      type: 'file',
      id: e.id,
      name: e.name,
      size: e.size,
      versionId: e.file_version?.id,
      supported,
      thumbnail: supported && thumbs <= 24 ? await thumbnail(params, user, e.id, fetchImpl) : null,
    };
  }));
  const isRoot = String(folder.id) === String(params.BOX_ALLOWED_FOLDER_ID);
  return {
    folder: { id: folder.id, name: folder.name, parentId: isRoot ? null : folder.parent?.id },
    entries: out,
  };
}

/** Verifies the exact file/version and downloads its bytes. */
async function downloadVersion(params, user, fileId, versionId, fetchImpl = fetch) {
  if (!/^\d{1,20}$/.test(String(fileId)) || !/^\d{1,20}$/.test(String(versionId))) {
    throw new AppError(400, 'bad-request', 'Invalid Box file reference.');
  }
  const info = await (await api(params, user, `/files/${fileId}?fields=id,type,name,size,extension,file_version,path_collection,sha1`, fetchImpl)).json();
  assertAllowed(params, info);
  if (!SUPPORTED.test(info.name)) throw new AppError(415, 'unsupported-source', 'Only PNG or JPEG packshots are supported.');
  if (info.size > MAX_SOURCE_BYTES) throw new AppError(413, 'source-too-large', 'The packshot is larger than 50 MB.');
  const current = String(info.file_version?.id) === String(versionId);
  const path = current ? `/files/${fileId}/content` : `/files/${fileId}/content?version=${versionId}`;
  const res = await api(params, user, path, fetchImpl); // follows Box's signed redirect
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    name: info.name,
    sha1: current ? info.sha1 : null,
    contentType: /\.png$/i.test(info.name) ? 'image/png' : 'image/jpeg',
  };
}

module.exports = {
  startAuth, completeAuth, status, disconnect, listFolder, downloadVersion, accessToken, assertAllowed,
  _thumbnail: thumbnail,
};
