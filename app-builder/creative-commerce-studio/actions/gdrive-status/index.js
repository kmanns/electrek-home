/* gdrive-status: Google Drive connection state (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const gdrive = require('../../lib/gdrive');

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return gdrive.status(params, user);
});
