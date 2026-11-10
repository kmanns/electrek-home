/**
 * Product Visuals (AEM Assets as a Cloud Service) delivery.
 *
 * 1. Ensure folder  AEM_TARGET_FOLDER/<sku>  (Assets HTTP API, class assetFolder)
 * 2. Direct binary upload: <folder>.initiateUpload.json -> PUT uploadURIs -> completeUpload
 * 3. Mark approved (dam:status=approved) so Dynamic Media with OpenAPI may deliver it
 * 4. Read jcr:uuid -> delivery URL  <AEM_DELIVERY_URL>/adobe/assets/urn:aaid:aem:<uuid>/as/<name>
 *
 * Renditions go to a campaign folder only. No Commerce SKU metadata is written,
 * so they never become catalog product images.
 * Auth: OAuth Server-to-Server credential with AEM API access (AEM_CLIENT_ID/SECRET/SCOPES).
 */
const { AppError } = require('./http');

const IMS_TOKEN = 'https://ims-na1.adobelogin.com/ims/token/v3';
let cachedToken = null;

function requireConfig(params) {
  ['AEM_AUTHOR_URL', 'AEM_DELIVERY_URL', 'AEM_CLIENT_ID', 'AEM_CLIENT_SECRET', 'AEM_SCOPES'].forEach((k) => {
    if (!params[k]) throw new AppError(500, 'misconfigured', `Product Visuals delivery is not configured (${k} missing).`);
  });
}

async function token(params, fetchImpl) {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const res = await fetchImpl(IMS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: params.AEM_CLIENT_ID, client_secret: params.AEM_CLIENT_SECRET, scope: params.AEM_SCOPES,
    }),
  });
  if (!res.ok) throw new AppError(502, 'delivery-auth-failed', 'Could not authenticate with AEM Assets. Check the AEM server-to-server credential.');
  const body = await res.json();
  cachedToken = { token: body.access_token, exp: Date.now() + (Number(body.expires_in || 3600) - 300) * 1000 };
  return cachedToken.token;
}

function damRoot(params) {
  const folder = (params.AEM_TARGET_FOLDER || '/content/dam/creative-commerce-studio').replace(/\/$/, '');
  if (!/^\/content\/dam\/[\w\-/]+$/.test(folder)) throw new AppError(500, 'misconfigured', 'AEM_TARGET_FOLDER must be under /content/dam.');
  return folder;
}

function safeName(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function aem(params, fetchImpl, path, init = {}) {
  const t = await token(params, fetchImpl);
  const base = params.AEM_AUTHOR_URL.replace(/\/$/, '');
  const res = await fetchImpl(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, ...(init.headers || {}) },
  });
  return res;
}

async function ensureFolder(params, fetchImpl, damPath) {
  const apiPath = damPath.replace(/^\/content\/dam/, '/api/assets');
  const res = await aem(params, fetchImpl, apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: 'assetFolder', properties: { 'jcr:title': damPath.split('/').pop() } }),
  });
  if (![200, 201, 409].includes(res.status)) {
    throw new AppError(502, 'delivery-failed', `Could not create the Product Visuals folder (${res.status}).`);
  }
}

async function exists(params, fetchImpl, assetPath) {
  const res = await aem(params, fetchImpl, `${assetPath}.json`);
  return res.ok ? res.json() : null;
}

async function upload(params, fetchImpl, folder, fileName, bytes, mimeType) {
  const init = await aem(params, fetchImpl, `${folder}.initiateUpload.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ fileName, fileSize: String(bytes.length) }),
  });
  if (!init.ok) throw new AppError(502, 'delivery-failed', `Product Visuals upload could not start (${init.status}).`);
  const plan = await init.json();
  const file = plan.files?.[0];
  if (!file?.uploadURIs?.length) throw new AppError(502, 'delivery-failed', 'Product Visuals did not return an upload target.');

  const parts = file.uploadURIs.length;
  const partSize = Math.ceil(bytes.length / parts);
  for (let i = 0; i < parts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const put = await fetchImpl(file.uploadURIs[i], {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: bytes.subarray(i * partSize, Math.min((i + 1) * partSize, bytes.length)),
    });
    if (!put.ok) throw new AppError(502, 'delivery-failed', `Uploading the binary failed (${put.status}).`);
  }
  const complete = await aem(params, fetchImpl, plan.completeURI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      fileName, mimeType, uploadToken: file.uploadToken, createVersion: 'false', replace: 'false',
    }),
  });
  if (!complete.ok) throw new AppError(502, 'delivery-failed', `Product Visuals did not accept the upload (${complete.status}).`);
}

async function approve(params, fetchImpl, assetPath, metadata) {
  const apiPath = assetPath.replace(/^\/content\/dam/, '/api/assets');
  const res = await aem(params, fetchImpl, apiPath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: 'asset', properties: { 'dam:status': 'approved', ...metadata } }),
  });
  if (!res.ok) throw new AppError(502, 'delivery-failed', `Could not approve the asset for delivery (${res.status}).`);
}

function deliveryUrl(params, uuid, fileName) {
  const base = params.AEM_DELIVERY_URL.replace(/\/$/, '');
  return `${base}/adobe/assets/urn:aaid:aem:${uuid}/as/${fileName}`;
}

async function waitForDelivery(fetchImpl, url, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetchImpl(`${url}?width=64`, { method: 'HEAD' }).catch(() => null);
    if (res?.ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 2500); });
  }
  return false;
}

/**
 * Delivers one rendition idempotently. Returns { deliveryUrl, assetPath }.
 * Re-running after a partial failure skips the upload when the asset exists.
 */
async function deliver(params, {
  sku, jobId, placement, bytes, mimeType, title,
}, fetchImpl = fetch) {
  requireConfig(params);
  const root = damRoot(params);
  const folder = `${root}/${safeName(sku)}`;
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const fileName = `${safeName(sku)}-${placement}-${safeName(jobId).slice(0, 12)}.${ext}`;
  const assetPath = `${folder}/${fileName}`;

  await ensureFolder(params, fetchImpl, root);
  await ensureFolder(params, fetchImpl, folder);
  if (!(await exists(params, fetchImpl, assetPath))) {
    await upload(params, fetchImpl, folder, fileName, bytes, mimeType);
  }
  await approve(params, fetchImpl, assetPath, { 'dc:title': title, 'dc:description': `Creative Commerce Studio ${placement} rendition (job ${jobId})` });
  const node = await exists(params, fetchImpl, assetPath);
  const uuid = node?.['jcr:uuid'];
  if (!uuid) throw new AppError(502, 'delivery-failed', 'The asset was uploaded but its ID could not be read.');
  const url = deliveryUrl(params, uuid, fileName);
  if (!(await waitForDelivery(fetchImpl, url))) {
    throw new AppError(504, 'delivery-pending', 'The images are uploaded and approved, but not yet available for delivery. Retry Accept in a minute.');
  }
  return { deliveryUrl: url, assetPath };
}

module.exports = {
  deliver, deliveryUrl, safeName, _reset: () => { cachedToken = null; },
};
