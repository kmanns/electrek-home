/**
 * Per-author sign-in to the Firefly Creative Production run-workflow MCP.
 *
 * The MCP's authorization server (https://run-workflow.adobe.io) publishes
 * OAuth metadata with dynamic client registration and PKCE (S256). This
 * backend registers itself once (stored in State), then each author signs in
 * with their own Adobe account; their tokens are encrypted per author.
 * Used only when FFCPE_MODE=mcp.
 */
const crypto = require('crypto');
const { AppError } = require('./http');
const { encrypt, decrypt, randomId } = require('./crypto');
const store = require('./store');

const DEFAULT_MCP_URL = 'https://run-workflow.adobe.io/mcp';
const DEFAULTS = {
  authorization_endpoint: 'https://run-workflow.adobe.io/mcp/auth/authorize',
  token_endpoint: 'https://run-workflow.adobe.io/mcp/auth/token',
  registration_endpoint: 'https://run-workflow.adobe.io/mcp/auth/register',
};
const ADOBE_HOST = /^https:\/\/([\w-]+\.)*adobe\.io\//;

const connKey = (user) => `ffmcp.conn.${user.key}`;
const stateKey = (nonce) => `ffmcp.oauth.${nonce}`;
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
const refreshing = new Map();
let metadataCache = null;

function mcpUrl(params) {
  const url = params.FFCPE_MCP_URL || DEFAULT_MCP_URL;
  if (!ADOBE_HOST.test(url)) throw new AppError(500, 'misconfigured', 'FFCPE_MCP_URL must be an https adobe.io URL.');
  return url;
}

function requireConfig(params) {
  ['FIREFLY_REDIRECT_URI', 'FFCPE_WORKFLOW_ID'].forEach((k) => {
    if (!params[k]) throw new AppError(500, 'misconfigured', `Firefly Creative Production is not configured (${k} missing).`);
  });
}

/** OAuth authorization-server metadata (RFC 8414), with known defaults as fallback. */
async function metadata(params, fetchImpl) {
  if (metadataCache) return metadataCache;
  const origin = new URL(mcpUrl(params)).origin;
  let meta = {};
  try {
    const res = await fetchImpl(`${origin}/.well-known/oauth-authorization-server`, { headers: { Accept: 'application/json' } });
    if (res.ok) meta = await res.json();
  } catch (e) { /* use defaults */ }
  const merged = { ...DEFAULTS, ...meta };
  ['authorization_endpoint', 'token_endpoint', 'registration_endpoint'].forEach((k) => {
    if (!ADOBE_HOST.test(merged[k] || '')) merged[k] = DEFAULTS[k];
  });
  metadataCache = merged;
  return merged;
}

/** Dynamic client registration (RFC 7591), once per redirect URI. */
async function client(params, fetchImpl) {
  const key = `ffmcp.client.${hash(params.FIREFLY_REDIRECT_URI)}`;
  const saved = await store.getJSON(key);
  if (saved?.clientId) {
    return {
      clientId: saved.clientId,
      clientSecret: saved.sealedSecret ? decrypt(params, saved.sealedSecret, key).secret : null,
    };
  }
  const meta = await metadata(params, fetchImpl);
  const res = await fetchImpl(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: params.FIREFLY_CLIENT_NAME || 'Creative Commerce Studio',
      redirect_uris: [params.FIREFLY_REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.client_id) {
    throw new AppError(502, 'firefly-registration-failed', `Adobe's Firefly sign-in did not accept this app's registration (${res.status}${body.error ? `: ${body.error_description || body.error}` : ''}).`);
  }
  await store.putJSON(key, {
    clientId: body.client_id,
    sealedSecret: body.client_secret ? encrypt(params, { secret: body.client_secret }, key) : null,
    redirectUri: params.FIREFLY_REDIRECT_URI,
    registeredAt: new Date().toISOString(),
  }, 365);
  return { clientId: body.client_id, clientSecret: body.client_secret || null };
}

function pkce() {
  const verifier = randomId(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function startAuth(params, user, fetchImpl = fetch) {
  requireConfig(params);
  const meta = await metadata(params, fetchImpl);
  const { clientId } = await client(params, fetchImpl);
  const nonce = randomId();
  const { verifier, challenge } = pkce();
  await store.putJSON(stateKey(nonce), {
    user: user.key, createdAt: Date.now(), sealedVerifier: encrypt(params, { verifier }, stateKey(nonce)),
  }, 10 / 1440);
  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.FIREFLY_REDIRECT_URI);
  url.searchParams.set('state', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', mcpUrl(params));
  if (params.FIREFLY_SCOPE) url.searchParams.set('scope', params.FIREFLY_SCOPE);
  return { authorizeUrl: url.href };
}

async function tokenRequest(params, form, fetchImpl) {
  const meta = await metadata(params, fetchImpl);
  const { clientId, clientSecret } = await client(params, fetchImpl);
  const res = await fetchImpl(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      ...form, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), resource: mcpUrl(params),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const err = new AppError(401, body.error === 'invalid_grant' ? 'firefly-reauth' : 'firefly-auth-failed', 'Firefly sign-in failed. Connect Firefly again.');
    err.oauthError = body.error;
    throw err;
  }
  return body;
}

async function saveConnection(params, user, tokens) {
  const prev = await store.getJSON(connKey(user));
  const old = prev?.sealed ? (() => { try { return decrypt(params, prev.sealed, connKey(user)); } catch (e) { return {}; } })() : {};
  await store.putJSON(connKey(user), {
    sealed: encrypt(params, {
      accessToken: tokens.access_token,
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
    return { ok: false, message: 'This Firefly sign-in link expired. Start again from the plugin.' };
  }
  if (error) return { ok: false, message: 'Firefly access was not granted.' };
  if (!code) return { ok: false, message: 'Adobe did not return an authorization code.' };
  const { verifier } = decrypt(params, pending.sealedVerifier, stateKey(state));
  const tokens = await tokenRequest(params, {
    grant_type: 'authorization_code', code, redirect_uri: params.FIREFLY_REDIRECT_URI, code_verifier: verifier,
  }, fetchImpl);
  await saveConnection(params, { key: pending.user }, tokens);
  return { ok: true, message: 'Firefly Creative Production is connected. You can close this window.' };
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
    throw new AppError(401, 'firefly-reauth', 'Your Firefly sign-in expired. Connect Firefly again.');
  }
  try {
    const tokens = await tokenRequest(params, { grant_type: 'refresh_token', refresh_token: conn.tokens.refreshToken }, fetchImpl);
    await saveConnection(params, user, tokens);
    return tokens.access_token;
  } catch (e) {
    if (e.code !== 'firefly-reauth') throw e;
    const latest = await readConnection(params, user);
    if (latest && latest.tokens.refreshToken !== conn.tokens.refreshToken && latest.tokens.expiresAt > Date.now()) {
      return latest.tokens.accessToken;
    }
    await store.del(connKey(user)).catch(() => {});
    throw new AppError(401, 'firefly-reauth', 'Your Firefly sign-in expired. Connect Firefly again.');
  }
}

/** Valid access token for the author; refreshes (serialized) when expired or when force=true. */
async function accessToken(params, user, fetchImpl = fetch, { force = false } = {}) {
  const conn = await readConnection(params, user);
  if (!conn) throw new AppError(401, 'firefly-reauth', 'Connect Firefly to run production.');
  if (!force && conn.tokens.expiresAt > Date.now()) return conn.tokens.accessToken;
  if (!refreshing.has(user.key)) {
    refreshing.set(user.key, doRefresh(params, user, conn, fetchImpl).finally(() => refreshing.delete(user.key)));
  }
  return refreshing.get(user.key);
}

async function status(params, user) {
  if ((params.FFCPE_MODE || 'mcp') !== 'mcp') return { connected: true, mode: 'api' };
  const conn = await readConnection(params, user);
  return { connected: !!conn, mode: 'mcp' };
}

async function disconnect(params, user) {
  await store.del(connKey(user)).catch(() => {});
  return { connected: false };
}

module.exports = {
  startAuth, completeAuth, accessToken, status, disconnect, mcpUrl,
  _reset: () => { metadataCache = null; },
};
