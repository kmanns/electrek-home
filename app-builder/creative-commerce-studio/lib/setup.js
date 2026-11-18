/**
 * Setup check: what this install has configured, for the plugin's setup panel.
 * Reports only states and labels (never secret values, node IDs or file contents).
 */
const store = require('./store');
const workflows = require('./workflows');
const sources = require('./sources');
const fireflyAuth = require('./firefly-auth');
const delivery = require('./delivery');

function encryptionKeyOk(params) {
  try {
    return Buffer.from(String(params.TOKEN_ENCRYPTION_KEY || ''), 'base64').length === 32;
  } catch (e) {
    return false;
  }
}

async function workflowStatus(params) {
  const out = {
    source: 'none', count: 0, labels: [], error: null, scenesMissing: [],
  };
  try {
    out.source = (await workflows.source(params)).source;
    const all = await workflows.list(params);
    out.count = all.length;
    out.labels = all.map((w) => w.label);
    const files = await store.getFiles();
    await Promise.all(all.map(async (w) => {
      const missing = [];
      await Promise.all((w.inputs || []).map(async (inp) => {
        const found = await files.list(inp.file).catch(() => []);
        if (!found?.length) missing.push(inp.file.split('/').pop());
      }));
      if (missing.length) out.scenesMissing.push({ workflow: w.label, count: missing.length });
    }));
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

async function status(params, user) {
  const [src, firefly, wf] = await Promise.all([
    sources.statusAll(params, user).catch((e) => ({ providers: [], error: e.message })),
    fireflyAuth.status(params, user).catch((e) => ({ connected: false, mode: params.FFCPE_MODE || 'mcp', error: e.message })),
    workflowStatus(params),
  ]);
  let deliveryMode = null;
  let deliveryError = null;
  try { deliveryMode = delivery.mode(params); } catch (e) { deliveryError = e.message; }
  return {
    encryptionKey: encryptionKeyOk(params),
    sources: src.providers.map(({
      id, label, configured, connected,
    }) => ({
      id, label, configured, connected,
    })),
    firefly: {
      mode: firefly.mode, connected: !!firefly.connected, bridgeOnline: firefly.bridgeOnline ?? null, error: firefly.error || null,
    },
    workflows: wf,
    delivery: { mode: deliveryMode, error: deliveryError },
  };
}

module.exports = { status, encryptionKeyOk };
