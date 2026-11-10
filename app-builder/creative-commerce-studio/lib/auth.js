/**
 * Author identity: the Workspace plugin forwards the author's IMS access token.
 * We validate it with IMS (issued to an allowed client, e.g. Experience
 * Workspace's "darkalley"), then key every Box connection and job by the
 * IMS user ID. There is no shared/global "current user".
 */
const { AppError } = require('./http');

const IMS = 'https://ims-na1.adobelogin.com';
const cache = new Map(); // token hash -> { user, exp } (per warm container)

function bearer(params) {
  const header = params.__ow_headers?.authorization || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new AppError(401, 'no-session', 'Sign in to Experience Workspace and reopen the plugin.');
  return match[1];
}

/** Reads (unverified) JWT claims only to choose the client_id to validate against. */
function peekClaims(token) {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    throw new AppError(401, 'invalid-session', 'Your Workspace session token is not valid. Reload Experience Workspace.');
  }
}

function hashToken(token) {
  return require('crypto').createHash('sha256').update(token).digest('hex');
}

/** Returns a stable storage-safe key for the user. */
function userKey(userId) {
  return require('crypto').createHash('sha256').update(`ims:${userId}`).digest('hex').slice(0, 32);
}

async function authenticate(params, fetchImpl = fetch) {
  const token = bearer(params);
  const key = hashToken(token);
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.user;

  const claims = peekClaims(token);
  const allowed = (params.IMS_ALLOWED_CLIENT_IDS || 'darkalley').split(',').map((s) => s.trim());
  if (!claims.client_id || !allowed.includes(claims.client_id)) {
    throw new AppError(401, 'invalid-session', 'This token was not issued to Experience Workspace.');
  }

  const body = new URLSearchParams({ type: 'access_token', client_id: claims.client_id, token });
  const res = await fetchImpl(`${IMS}/ims/validate_token/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const result = res.ok ? await res.json() : null;
  if (!result?.valid) {
    throw new AppError(401, 'invalid-session', 'Your Workspace session expired. Reload Experience Workspace and try again.');
  }
  const userId = result.token?.user_id || claims.user_id;
  if (!userId) throw new AppError(401, 'invalid-session', 'The session has no user identity.');

  const allowedOrgs = (params.IMS_ALLOWED_ORGS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedOrgs.length) {
    const profileRes = await fetchImpl(`${IMS}/ims/profile/v1`, { headers: { Authorization: `Bearer ${token}` } });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const orgs = (profile.projectedProductContext || [])
      .map((p) => p.prodCtx?.owningEntity).filter(Boolean);
    if (!orgs.some((o) => allowedOrgs.includes(o))) {
      throw new AppError(403, 'org-not-allowed', 'Your Adobe organization is not allowed to use this Creative Commerce Studio installation.');
    }
  }

  const user = { id: userId, key: userKey(userId) };
  const expiresMs = Number(claims.created_at || 0) + Number(claims.expires_in || 0);
  cache.set(key, { user, exp: Math.min(Date.now() + 5 * 60 * 1000, expiresMs || Infinity) });
  return user;
}

module.exports = {
  authenticate, bearer, peekClaims, userKey, _cache: cache,
};
