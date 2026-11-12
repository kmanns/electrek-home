/**
 * Client for the Creative Commerce Studio App Builder actions.
 *
 * The backend URL comes only from the site's own config.json
 * (public.default["creative-commerce-studio"]["backend-url"]) — never from the
 * plugin URL — so the author's token can only be sent to the configured host.
 * The author's Workspace (IMS) token is passed as a bearer token; the backend
 * validates it and derives the author identity from it.
 */
import { loadSiteConfig } from './catalog.js';

export class BackendError extends Error {
  constructor(message, { status, code, detail } = {}) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function getBackendUrl() {
  const config = await loadSiteConfig();
  const url = config['creative-commerce-studio']?.['backend-url'];
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Backend URL must use https.');
  return parsed.href.replace(/\/$/, '');
}

/** @param {() => string|null} getToken returns the author's current IMS token */
export function createBackend(getToken) {
  async function call(action, body) {
    const token = getToken();
    const base = await getBackendUrl();
    if (!base) {
      throw new BackendError('The Creative Commerce Studio backend is not configured for this site.', { code: 'not-configured' });
    }
    if (!token) {
      throw new BackendError('Open this plugin from an Experience Workspace document to sign in.', { code: 'no-session' });
    }
    let res;
    try {
      res = await fetch(`${base}/${action}`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      throw new BackendError('The backend could not be reached. Check your connection and try again.', { code: 'network' });
    }
    let json = {};
    try { json = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok || json.error) {
      throw new BackendError(json.error?.message || `Request failed (${res.status}).`, {
        status: res.status,
        code: json.error?.code,
        detail: json.error?.detail,
      });
    }
    return json;
  }

  return {
    origin: async () => {
      const base = await getBackendUrl();
      return base ? new URL(base).origin : null;
    },
    boxStatus: () => call('box-status'),
    boxAuthStart: () => call('box-auth-start'),
    boxDisconnect: () => call('box-disconnect'),
    fireflyStatus: () => call('firefly-status'),
    fireflyAuthStart: () => call('firefly-auth-start'),
    fireflyDisconnect: () => call('firefly-disconnect'),
    boxFiles: (folderId) => call('box-files', { folderId }),
    jobSubmit: (payload) => call('job-submit', payload),
    jobStatus: (jobId) => call('job-status', { jobId }),
    jobAccept: (jobId) => call('job-accept', { jobId }),
    jobRecent: () => call('job-recent'),
  };
}
