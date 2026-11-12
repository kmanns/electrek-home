/* gdrive-auth-start: start Google sign-in (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const gdrive = require('../../lib/gdrive');

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return gdrive.startAuth(params, user);
});
