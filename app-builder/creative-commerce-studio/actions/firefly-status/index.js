/* firefly-status: authenticated web action (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const fireflyAuth = require('../../lib/firefly-auth');

const handler = ({ params, user }) => fireflyAuth.status(params, user);

exports.main = webAction(async (params) => {
  const user = await authenticate(params);
  return handler({ params, user });
});
