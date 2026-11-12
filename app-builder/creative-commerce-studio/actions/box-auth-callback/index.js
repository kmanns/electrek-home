/*
 * box-auth-callback: Box OAuth redirect target (BOX_REDIRECT_URI).
 * Not IMS-authenticated (it is a browser redirect from Box); the one-time
 * `state` binds the result to the author who started the flow.
 */
const box = require('../../lib/box');
const { callbackPage } = require('../../lib/oauth-page');
const { cleanParams } = require('../../lib/http');

exports.main = async function main(rawParams) {
  const params = cleanParams(rawParams);
  try {
    const result = await box.completeAuth(params, {
      code: params.code, state: params.state, error: params.error,
    });
    return callbackPage(params, {
      provider: 'box', title: 'Box', ok: result.ok, message: result.message,
    });
  } catch (e) {
    return callbackPage(params, {
      provider: 'box', title: 'Box', ok: false, message: e.code === 'misconfigured' ? e.message : 'Box sign-in failed. Close this window and try again.',
    });
  }
};
