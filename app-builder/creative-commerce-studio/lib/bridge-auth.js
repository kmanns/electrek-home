/**
 * Authenticates the operator's local Firefly bridge (FFCPE_MODE=bridge, DEMO ONLY).
 * The bridge sends `Authorization: Bearer <BRIDGE_TOKEN>`; BRIDGE_TOKEN is a random
 * secret (32+ chars) known only to the App Builder workspace and the operator's machine.
 */
const crypto = require('crypto');
const { AppError } = require('./http');

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

function authenticateBridge(params) {
  if ((params.FFCPE_MODE || 'mcp') !== 'bridge') {
    throw new AppError(404, 'bridge-disabled', 'The local Firefly bridge is not enabled (FFCPE_MODE is not bridge).');
  }
  const expected = params.BRIDGE_TOKEN || '';
  if (expected.length < 32) throw new AppError(500, 'misconfigured', 'BRIDGE_TOKEN must be set (32+ random characters).');
  const header = params.__ow_headers?.authorization || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || !crypto.timingSafeEqual(digest(match[1]), digest(expected))) {
    throw new AppError(401, 'bridge-unauthorized', 'Bridge token rejected.');
  }
}

module.exports = { authenticateBridge };
