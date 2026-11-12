/**
 * Firefly Creative Production — REST Workflow API client (FFCPE_MODE=api).
 *
 * Contract from the service's published OpenAPI (https://run-workflow.adobe.io/openapi.json)
 * and the workflow's "Execute Graph (cURL)" snippet:
 *   POST /batch/execute              -> 202 { batchId, status, ... }  (Idempotency-Key supported)
 *   GET  /batch/{batchId}/status     -> pending|running|completed|failed|cancelled
 *   GET  /batch/{batchId}/executions -> per-asset { status, outputs[] | error }
 *   Headers: Authorization (Bearer), x-api-key, x-gw-ims-org-id, x-gw-ims-user-id
 * Auth: OAuth Server-to-Server credential (needs Developer access in the Firefly org).
 */
const { AppError } = require('./http');

const IMS_TOKEN = 'https://ims-na1.adobelogin.com/ims/token/v3';
const DEFAULT_BASE = 'https://run-workflow.adobe.io';
const DEFAULT_SCOPES = 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis';
// Mirrors the published workflow's Execute Graph body: inputs are nested per asset.
const DEFAULT_TEMPLATE = '{"workflow":{"workflowId":"{{workflowId}}","inputs":[[{"node_id":"{{productNodeId}}","content":[{"presignedUrl":"{{sourceUrl}}"}]}]]}}';

let cachedToken = null; // { token, exp } per warm container

function requireConfig(params) {
  ['FFCPE_WORKFLOW_ID', 'FFCPE_CLIENT_ID', 'FFCPE_CLIENT_SECRET', 'FFCPE_IMS_ORG_ID'].forEach((k) => {
    if (!params[k]) throw new AppError(500, 'misconfigured', `Firefly Creative Production API is not configured (${k} missing).`);
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

function headers(params, token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': params.FFCPE_CLIENT_ID,
    'x-gw-ims-org-id': params.FFCPE_IMS_ORG_ID,
    ...(params.FFCPE_IMS_USER_ID ? { 'x-gw-ims-user-id': params.FFCPE_IMS_USER_ID } : {}),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
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

async function call(params, method, path, body, fetchImpl = fetch, extraHeaders = {}) {
  const token = await serviceToken(params, fetchImpl);
  const base = (params.FFCPE_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
  let res;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method, headers: headers(params, token, extraHeaders), body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new AppError(502, 'ffcpe-unreachable', 'Firefly Creative Production could not be reached.');
    err.uncertain = method === 'POST';
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 429) throw new AppError(429, 'ffcpe-rate-limited', 'Firefly Creative Production is rate limiting requests. Try again shortly.');
  if (!res.ok) {
    const message = json?.message || json?.error?.message || json?.error || json?.title || `HTTP ${res.status}`;
    throw new AppError(502, 'ffcpe-error', `Firefly Creative Production rejected the request: ${message}`);
  }
  return json;
}

/** Starts one batch for one source asset. Returns { batchId }. */
async function execute(params, values, fetchImpl = fetch, { idempotencyKey } = {}) {
  requireConfig(params);
  const body = fillTemplate(params.FFCPE_EXECUTE_TEMPLATE || DEFAULT_TEMPLATE, { workflowId: params.FFCPE_WORKFLOW_ID, ...values });
  const raw = await call(params, 'POST', '/batch/execute', body, fetchImpl, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {});
  const batchId = raw.batchId || raw.id || raw.batch?.id;
  if (!batchId) throw new AppError(502, 'ffcpe-error', 'Firefly Creative Production did not return a batch ID.');
  return { batchId: String(batchId) };
}

async function batchStatus(params, batchId, fetchImpl = fetch) {
  requireConfig(params);
  return call(params, 'GET', `/batch/${encodeURIComponent(batchId)}/status`, null, fetchImpl);
}

async function executions(params, batchId, fetchImpl = fetch) {
  requireConfig(params);
  return call(params, 'GET', `/batch/${encodeURIComponent(batchId)}/executions`, null, fetchImpl);
}

module.exports = {
  execute, batchStatus, executions, fillTemplate, DEFAULT_TEMPLATE,
  _reset: () => { cachedToken = null; },
};
