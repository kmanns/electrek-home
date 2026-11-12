/* gdrive-files: list the allowed Google Drive folder (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const gdrive = require('../../lib/gdrive');

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return gdrive.listFolder(params, user, body.folderId);
});
