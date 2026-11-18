/*
 * workflows-upload-urls: short-lived upload links for the workflow list and its scene images,
 * used by the site admin's "npm run workflows:upload" (ADMIN_TOKEN, or BRIDGE_TOKEN in bridge mode).
 * Links are created here, inside App Builder, so the admin's computer needs no storage credentials.
 */
const { webAction, AppError } = require('../../lib/http');
const { authenticateAdmin } = require('../../lib/bridge-auth');
const store = require('../../lib/store');
const workflows = require('../../lib/workflows');

const LINK_SECONDS = 10 * 60;
const MAX_FILES = 60;

async function uploadLinks(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > MAX_FILES) {
    throw new AppError(400, 'bad-request', `Send 1 to ${MAX_FILES} file paths.`);
  }
  const unique = [...new Set(paths.map(String))];
  const bad = unique.filter((p) => p !== workflows.CONFIG_PATH && !workflows.FILE_RE.test(p));
  if (bad.length) throw new AppError(400, 'bad-request', `Not an allowed upload path: ${bad.join(', ')}`);
  const files = await store.getFiles();
  const links = {};
  await Promise.all(unique.map(async (p) => {
    links[p] = await files.generatePresignURL(p, { expiryInSeconds: LINK_SECONDS, permissions: 'w' });
  }));
  return { links, expiresInSeconds: LINK_SECONDS };
}

exports.main = webAction(async (params, body) => {
  authenticateAdmin(params);
  return uploadLinks(body.files);
});
exports.uploadLinks = uploadLinks;
