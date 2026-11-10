/**
 * Firefly Creative Production — Workflow API client.
 *
 * Documented (developer.adobe.com/firefly-services/docs/workflow-builder-api):
 *   OAuth Server-to-Server (scopes incl. firefly_api, ff_apis)
 *   POST /batch/execute            -> 202 { batchId, status, ... }
 *   GET  /batch/{batchId}/status   -> pending|running|completed|failed|cancelled
 *   GET  /batch/{batchId}/executions -> per-asset { status, outputs | error }
 *
 * NOT publicly documented, therefore configuration (verify against your tenant's
 * authenticated API reference before the first paid run):
 *   FFCPE_API_BASE          base URL of the Workflow API
 *   FFCPE_EXECUTE_TEMPLATE  JSON body for /batch/execute with placeholders
 *   FFCPE_OUTPUT_MATCH      JSON { "desktop": "<substring>", "mobile": "<substring>" }
 */
const { AppError } = require('./http');

const IMS_TOKEN = 'https://ims-na1.adobelogin.com/ims/token/v3';
const DEFAULT_SCOPES = 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis';

let cachedToken = null; // { token, exp } per warm container

function requireConfig(params) {
  ['FFCPE_API_BASE', 'FFCPE_WORKFLOW_ID', 'FFCPE_CLIENT_ID', 'FFCPE_CLIENT_SECRET', 'FFCPE_EXECUTE_TEMPLATE'].forEach((k) => {
    if (!params[k]) throw new AppError(500, 'misconfigured', `Firefly Creative Production is not configured (${k} missing).`);
  });
}

async function serviceToken(params, fetchImpl = fetch) {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const res = await fetchImpl(IMS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: params.FFCPE_CLIENT_ID,
      client_secret: params.FFCPE_CLIENT_SECRET,
      scope: params.FFCPE_SCOPES || DEFAULT_SCOPES,
    }),
  });
  if (!res.ok) throw new AppError(502, 'ffcpe-auth-failed', 'Could not authenticate with Firefly Creative Production. Check the server-to-server credential.');
  const body = await res.json();
  cachedToken = { token: body.access_token, exp: Date.now() + (Number(body.expires_in || 3600) - 300) * 1000 };
  return cachedToken.token;
}

function headers(params, token) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': params.FFCPE_CLIENT_ID,
    'Content-Type': 'application/json',
    'api-version': params.FFCPE_API_VERSION || '1.0',
  };
}

/** Replaces "{{name}}" placeholders anywhere in the template (values JSON-escaped). */
function fillTemplate(template, values) {
  const text = typeof template === 'string' ? template : JSON.stringify(template);
  const filled = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, name) => {
    if (!(name in values)) throw new AppError(500, 'misconfigured', `FFCPE_EXECUTE_TEMPLATE uses unknown placeholder {{${name}}}.`);
    return JSON.stringify(String(values[name])).slice(1, -1);
  });
  return JSON.parse(filled);
}

async function call(params, method, path, body, fetchImpl = fetch) {
  const token = await serviceToken(params, fetchImpl);
  const base = params.FFCPE_API_BASE.replace(/\/$/, '');
  let res;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method, headers: headers(params, token), body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new AppError(502, 'ffcpe-unreachable', 'Firefly Creative Production could not be reached.');
    err.uncertain = method === 'POST';
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 429) throw new AppError(429, 'ffcpe-rate-limited', 'Firefly Creative Production is rate limiting requests. Try again shortly.');
  if (!res.ok) {
    const message = json?.message || json?.error?.message || json?.title || `HTTP ${res.status}`;
    throw new AppError(502, 'ffcpe-error', `Firefly Creative Production rejected the request: ${message}`);
  }
  return json;
}

/** Starts one batch for one source asset. Returns { batchId, raw }. */
async function execute(params, values, fetchImpl = fetch) {
  requireConfig(params);
  const body = fillTemplate(params.FFCPE_EXECUTE_TEMPLATE, { workflowId: params.FFCPE_WORKFLOW_ID, ...values });
  const raw = await call(params, 'POST', '/batch/execute', body, fetchImpl);
  const batchId = raw.batchId || raw.id || raw.batch?.id;
  if (!batchId) throw new AppError(502, 'ffcpe-error', 'Firefly Creative Production did not return a batch ID.');
  return { batchId, raw };
}

async function batchStatus(params, batchId, fetchImpl = fetch) {
  requireConfig(params);
  return call(params, 'GET', `/batch/${encodeURIComponent(batchId)}/status`, null, fetchImpl);
}

async function executions(params, batchId, fetchImpl = fetch) {
  requireConfig(params);
  return call(params, 'GET', `/batch/${encodeURIComponent(batchId)}/executions`, null, fetchImpl);
}

/** Collects every { url, name } pair found in an executions response. */
function collectOutputs(node, found = [], ctxName = '') {
  if (Array.isArray(node)) {
    node.forEach((n) => collectOutputs(n, found, ctxName));
  } else if (node && typeof node === 'object') {
    const name = node.name || node.label || node.outputName || node.key || ctxName;
    const url = node.url || node.href || node.downloadUrl || node.presignedUrl;
    if (typeof url === 'string' && /^https:\/\//.test(url)) {
      found.push({
        url, name: String(name || ''), width: node.width, height: node.height, contentType: node.contentType || node.mimeType,
      });
    }
    Object.entries(node).forEach(([k, v]) => { if (v && typeof v === 'object') collectOutputs(v, found, name || k); });
  }
  return found;
}

/** Maps workflow outputs to desktop/mobile using FFCPE_OUTPUT_MATCH substrings. */
function mapPlacements(params, executionsBody) {
  const match = typeof params.FFCPE_OUTPUT_MATCH === 'string'
    ? JSON.parse(params.FFCPE_OUTPUT_MATCH || '{}') : (params.FFCPE_OUTPUT_MATCH || {});
  const desktopKey = (match.desktop || 'desktop').toLowerCase();
  const mobileKey = (match.mobile || 'mobile').toLowerCase();
  const outputs = collectOutputs(executionsBody?.executions || executionsBody?.items || executionsBody);
  const find = (key) => outputs.find((o) => `${o.name} ${new URL(o.url).pathname}`.toLowerCase().includes(key));
  const desktop = find(desktopKey);
  const mobile = find(mobileKey);
  if (!desktop || !mobile || desktop.url === mobile.url) {
    throw new AppError(502, 'ffcpe-outputs-unmapped', `Could not identify desktop and mobile outputs (found ${outputs.length}). Check FFCPE_OUTPUT_MATCH against your workflow's output names.`);
  }
  return { desktop, mobile };
}

/** Normalises batch + execution state to the job states the plugin understands. */
function interpret(statusBody, executionsBody) {
  const s = String(statusBody?.status || statusBody?.batch?.status || '').toLowerCase();
  if (['pending', 'queued'].includes(s)) return { state: 'queued' };
  if (['running', 'in_progress', 'processing'].includes(s)) return { state: 'processing' };
  if (s === 'cancelled') return { state: 'cancelled', message: 'The Firefly batch was cancelled.' };
  if (s === 'failed') {
    const errors = collectErrors(executionsBody);
    return { state: 'render-failed', message: errors[0] || 'The Firefly workflow failed.' };
  }
  if (s === 'completed') {
    const list = executionsBody?.executions || executionsBody?.items || [];
    const failed = list.filter((e) => String(e.status).toLowerCase() === 'failed');
    if (failed.length) return { state: 'render-failed', message: collectErrors(executionsBody)[0] || 'The workflow finished with failed executions.' };
    return { state: 'rendered' };
  }
  return { state: 'processing' };
}

function collectErrors(body) {
  const list = body?.executions || body?.items || [];
  return list.map((e) => e.error?.message || e.error || e.message).filter((m) => typeof m === 'string');
}

module.exports = {
  execute, batchStatus, executions, mapPlacements, interpret, fillTemplate, collectOutputs,
  _reset: () => { cachedToken = null; },
};
