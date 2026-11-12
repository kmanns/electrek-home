/**
 * Production engines for one FFCPE run of the published workflow.
 *
 *   FFCPE_MODE=mcp (default)  per-author sign-in, run-workflow MCP tools
 *   FFCPE_MODE=api            server-to-server credential, REST Workflow API
 *
 * Both expose:
 *   submit(params, user, input, fetch) -> { batchId }
 *   poll(params, user, batchId, fetch) -> { state, message?, placements? }
 * state: queued | processing | rendered | render-failed | cancelled
 * placements: { desktop: {url, name, mimeType, nodeId}, mobile: {...} } matched by node ID.
 */
const { AppError } = require('./http');
const { withSession } = require('./mcp');
const ffcpe = require('./ffcpe');

function nodeIds(params) {
  const ids = {
    product: params.FFCPE_PRODUCT_NODE_ID,
    desktop: params.FFCPE_DESKTOP_NODE_ID,
    mobile: params.FFCPE_MOBILE_NODE_ID,
  };
  Object.entries(ids).forEach(([k, v]) => {
    if (!v) throw new AppError(500, 'misconfigured', `Firefly Creative Production is not configured (FFCPE_${k.toUpperCase()}_NODE_ID missing).`);
  });
  return ids;
}

/** Depth-first search for the first value under any of the given keys. */
function findValue(node, keys, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return undefined;
  // eslint-disable-next-line no-restricted-syntax
  for (const k of keys) {
    if (typeof node[k] === 'string' || typeof node[k] === 'number') return node[k];
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const v of Object.values(node)) {
    const found = findValue(v, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Collects every { nodeId, url } output entry anywhere in a status payload. */
function collectNodeOutputs(node, found = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 10) return found;
  if (Array.isArray(node)) {
    node.forEach((n) => collectNodeOutputs(n, found, depth + 1));
    return found;
  }
  const url = node.url || node.href || node.presignedUrl || node.downloadUrl;
  const nodeId = node.nodeId || node.node_id || node.actionId;
  if (typeof url === 'string' && /^https:\/\//.test(url) && nodeId) {
    found.push({
      nodeId: String(nodeId), url, name: node.name || '', mimeType: node.mimeType || node.contentType || '',
    });
  }
  Object.values(node).forEach((v) => { if (v && typeof v === 'object') collectNodeOutputs(v, found, depth + 1); });
  return found;
}

function collectErrors(node, found = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return found;
  if (Array.isArray(node)) { node.forEach((n) => collectErrors(n, found, depth + 1)); return found; }
  const failed = /fail|error/i.test(String(node.status || node.state || ''));
  const msg = node.error?.message || (typeof node.error === 'string' ? node.error : null) || (failed ? node.message : null);
  if (typeof msg === 'string' && msg) found.push(msg);
  Object.values(node).forEach((v) => { if (v && typeof v === 'object') collectErrors(v, found, depth + 1); });
  return found;
}

function failedCount(body) {
  const v = findValue(body, ['failedExecutions', 'failed', 'failedCount']);
  return typeof v === 'number' ? v : 0;
}

/** Maps a terminal status payload to placements by node ID, or a clear failure. */
function placementsFrom(params, body) {
  const ids = nodeIds(params);
  const outputs = collectNodeOutputs(body);
  const pick = (id) => outputs.find((o) => o.nodeId === id);
  const desktop = pick(ids.desktop);
  const mobile = pick(ids.mobile);
  if (!desktop || !mobile) {
    const seen = [...new Set(outputs.map((o) => o.nodeId))].join(', ') || 'none';
    return { state: 'render-failed', message: `The workflow finished but the desktop/mobile composites were not found (output nodes: ${seen}). Check FFCPE_DESKTOP_NODE_ID / FFCPE_MOBILE_NODE_ID.` };
  }
  return { state: 'rendered', placements: { desktop, mobile } };
}

function normalizeState(raw) {
  const s = String(raw || '').toLowerCase();
  if (['pending', 'queued', 'accepted', 'submitted', 'created'].includes(s)) return 'queued';
  if (['completed', 'complete', 'succeeded', 'success', 'done', 'finished'].includes(s)) return 'completed';
  if (['failed', 'error', 'errored'].includes(s)) return 'failed';
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled';
  return 'processing';
}

/* ---------- MCP engine ---------- */

const mcpEngine = {
  async submit(params, user, input, fetchImpl) {
    const ids = nodeIds(params);
    const result = await withSession(params, user, (s) => s.callTool(params.FFCPE_TOOL_SUBMIT || 'run_workflow_submit', {
      workflowId: params.FFCPE_WORKFLOW_ID,
      inputs: [{
        node_id: ids.product,
        content: [{
          type: 'image', url: input.sourceUrl, name: input.sourceName, mimeType: input.mimeType,
        }],
      }],
    }), fetchImpl);
    const batchId = findValue(result, ['batchId', 'batch_id', 'instanceId']);
    if (!batchId) {
      const why = findValue(result, ['message', 'error', 'text']);
      throw new AppError(502, 'ffcpe-error', `Firefly Creative Production did not accept the run${why ? `: ${String(why).slice(0, 200)}` : '.'}`);
    }
    return { batchId: String(batchId) };
  },

  async poll(params, user, batchId, fetchImpl) {
    const body = await withSession(params, user, (s) => s.callTool(params.FFCPE_TOOL_STATUS || 'run_workflow_get_status', {
      instanceId: batchId, includeOutputs: true, includeFailedExecutions: true,
    }), fetchImpl);
    const state = normalizeState(findValue(body, ['status', 'state', 'runtimeStatus']));
    if (state === 'queued' || state === 'processing') return { state };
    if (state === 'cancelled') return { state: 'cancelled', message: 'The Firefly run was cancelled.' };
    if (state === 'failed') return { state: 'render-failed', message: collectErrors(body)[0] || 'The Firefly workflow failed.' };
    const mapped = placementsFrom(params, body);
    if (mapped.state === 'render-failed' && failedCount(body) > 0) {
      return { state: 'render-failed', message: collectErrors(body)[0] || mapped.message };
    }
    return mapped;
  },
};

/* ---------- REST API engine (server-to-server credential) ---------- */

const apiEngine = {
  async submit(params, user, input, fetchImpl) {
    const ids = nodeIds(params);
    return ffcpe.execute(params, {
      sourceUrl: input.sourceUrl,
      sku: input.sku,
      jobId: input.jobId,
      productName: input.productName,
      sourceName: input.sourceName,
      productNodeId: ids.product,
    }, fetchImpl, { idempotencyKey: input.jobId });
  },

  async poll(params, user, batchId, fetchImpl) {
    const batch = await ffcpe.batchStatus(params, batchId, fetchImpl);
    const s = normalizeState(batch?.status || batch?.batch?.status);
    if (s === 'queued' || s === 'processing') return { state: s };
    const execs = await ffcpe.executions(params, batchId, fetchImpl);
    if (s === 'cancelled') return { state: 'cancelled', message: 'The Firefly batch was cancelled.' };
    if (s === 'failed') return { state: 'render-failed', message: collectErrors(execs)[0] || 'The Firefly workflow failed.' };
    return placementsFrom(params, execs);
  },
};

function engine(params) {
  return (params.FFCPE_MODE || 'mcp') === 'api' ? apiEngine : mcpEngine;
}

module.exports = {
  engine, mcpEngine, apiEngine, collectNodeOutputs, placementsFrom, normalizeState,
};
