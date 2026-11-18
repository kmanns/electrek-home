/**
 * Admin-curated Firefly Creative Production workflows that authors may choose from.
 *
 * Where the list comes from (first match wins):
 *   1. FFCPE_WORKFLOWS: a one-line JSON array in .env (needs a redeploy to change).
 *   2. workflows.json uploaded with `npm run workflows:upload` (App Builder Files,
 *      private path config/workflows.json; changes apply without a redeploy).
 *   3. The single workflow from FFCPE_WORKFLOW_ID + FFCPE_*_NODE_ID (backwards compatible).
 *
 * One entry per choice authors see:
 *   { "key": "spotlight", "label": "Product spotlight", "description": "…",
 *     "steps": ["Remove background", "…"],
 *     "workflowId": "…", "productNodeId": "…", "desktopNodeId": "…", "mobileNodeId": "…",
 *     "inputs": [ { "nodeId": "…", "file": "looks/workshop/desktop-background.jpg",
 *                   "role": "desktop-background" }, … ] }
 * The first entry is the default. "inputs" are optional fixed images (for example a
 * scene background and placement mask) that the backend sends with every run of that
 * entry, from private backend storage. Several entries may share one workflowId.
 *
 * Curated on purpose: each workflow must produce desktop/mobile composites at known
 * nodes, which Firefly does not report, so authors can't pick arbitrary workflows.
 */
const { AppError } = require('./http');

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REQUIRED = ['workflowId', 'productNodeId', 'desktopNodeId', 'mobileNodeId'];
const DEFAULT_STEPS = ['Remove background', 'Place in the desktop layout', 'Place in the mobile layout'];
const CONFIG_PATH = 'config/workflows.json';
// Private Files paths only (never public/), no "..", PNG or JPEG.
const FILE_RE = /^looks\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:png|jpe?g)$/i;
const ROLES = ['desktop-background', 'desktop-mask', 'mobile-background', 'mobile-mask', 'other'];
const MAX_INPUTS = 10;

function clean(text, max) {
  return typeof text === 'string' ? text.trim().slice(0, max) : '';
}

const misconfigured = (where, message) => new AppError(500, 'misconfigured', `${where}: ${message}`);

function fromSingle(params) {
  if (!params.FFCPE_WORKFLOW_ID) return [];
  return [{
    key: 'default',
    label: clean(params.FFCPE_WORKFLOW_LABEL, 60) || 'Product spotlight',
    description: '',
    steps: DEFAULT_STEPS,
    workflowId: params.FFCPE_WORKFLOW_ID,
    productNodeId: params.FFCPE_PRODUCT_NODE_ID,
    desktopNodeId: params.FFCPE_DESKTOP_NODE_ID,
    mobileNodeId: params.FFCPE_MOBILE_NODE_ID,
    inputs: [],
  }];
}

function parseInputs(where, key, w) {
  if (w.inputs === undefined || w.inputs === null) return [];
  if (!Array.isArray(w.inputs)) throw misconfigured(where, `entry "${key}": "inputs" must be a list.`);
  if (w.inputs.length > MAX_INPUTS) throw misconfigured(where, `entry "${key}": at most ${MAX_INPUTS} inputs.`);
  const nodes = new Set([clean(w.productNodeId, 200)]);
  return w.inputs.map((inp, i) => {
    const at = `entry "${key}", input ${i + 1}`;
    const nodeId = clean(inp?.nodeId, 200);
    const file = clean(inp?.file, 300);
    const role = clean(inp?.role, 40) || 'other';
    if (!nodeId) throw misconfigured(where, `${at}: "nodeId" is missing.`);
    if (nodes.has(nodeId)) throw misconfigured(where, `${at}: node "${nodeId}" is used twice (or is the product input).`);
    nodes.add(nodeId);
    if (!FILE_RE.test(file)) throw misconfigured(where, `${at}: "file" must be a PNG or JPEG path under looks/, for example looks/workshop/desktop-background.jpg.`);
    if (!ROLES.includes(role)) throw misconfigured(where, `${at}: "role" must be one of ${ROLES.join(', ')}.`);
    const out = { nodeId, file, role };
    ['width', 'height'].forEach((d) => {
      if (inp[d] === undefined) return;
      if (!Number.isInteger(inp[d]) || inp[d] < 1) throw misconfigured(where, `${at}: "${d}" must be a whole number of pixels.`);
      out[d] = inp[d];
    });
    return out;
  });
}

/** Validates a parsed or raw (JSON text) list. Shared with the upload command. */
function parse(raw, where = 'FFCPE_WORKFLOWS') {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw misconfigured(where, where === 'FFCPE_WORKFLOWS' ? 'is not valid JSON. It must be one line in .env.' : 'is not valid JSON.');
  }
  if (!Array.isArray(parsed) || !parsed.length) throw misconfigured(where, 'must be a non-empty JSON array.');
  const seen = new Set();
  return parsed.map((w, i) => {
    const key = clean(w?.key, 40).toLowerCase();
    if (!KEY_RE.test(key)) throw misconfigured(where, `entry ${i + 1}: "key" must be lowercase letters, digits or dashes.`);
    if (seen.has(key)) throw misconfigured(where, `duplicate key "${key}".`);
    seen.add(key);
    REQUIRED.forEach((f) => {
      if (!clean(w[f], 200)) throw misconfigured(where, `entry "${key}": "${f}" is missing.`);
    });
    const steps = Array.isArray(w.steps) ? w.steps.map((s) => clean(s, 80)).filter(Boolean).slice(0, 8) : [];
    return {
      key,
      label: clean(w.label, 60) || key,
      description: clean(w.description, 300),
      steps,
      workflowId: clean(w.workflowId, 200),
      productNodeId: clean(w.productNodeId, 200),
      desktopNodeId: clean(w.desktopNodeId, 200),
      mobileNodeId: clean(w.mobileNodeId, 200),
      inputs: parseInputs(where, key, w),
    };
  });
}

/** The uploaded workflows.json, or null when none has been uploaded. */
async function uploaded() {
  // eslint-disable-next-line global-require
  const store = require('./store');
  const files = await store.getFiles();
  const found = await files.list(CONFIG_PATH);
  if (!found?.length) return null;
  const bytes = await files.read(CONFIG_PATH);
  return Buffer.from(bytes).toString('utf8');
}

/** Where the list comes from: 'env' (FFCPE_WORKFLOWS), 'uploaded' (workflows.json), 'single' or 'none'. */
async function source(params) {
  if (params.FFCPE_WORKFLOWS) return { source: 'env', text: params.FFCPE_WORKFLOWS };
  const text = await uploaded();
  if (text) return { source: 'uploaded', text };
  return { source: params.FFCPE_WORKFLOW_ID ? 'single' : 'none', text: null };
}

/** All configured workflows (validated). Throws a readable error on bad configuration. */
async function list(params) {
  const { source: from, text } = await source(params);
  if (from === 'env') return parse(text);
  if (from === 'uploaded') return parse(text, 'workflows.json');
  return fromSingle(params);
}

/** The workflow an author may run: the requested key, or the default (first) one. */
async function resolve(params, key) {
  const all = await list(params);
  if (!all.length) throw new AppError(500, 'misconfigured', 'No Firefly Creative Production workflow is configured (workflows.json, FFCPE_WORKFLOWS or FFCPE_WORKFLOW_ID).');
  if (!key) return all[0];
  const found = all.find((w) => w.key === String(key));
  if (!found) throw new AppError(400, 'workflow-not-allowed', 'That workflow is not available on this site. Reload the plugin and choose again.');
  return found;
}

/** What authors see: no node IDs, no file paths. */
async function publicList(params) {
  const all = await list(params);
  return {
    workflows: all.map(({
      key, label, description, steps,
    }) => ({
      key, label, description, steps,
    })),
    defaultKey: all[0]?.key || null,
  };
}

/** Settings overlaid with a job's recipe, so engines run that job's workflow and nodes. */
function scoped(params, recipe) {
  if (!recipe?.workflowId || !recipe.productNodeId) return params; // jobs from before the picker
  return {
    ...params,
    FFCPE_WORKFLOW_ID: recipe.workflowId,
    FFCPE_PRODUCT_NODE_ID: recipe.productNodeId,
    FFCPE_DESKTOP_NODE_ID: recipe.desktopNodeId,
    FFCPE_MOBILE_NODE_ID: recipe.mobileNodeId,
  };
}

module.exports = {
  list, parse, resolve, publicList, scoped, source, DEFAULT_STEPS, CONFIG_PATH, ROLES, FILE_RE,
};
