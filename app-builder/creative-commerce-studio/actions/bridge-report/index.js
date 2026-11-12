/* bridge-report: progress/results from the operator's local Firefly bridge (FFCPE_MODE=bridge, DEMO ONLY). */
const { webAction } = require('../../lib/http');
const { authenticateBridge } = require('../../lib/bridge-auth');
const jobs = require('../../lib/jobs');

exports.main = webAction(async (params, body) => {
  authenticateBridge(params);
  return jobs.bridgeReport(params, body);
});
