/* job-accept: authenticated web action (author IMS token required). */
const { webAction } = require('../../lib/http');
const { authenticate } = require('../../lib/auth');
const jobs = require('../../lib/jobs');

const handler = ({ params, user, body }) => jobs.accept(params, user, body.jobId);

exports.main = webAction(async (params, body) => {
  const user = await authenticate(params);
  return handler({ params, user, body });
});
