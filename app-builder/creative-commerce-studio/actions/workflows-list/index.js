/* workflows-list: the admin-curated Firefly workflows authors may choose (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const workflows = require('../../lib/workflows');

exports.main = webAction(async (params) => {
  await authenticate(params);
  return workflows.publicList(params);
});
