/* sources-status: configured file storage providers and connection state (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const sources = require('../../lib/sources');

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return sources.statusAll(params, user);
});
