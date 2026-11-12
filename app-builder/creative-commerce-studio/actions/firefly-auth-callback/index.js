/*
 * firefly-auth-callback: OAuth redirect target for the run-workflow MCP sign-in
 * (FIREFLY_REDIRECT_URI). Not IMS-authenticated (browser redirect); the one-time
 * `state` binds the result to the author who started the flow (PKCE verifier kept server-side).
 */
const fireflyAuth = require('../../lib/firefly-auth');
const { callbackPage } = require('../../lib/oauth-page');
const { cleanParams } = require('../../lib/http');

exports.main = async function main(rawParams) {
  const params = cleanParams(rawParams);
  try {
    const result = await fireflyAuth.completeAuth(params, {
      code: params.code, state: params.state, error: params.error,
    });
    return callbackPage(params, {
      provider: 'firefly', title: 'Firefly', ok: result.ok, message: result.message,
    });
  } catch (e) {
    return callbackPage(params, {
      provider: 'firefly', title: 'Firefly', ok: false, message: e.code === 'misconfigured' ? e.message : 'Firefly sign-in failed. Close this window and try again.',
    });
  }
};
