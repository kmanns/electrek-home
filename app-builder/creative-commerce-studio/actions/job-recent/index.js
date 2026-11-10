/* job-recent: authenticated web action (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const jobs = require('../../lib/jobs');

const handler = ({ user }) => jobs.recent(user);

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return handler({ params, user, body });
});
