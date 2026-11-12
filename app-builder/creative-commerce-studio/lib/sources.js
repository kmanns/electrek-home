/**
 * Source (file storage) connectors. Each connector exposes the same contract:
 *   startAuth, completeAuth, status, disconnect, listFolder, downloadVersion
 * A connector is offered to authors only when its settings are present.
 */
const { AppError } = require('./http');
const box = require('./box');
const gdrive = require('./gdrive');

const PROVIDERS = {
  box: {
    label: 'Box',
    module: box,
    configured: (p) => !!(p.BOX_CLIENT_ID && p.BOX_CLIENT_SECRET && p.BOX_REDIRECT_URI && p.BOX_ALLOWED_FOLDER_ID),
  },
  gdrive: {
    label: 'Google Drive',
    module: gdrive,
    configured: (p) => gdrive.configured(p),
  },
};

function get(params, provider) {
  const entry = PROVIDERS[provider];
  if (!entry) throw new AppError(400, 'bad-request', 'Unknown file storage provider.');
  if (!entry.configured(params)) throw new AppError(400, 'source-not-configured', `${entry.label} is not set up for this site.`);
  return entry.module;
}

/** Configured providers with the author's connection state. */
async function statusAll(params, user) {
  const providers = await Promise.all(Object.entries(PROVIDERS).map(async ([id, entry]) => {
    const isConfigured = entry.configured(params);
    if (!isConfigured) return { id, label: entry.label, configured: false, connected: false, user: null };
    const s = await entry.module.status(params, user).catch(() => ({ connected: false, user: null }));
    return {
      id, label: entry.label, configured: true, connected: !!s.connected, user: s.user || null,
    };
  }));
  return { providers };
}

module.exports = { get, statusAll, PROVIDERS };
