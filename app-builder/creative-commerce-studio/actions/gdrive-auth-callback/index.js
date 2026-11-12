/*
 * gdrive-auth-callback: Google OAuth redirect target (GDRIVE_REDIRECT_URI).
 * Not IMS-authenticated (browser redirect from Google); the one-time `state`
 * binds the result to the author who started the flow (PKCE verifier kept server-side).
 */
const gdrive = require('../../lib/gdrive');
const { callbackPage } = require('../../lib/oauth-page');
const { cleanParams } = require('../../lib/http');

exports.main = async function main(rawParams) {
  const params = cleanParams(rawParams);
  try {
    const result = await gdrive.completeAuth(params, {
      code: params.code, state: params.state, error: params.error,
    });
    return callbackPage(params, {
      provider: 'gdrive', title: 'Google Drive', ok: result.ok, message: result.message,
    });
  } catch (e) {
    return callbackPage(params, {
      provider: 'gdrive', title: 'Google Drive', ok: false, message: e.code === 'misconfigured' ? e.message : 'Google sign-in failed. Close this window and try again.',
    });
  }
};
