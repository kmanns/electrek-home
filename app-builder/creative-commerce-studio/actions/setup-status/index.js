/* setup-status: what this install has configured, for the plugin's setup check (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const setup = require('../../lib/setup');

exports.main = webAction(async (params) => {
  const user = await authenticate(params);
  return setup.status(params, user);
});
