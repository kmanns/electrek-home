/* box-status: authenticated web action (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const box = require('../../lib/box');

const handler = ({ params, user }) => box.status(params, user);

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return handler({ params, user, body });
});
