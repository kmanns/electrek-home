/**
 * Admin-curated Firefly Creative Production workflows that authors may choose from.
 *
 * FFCPE_WORKFLOWS: JSON array, one entry per published workflow:
 *   [{ "key": "spotlight", "label": "Product spotlight", "description": "…",
 *      "steps": ["Remove background", "Place in the desktop layout", "Place in the mobile layout"],
 *      "workflowId": "…", "productNodeId": "…", "desktopNodeId": "…", "mobileNodeId": "…" }]
 * The first entry is the default. Without FFCPE_WORKFLOWS, the single workflow from
 * FFCPE_WORKFLOW_ID + FFCPE_*_NODE_ID is offered (backwards compatible).
 *
 * Curated on purpose: each workflow must produce desktop/mobile composites at known
 * nodes, which Firefly does not report, so authors can't pick arbitrary workflows.
 */
const { AppError } = require('./http');

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REQUIRED = ['workflowId', 'productNodeId', 'desktopNodeId', 'mobileNodeId'];
const DEFAULT_STEPS = ['Remove background', 'Place in the desktop layout', 'Place in the mobile layout'];

function clean(text, max) {
  return typeof text === 'string' ? text.trim().slice(0, max) : '';
}

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
  }];
}

/** All configured workflows (validated). Throws a readable error on bad configuration. */
function list(params) {
  const raw = params.FFCPE_WORKFLOWS;
  if (!raw) return fromSingle(params);
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new AppError(500, 'misconfigured', 'FFCPE_WORKFLOWS is not valid JSON. It must be one line in .env.');
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new AppError(500, 'misconfigured', 'FFCPE_WORKFLOWS must be a non-empty JSON array.');
  }
  const seen = new Set();
  return parsed.map((w, i) => {
    const key = clean(w?.key, 40).toLowerCase();
    if (!KEY_RE.test(key)) throw new AppError(500, 'misconfigured', `FFCPE_WORKFLOWS entry ${i + 1}: "key" must be lowercase letters, digits or dashes.`);
    if (seen.has(key)) throw new AppError(500, 'misconfigured', `FFCPE_WORKFLOWS: duplicate key "${key}".`);
    seen.add(key);
    REQUIRED.forEach((f) => {
      if (!clean(w[f], 200)) throw new AppError(500, 'misconfigured', `FFCPE_WORKFLOWS entry "${key}": "${f}" is missing.`);
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
    };
  });
}

/** The workflow an author may run: the requested key, or the default (first) one. */
function resolve(params, key) {
  const all = list(params);
  if (!all.length) throw new AppError(500, 'misconfigured', 'No Firefly Creative Production workflow is configured (FFCPE_WORKFLOWS or FFCPE_WORKFLOW_ID).');
  if (!key) return all[0];
  const found = all.find((w) => w.key === String(key));
  if (!found) throw new AppError(400, 'workflow-not-allowed', 'That workflow is not available on this site. Reload the plugin and choose again.');
  return found;
}

/** What authors see: no node IDs. */
function publicList(params) {
  const all = list(params);
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
  list, resolve, publicList, scoped, DEFAULT_STEPS,
};
