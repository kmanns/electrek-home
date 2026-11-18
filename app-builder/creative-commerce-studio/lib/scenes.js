/**
 * Fixed scene images (backgrounds, placement masks) that a workflow entry sends with
 * every run. They live in private App Builder Files under looks/, uploaded with
 * `npm run workflows:upload`; each run gets fresh short-lived read links.
 *
 * Checks (shared with the upload command, and repeated before every paid run):
 *   - the file exists and really is a PNG or JPEG
 *   - masks are PNG
 *   - an explicit width/height on the input matches the file
 *   - each channel's mask has the same pixel size as that channel's background
 */
const { AppError } = require('./http');
const { sniff } = require('./image');

const SCENE_URL_SECONDS = 60 * 60;

/** items: [{ file, role, width?, height?, kind }] (kind from sniff, or null). Returns problem strings. */
function check(items, label = '') {
  const where = label ? ` (${label})` : '';
  const problems = [];
  items.forEach((it) => {
    if (!it.kind) {
      problems.push(`${it.file}${where} is not a readable PNG or JPEG image.`);
      return;
    }
    if (it.role.endsWith('-mask') && it.kind.type !== 'image/png') {
      problems.push(`${it.file}${where} is a placement mask and must be a PNG.`);
    }
    ['width', 'height'].forEach((d) => {
      if (it[d] && it.kind[d] && it.kind[d] !== it[d]) {
        problems.push(`${it.file}${where} is ${it.kind.width}×${it.kind.height}; the configuration expects ${d} ${it[d]}.`);
      }
    });
  });
  ['desktop', 'mobile'].forEach((channel) => {
    const bg = items.find((it) => it.role === `${channel}-background` && it.kind);
    const mask = items.find((it) => it.role === `${channel}-mask` && it.kind);
    if (bg && mask && bg.kind.width && mask.kind.width
      && (bg.kind.width !== mask.kind.width || bg.kind.height !== mask.kind.height)) {
      problems.push(`The ${channel} mask ${mask.file} is ${mask.kind.width}×${mask.kind.height} but its background ${bg.file} is ${bg.kind.width}×${bg.kind.height}${where}. They must match.`);
    }
  });
  return problems;
}

async function readScene(files, file) {
  try {
    const found = await files.list(file);
    if (!found?.length) return null;
    return Buffer.from(await files.read(file));
  } catch (e) {
    return null;
  }
}

/**
 * Checks a workflow entry's scene images in backend storage and returns them as run
 * inputs [{ nodeId, url, name, mimeType }]. Throws before anything is sent to Firefly.
 */
async function prepare(files, wf) {
  const inputs = wf.inputs || [];
  if (!inputs.length) return [];
  const items = await Promise.all(inputs.map(async (inp) => {
    const bytes = await readScene(files, inp.file);
    return {
      ...inp, missing: !bytes, kind: bytes ? sniff(bytes) : null,
    };
  }));
  const missing = items.filter((it) => it.missing).map((it) => it.file);
  if (missing.length) {
    throw new AppError(409, 'scenes-missing', `“${wf.label}” is missing scene images in backend storage: ${missing.join(', ')}. The site admin uploads them with “npm run workflows:upload”.`);
  }
  const problems = check(items, wf.label);
  if (problems.length) throw new AppError(409, 'scenes-invalid', `“${wf.label}” can’t run: ${problems.join(' ')}`);
  return Promise.all(items.map(async (it) => ({
    nodeId: it.nodeId,
    url: await files.generatePresignURL(it.file, { expiryInSeconds: SCENE_URL_SECONDS, permissions: 'r' }),
    name: it.file.split('/').pop(),
    mimeType: it.kind.type,
  })));
}

/** Fresh links for a job's recorded scene inputs (no re-check; used when the bridge picks a run up later). */
async function links(files, recipeInputs = []) {
  return Promise.all(recipeInputs.map(async (inp) => ({
    nodeId: inp.nodeId,
    url: await files.generatePresignURL(inp.file, { expiryInSeconds: SCENE_URL_SECONDS, permissions: 'r' }),
    name: inp.file.split('/').pop(),
    mimeType: inp.mimeType || (/\.png$/i.test(inp.file) ? 'image/png' : 'image/jpeg'),
  })));
}

module.exports = { check, prepare, links };
