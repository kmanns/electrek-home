/**
 * Durable delivery of approved renditions.
 *
 *   DELIVERY_MODE=aem     Product Visuals (AEM Assets) — needs the AEM_* credential
 *   DELIVERY_MODE=public  App Builder Files public/ area — durable public URL, no extra credential
 *   (default: aem when AEM_AUTHOR_URL is set, otherwise public)
 *
 * File names use a random token, never internal job or account IDs.
 */
const { AppError } = require('./http');
const store = require('./store');
const assets = require('./assets');
const { randomId } = require('./crypto');

function mode(params) {
  const m = params.DELIVERY_MODE || (params.AEM_AUTHOR_URL ? 'aem' : 'public');
  if (!['aem', 'public'].includes(m)) throw new AppError(500, 'misconfigured', 'DELIVERY_MODE must be aem or public.');
  return m;
}

function assetName(sku, placement, token, mimeType) {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return `${assets.safeName(sku)}-${placement}-${token}.${ext}`;
}

async function deliverPublic(params, {
  sku, placement, bytes, mimeType, token,
}) {
  const files = await store.getFiles();
  const path = `public/creative-commerce-studio/${assets.safeName(sku)}/${assetName(sku, placement, token, mimeType)}`;
  await files.write(path, bytes);
  const props = await files.getProperties(path);
  if (!props?.url || !/^https:\/\//.test(props.url)) {
    throw new AppError(502, 'delivery-failed', 'The rendition was stored but no public URL was returned.');
  }
  return { deliveryUrl: props.url, assetPath: path, mode: 'public' };
}

/** Delivers one placement. `token` must be stable per job+placement so retries are idempotent. */
async function deliver(params, input, fetchImpl = fetch) {
  const token = input.token || randomId(9).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
  if (mode(params) === 'aem') {
    const out = await assets.deliver(params, { ...input, fileName: assetName(input.sku, input.placement, token, input.mimeType) }, fetchImpl);
    return { ...out, mode: 'aem' };
  }
  return deliverPublic(params, { ...input, token });
}

module.exports = { deliver, mode, assetName };
