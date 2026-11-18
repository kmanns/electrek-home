/*
 * Creative Commerce Studio — Experience Workspace library plugin.
 *
 * Product -> Source -> Prepare -> Review -> Insert
 *
 * UI: Spectrum Web Components, Spectrum 2 theme (vendor/spectrum.js, built from ./build).
 * Browser side only: catalog lookup (public storefront API), UI state and
 * block insertion. Box/Google Drive OAuth and downloads, FFCPE runs and image
 * delivery all happen in the App Builder backend; no tokens are stored here.
 */
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import './vendor/spectrum.js';
import { lookupProduct, loadSiteConfig } from './lib/catalog.js';
import { createBackend, BackendError } from './lib/backend.js';
import { buildSpotlightHTML } from './lib/block-table.js';

const STEPS = ['Product', 'Source', 'Prepare', 'Review', 'Insert'];
const TERMINAL = ['ready-for-review', 'render-failed', 'delivery-failed', 'accepted', 'cancelled', 'submit-uncertain'];
const RERUNNABLE = ['render-failed', 'cancelled', 'submit-uncertain'];
const IMAGE_EXT = /\.(png|jpe?g)$/i;

/** Job status -> sp-status-light variant + author-facing label. */
const STATUS = {
  queued: ['neutral', 'Queued'],
  processing: ['info', 'Processing'],
  'ready-for-review': ['positive', 'Ready for review'],
  accepted: ['positive', 'Delivered'],
  'render-failed': ['negative', 'Production failed'],
  'delivery-failed': ['negative', 'Delivery failed'],
  'submit-uncertain': ['notice', 'Outcome unknown'],
  cancelled: ['neutral', 'Cancelled'],
};

const root = document.getElementById('ccs');

const DEFAULT_COPY = {
  headline: '', description: '', ctaLabel: 'Shop now', imageAlt: '', presentation: 'static',
};

const state = {
  step: 0,
  sdk: null, // { context, token, actions } when running inside Workspace
  backend: null,
  backendConfigured: false,
  sku: '',
  product: null,
  productError: null,
  sources: { checked: false, list: [], error: null }, // [{ id, label, connected, user }]
  provider: null, // selected file storage provider id (box | gdrive)
  firefly: {
    checked: false, connected: false, mode: null, error: null,
  },
  workflows: { checked: false, list: [], error: null }, // [{ key, label, description, steps }]
  workflowKey: null,
  folder: null, // { id, name, parentId, entries: [] }
  file: null, // { provider, id, name, versionId, size, thumbnail }
  confirmed: false,
  job: null,
  jobError: null,
  recent: [],
  copy: null, // set from DEFAULT_COPY below
  inserted: false, // the current banner was inserted into the page
  catalogConfigured: null, // the site config has a commerce-endpoint
  setup: { checked: false, data: null, error: null }, // setup-status (null data: older backend)
  setupOpen: null, // null: open automatically when something blocks a run
  busy: false,
  notice: null,
};
state.copy = { ...DEFAULT_COPY };

/* ---------- tiny DOM helper (createElement only) ---------- */

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function icon(name, slot) {
  return h(`sp-icon-${name}`, { slot });
}

function button(label, {
  variant = 'secondary', onClick, disabled, pending, iconName, treatment, size = 'm', quiet,
} = {}) {
  const b = h('sp-button', {
    variant, treatment, size, disabled: !!disabled, pending: !!pending, quiet, onClick,
  });
  if (iconName) b.append(icon(iconName, 'icon'));
  b.append(label);
  return b;
}

/** Spectrum 2 "inline alert" pattern from tokens. variant: informative|positive|notice|negative */
function alert(variant, heading, text) {
  return h(
    'div',
    { class: `ccs-alert is-${variant}`, role: variant === 'negative' ? 'alert' : 'status' },
    heading ? h('p', { class: 'ccs-alert-heading', text: heading }) : null,
    text ? h('p', { class: 'ccs-alert-text', text }) : null,
  );
}

function statusLight(status) {
  const [variant, label] = STATUS[status] || ['neutral', status];
  return h('sp-status-light', { variant, size: 's', text: label });
}

function errorText(err) {
  if (err instanceof BackendError && err.code === 'box-reauth') {
    return 'Your Box connection expired or was revoked. Reconnect Box to continue.';
  }
  if (err instanceof BackendError && err.code === 'gdrive-reauth') {
    return 'Your Google Drive connection expired or was revoked. Reconnect Google Drive to continue.';
  }
  if (err instanceof BackendError && err.code === 'firefly-reauth') {
    return 'Connect Firefly (again) to run production.';
  }
  if (err instanceof BackendError && err.code === 'firefly-signin-not-allowed') {
    return 'Adobe doesn’t let hosted apps sign in to Firefly Creative Production yet (only local tools). '
      + 'An administrator can switch this site to a server-to-server Firefly credential, or to the local Firefly bridge for demos.';
  }
  return err?.message || 'Something went wrong.';
}

function setNotice(type, text) {
  state.notice = text ? { type, text } : null;
}

/* ---------- identity binding: a job belongs to one SKU + one file version ---------- */

function jobMatchesSelection(job = state.job) {
  return !!job && !!state.product && !!state.file
    && job.sku === state.product.sku
    && (job.source?.provider || 'box') === state.file.provider
    && job.source?.fileId === state.file.id
    && job.source?.versionId === state.file.versionId
    && (!state.workflowKey || !job.recipe?.workflowKey
      || job.recipe.workflowKey === state.workflowKey);
}

function resetFrom(step) {
  if (step <= 0) { state.file = null; state.confirmed = false; }
  if (step <= 1) { state.confirmed = false; }
  if (step <= 2) { state.job = null; state.jobError = null; }
}

let render = () => {};

/* ---------- actions ---------- */

async function onLookup() {
  const sku = state.sku.trim();
  if (!sku || state.busy) return;
  state.busy = true;
  state.productError = null;
  render();
  try {
    const product = await lookupProduct(sku);
    if (!product) {
      state.product = null;
      state.productError = `No product with SKU “${sku}” in this store view.`;
    } else {
      if (state.product?.sku !== product.sku) {
        resetFrom(0);
        const oldAlt = !state.copy.imageAlt || state.copy.imageAlt === state.product?.name;
        if (oldAlt) state.copy.imageAlt = product.name;
      }
      state.product = product;
      if (!state.copy.imageAlt) state.copy.imageAlt = product.name;
    }
  } catch (e) {
    state.productError = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
}

const SOURCE_ICONS = { box: 'box', gdrive: 'folder' };

function currentSource() {
  return state.sources.list.find((p) => p.id === state.provider) || null;
}

async function openFolder(folderId) {
  const { provider } = state;
  if (!provider) return;
  try {
    const listing = await state.backend.sourceFiles(provider, folderId);
    if (state.provider !== provider) return; // author switched provider meanwhile
    state.folder = { ...listing.folder, entries: listing.entries || [] };
    state.sources.error = null;
  } catch (e) {
    if (/-reauth$/.test(e.code || '') && currentSource()) currentSource().connected = false;
    state.sources.error = errorText(e);
  }
}

async function refreshSources() {
  if (!state.backendConfigured) return;
  let list;
  try {
    const { providers = [] } = await state.backend.sourcesStatus();
    list = providers.filter((p) => p.configured);
  } catch (e) {
    // Older backends have no sources-status: fall back to Box only.
    try {
      const status = await state.backend.boxStatus();
      list = [{
        id: 'box', label: 'Box', connected: !!status.connected, user: status.user || null,
      }];
    } catch (err) {
      state.sources = { checked: true, list: [], error: errorText(err) };
      return;
    }
  }
  state.sources = {
    checked: true, list, error: list.length ? null : 'No file storage is set up for this site yet.',
  };
  if (!list.some((p) => p.id === state.provider)) {
    state.provider = (list.find((p) => p.connected) || list[0])?.id || null;
    state.folder = null;
  }
  if (currentSource()?.connected && !state.folder) await openFolder(null);
}

function onSwitchProvider(id) {
  if (id === state.provider) return;
  state.provider = id;
  state.folder = null;
  resetFrom(0);
  state.sources.error = null;
  render();
  if (currentSource()?.connected) openFolder(null).then(render);
}

/**
 * Opens a provider sign-in window and resolves when it reports back (or closes).
 * Messages are only accepted from the backend origin.
 */
async function signInPopup(authorizeUrl, provider, label) {
  const popup = window.open(authorizeUrl, `ccs-${provider}-auth`, 'popup,width=520,height=720');
  if (!popup) throw new Error(`The ${label} sign-in window was blocked. Allow pop-ups for this page and try again.`);
  const backendOrigin = await state.backend.origin();
  await new Promise((resolve) => {
    const watch = { timer: null, onMessage: null };
    const done = () => {
      window.removeEventListener('message', watch.onMessage);
      clearInterval(watch.timer);
      resolve();
    };
    watch.onMessage = (msg) => {
      if (msg.origin !== backendOrigin) return;
      const { type } = msg.data || {};
      if ((type === 'ccs-auth' && msg.data.provider === provider) || (provider === 'box' && type === 'ccs-box-auth')) done();
    };
    window.addEventListener('message', watch.onMessage);
    watch.timer = setInterval(() => { if (popup.closed) done(); }, 750);
  });
}

/** Sign-in pages may sever window.opener (COOP), so confirm via the backend for up to ~1 min. */
async function confirmConnected(refresh, isConnected) {
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await refresh();
    if (isConnected()) return;
    render();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 3000); });
  }
}

async function onConnectSource() {
  const source = currentSource();
  if (!source) return;
  state.busy = true;
  render();
  try {
    const { authorizeUrl } = await state.backend.sourceAuthStart(source.id);
    await signInPopup(authorizeUrl, source.id, source.label);
    await confirmConnected(refreshSources, () => !!currentSource()?.connected);
  } catch (e) {
    state.sources.error = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function refreshWorkflows() {
  if (!state.backendConfigured || !state.sdk) return;
  try {
    const { workflows = [], defaultKey = null } = await state.backend.workflowsList();
    state.workflows = { checked: true, list: workflows, error: null };
    if (!workflows.some((w) => w.key === state.workflowKey)) {
      state.workflowKey = defaultKey || workflows[0]?.key || null;
    }
  } catch (e) {
    // Older backends have no workflows-list: the backend's single workflow is used.
    state.workflows = { checked: true, list: [], error: null };
  }
}

/* ---------- setup check ---------- */

const DOCS = 'https://github.com/kmanns/creative-commerce-studio';
const DOC = {
  values: `${DOCS}#3-values-credentials-and-secrets-youll-fill-in`,
  install: `${DOCS}#install`,
  workflows: `${DOCS}#choosing-a-workflow`,
  production: `${DOCS}#production-readiness`,
  bridge: `${DOCS}/blob/main/backend/README.md#local-firefly-bridge-demo-only`,
  troubleshooting: `${DOCS}/blob/main/backend/README.md#troubleshooting`,
};

async function refreshSetup() {
  if (!state.backendConfigured || !state.sdk) return;
  try {
    state.setup = { checked: true, data: await state.backend.setupStatus(), error: null };
  } catch (e) {
    // Older backends have no setup-status: the panel falls back to the other status calls.
    const older = e instanceof BackendError && e.status === 404;
    state.setup = { checked: true, data: null, error: older ? null : errorText(e) };
  }
}

async function onRecheckSetup() {
  state.setup = { ...state.setup, checked: false };
  render();
  await Promise.all([refreshSetup(), refreshSources(), refreshFirefly(), refreshWorkflows()]);
  render();
}

/**
 * Setup items: { level: ok | warn | error | info, label, detail, who: admin | you | null, link }.
 * "error" blocks a run, "warn" may block it, "info" is for awareness.
 */
function setupItems() {
  const items = [];
  const add = (level, label, detail, extra = {}) => items.push({
    level, label, detail, who: null, link: null, ...extra,
  });
  if (!state.sdk) {
    add('error', 'Workspace', 'Open this plugin from a document in Experience Workspace to sign in and insert blocks.', { who: 'you' });
  } else add('ok', 'Workspace', 'Opened from a Workspace document.');
  if (state.catalogConfigured === false) {
    add('error', 'Commerce catalog', 'The site config has no commerce-endpoint, so products can’t be looked up.', { who: 'admin', link: DOC.values });
  } else if (state.catalogConfigured) add('ok', 'Commerce catalog', 'The site’s storefront catalog is configured.');
  if (!state.backendConfigured) {
    add('error', 'Backend', 'The site config has no Creative Commerce Studio backend-url.', { who: 'admin', link: DOC.values });
    return items;
  }
  if (!state.sdk) return items;
  if (!state.setup.checked) {
    add('info', 'Backend', 'Checking the setup…');
    return items;
  }
  if (state.setup.error) {
    add('error', 'Backend', `${state.setup.error} Check that the backend is deployed and that ALLOWED_ORIGINS includes this Workspace origin (${window.location.origin}).`, { who: 'admin', link: DOC.troubleshooting });
    return items;
  }
  add('ok', 'Backend', 'Reachable, and you’re signed in.');
  const d = state.setup.data || {
    sources: state.sources.list.map((x) => ({ ...x, configured: true })),
    firefly: {
      mode: state.firefly.mode, connected: state.firefly.connected, error: state.firefly.error,
    },
    workflows: {
      count: state.workflows.list.length || 1,
      labels: state.workflows.list.map((w) => w.label),
      scenesMissing: [],
    },
  };
  if (d.encryptionKey === false) {
    add('error', 'Encryption key', 'TOKEN_ENCRYPTION_KEY is missing or isn’t 32 bytes (base64), so sign-ins can’t be stored.', { who: 'admin', link: DOC.values });
  }
  const configured = (d.sources || []).filter((x) => x.configured);
  if (!configured.length) {
    add('error', 'File sources', 'Neither Box nor Google Drive is set up.', { who: 'admin', link: DOC.values });
  } else if (!configured.some((x) => x.connected)) {
    add('info', 'File sources', `${configured.map((x) => x.label).join(' and ')} available. Connect your account on the Source step.`, { who: 'you' });
  } else {
    add('ok', 'File sources', `${configured.filter((x) => x.connected).map((x) => x.label).join(' and ')} connected.`);
  }
  const ff = d.firefly || {};
  if (ff.error) add('error', 'Firefly', ff.error, { who: 'admin', link: DOC.troubleshooting });
  else if (ff.mode === 'bridge') {
    if (ff.connected) add('ok', 'Firefly', 'Local bridge online (demo mode).');
    else add('warn', 'Firefly', 'The local Firefly bridge is offline. Runs wait until the operator starts “npm run bridge”.', { who: 'admin', link: DOC.bridge });
  } else if (ff.mode === 'api') add('ok', 'Firefly', 'Server-to-server credential (production mode).');
  else if (ff.mode === 'mcp') {
    if (ff.connected) add('ok', 'Firefly', 'Connected with your Adobe account.');
    else add('warn', 'Firefly', 'Connect Firefly on the Prepare step. Adobe currently refuses hosted sign-in, so the site may need bridge or api mode.', { who: 'you', link: DOC.production });
  }
  const wf = d.workflows || {};
  if (wf.error) add('error', 'Workflows', wf.error, { who: 'admin', link: DOC.workflows });
  else if (!wf.count) add('error', 'Workflows', 'No Firefly Creative Production workflow is configured.', { who: 'admin', link: DOC.workflows });
  else {
    const names = (wf.labels || []).join(', ');
    add('ok', 'Workflows', `${wf.count} available${names ? `: ${names}` : ''}.`);
    (wf.scenesMissing || []).forEach((m) => add('warn', 'Scene images', `${m.count} scene image${m.count === 1 ? '' : 's'} for “${m.workflow}” ${m.count === 1 ? 'isn’t' : 'aren’t'} uploaded, so it can’t run. Upload them with “npm run workflows:upload”.`, { who: 'admin', link: DOC.workflows }));
  }
  const del = d.delivery;
  if (del?.error) add('error', 'Delivery', del.error, { who: 'admin', link: DOC.values });
  else if (del?.mode === 'public') add('info', 'Delivery', 'Approved images go to App Builder public storage (demo setup). Production uses Product Visuals.', { link: DOC.production });
  else if (del?.mode === 'aem') add('ok', 'Delivery', 'Approved images go to Product Visuals (AEM Assets).');
  return items;
}

const SETUP_LIGHT = {
  ok: 'positive', warn: 'notice', error: 'negative', info: 'info',
};

function renderSetupCheck() {
  const items = setupItems();
  const errors = items.filter((i) => i.level === 'error').length;
  const warnings = items.filter((i) => i.level === 'warn').length;
  const checking = state.sdk && state.backendConfigured && !state.setup.checked;
  const open = state.setupOpen ?? (errors > 0);
  let summary = 'Ready';
  let variant = 'positive';
  if (checking) {
    summary = 'Checking…';
    variant = 'neutral';
  } else if (errors) {
    summary = `${errors} to fix before you can run`;
    variant = 'negative';
  } else if (warnings) {
    summary = `${warnings} to check`;
    variant = 'notice';
  }
  const card = h(
    'div',
    { class: `ccs-card is-subtle ccs-setup${open ? ' is-open' : ''}` },
    h(
      'div',
      { class: 'ccs-row ccs-setup-head' },
      h('sp-status-light', { variant, size: 's', text: `Setup check · ${summary}` }),
      h('sp-action-button', {
        size: 's', quiet: true, 'aria-expanded': String(open), onClick: () => { state.setupOpen = !open; render(); },
      }, open ? 'Hide' : 'Details'),
    ),
  );
  if (open) {
    const list = h('ul', { class: 'ccs-setup-list' });
    items.forEach((it) => list.append(h(
      'li',
      { class: `is-${it.level}` },
      h('sp-status-light', { variant: SETUP_LIGHT[it.level], size: 's', text: it.label }),
      h('p', { class: 'ccs-detail', text: it.detail }),
      it.who || it.link
        ? h(
          'p',
          { class: 'ccs-detail ccs-setup-meta' },
          it.who ? h('span', { class: 'ccs-setup-who', text: it.who === 'admin' ? 'Site admin' : 'You' }) : null,
          it.link ? h('a', {
            href: it.link, target: '_blank', rel: 'noopener', text: it.level === 'ok' || it.level === 'info' ? 'Learn more' : 'How to fix',
          }) : null,
        )
        : null,
    )));
    card.append(list, h(
      'div',
      { class: 'ccs-row' },
      h('sp-action-button', { size: 's', quiet: true, onClick: onRecheckSetup }, icon('refresh', 'icon'), 'Check again'),
      h('a', {
        class: 'ccs-detail', href: DOC.install, target: '_blank', rel: 'noopener', text: 'Setup guide',
      }),
    ));
  }
  return card;
}

function currentWorkflow() {
  return state.workflows.list.find((w) => w.key === state.workflowKey) || null;
}

function onSelectWorkflow(key) {
  if (key === state.workflowKey) return;
  state.workflowKey = key;
  state.jobError = null;
  render();
}

async function refreshFirefly() {
  if (!state.backendConfigured || !state.sdk) return;
  try {
    const status = await state.backend.fireflyStatus();
    state.firefly = {
      checked: true,
      connected: !!status.connected,
      mode: status.mode || 'mcp',
      lastSeenMs: status.lastSeenMs ?? null,
      error: null,
    };
  } catch (e) {
    state.firefly = {
      checked: true, connected: false, mode: null, error: errorText(e),
    };
  }
}

async function onConnectFirefly() {
  state.busy = true;
  render();
  try {
    const { authorizeUrl } = await state.backend.fireflyAuthStart();
    await signInPopup(authorizeUrl, 'firefly', 'Adobe Firefly');
    await confirmConnected(refreshFirefly, () => state.firefly.connected);
  } catch (e) {
    state.firefly.error = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function onDisconnectFirefly() {
  state.busy = true;
  render();
  try {
    await state.backend.fireflyDisconnect();
  } catch (e) { /* show disconnected either way */ }
  state.firefly = {
    checked: true, connected: false, mode: state.firefly.mode, error: null,
  };
  state.busy = false;
  render();
}

async function onDisconnectSource() {
  const source = currentSource();
  if (!source) return;
  state.busy = true;
  render();
  try {
    await state.backend.sourceDisconnect(source.id);
  } catch (e) { /* show disconnected either way */ }
  source.connected = false;
  source.user = null;
  state.folder = null;
  resetFrom(0);
  state.busy = false;
  render();
}

function onSelectFile(entry) {
  if (state.file?.id !== entry.id || state.file?.versionId !== entry.versionId) resetFrom(1);
  state.file = { ...entry, provider: state.provider };
  render();
}

let pollTimer = null;
setInterval(() => {
  if (state.step === 2 && state.job?.status === 'processing' && !document.activeElement?.closest?.('sp-textfield')) render();
}, 5000);
let pollDelay = 3000;

function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

async function pollJob(jobId) {
  stopPolling();
  if (state.job?.id !== jobId) return;
  try {
    const job = await state.backend.jobStatus(jobId);
    if (state.job?.id !== jobId) return; // selection changed while waiting
    state.job = job;
    state.jobError = null;
    if (job.status === 'ready-for-review' && state.step < 3) state.step = 3;
    if (!TERMINAL.includes(job.status)) {
      pollDelay = Math.min(Math.round(pollDelay * 1.5), 15000);
      pollTimer = setTimeout(() => pollJob(jobId), job.retryAfterMs || pollDelay);
    }
  } catch (e) {
    if (e.code === 'firefly-reauth') state.firefly.connected = false;
    state.jobError = errorText(e);
    // keep the job; the author can refresh status without resubmitting
  }
  render();
}

async function onSubmitJob() {
  if (!state.confirmed || state.busy || (state.job && !TERMINAL.includes(state.job.status))) return;
  state.busy = true;
  state.jobError = null;
  render();
  try {
    const job = await state.backend.jobSubmit({
      requestId: crypto.randomUUID(),
      sku: state.product.sku,
      productName: state.product.name,
      source: {
        provider: state.file.provider,
        fileId: state.file.id,
        versionId: state.file.versionId,
        name: state.file.name,
      },
      associationConfirmed: true,
      workflowKey: state.workflowKey || undefined,
    });
    state.job = job;
    pollDelay = 3000;
    pollJob(job.id);
  } catch (e) {
    if (e.code === 'firefly-reauth') state.firefly.connected = false;
    state.jobError = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function onAccept() {
  if (!jobMatchesSelection() || !['ready-for-review', 'delivery-failed'].includes(state.job.status)) return;
  state.busy = true;
  state.jobError = null;
  render();
  try {
    state.job = await state.backend.jobAccept(state.job.id);
    if (state.job.status === 'accepted') state.step = 4;
  } catch (e) {
    state.jobError = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
}

function spotlightData() {
  const out = state.job?.outputs || {};
  return {
    sku: state.product.sku,
    headline: state.copy.headline,
    description: state.copy.description,
    desktopImage: out.desktop?.deliveryUrl,
    mobileImage: out.mobile?.deliveryUrl,
    imageAlt: state.copy.imageAlt,
    ctaLabel: state.copy.ctaLabel || 'Shop now',
    presentation: state.copy.presentation,
  };
}

function onInsert() {
  setNotice(null);
  if (!jobMatchesSelection() || state.job.status !== 'accepted') {
    setNotice('negative', 'Only an accepted job for the selected product and file can be inserted.');
    render();
    return;
  }
  try {
    const html = buildSpotlightHTML(spotlightData());
    if (!state.sdk?.actions?.sendHTML) {
      setNotice('negative', 'Insertion is only available when the plugin is opened from a Workspace document.');
    } else {
      state.sdk.actions.sendHTML(html);
      state.inserted = true;
      setNotice('positive', 'Spotlight inserted at your cursor. Save and preview the page to see it.');
    }
  } catch (e) {
    setNotice('negative', errorText(e));
  }
  render();
}

async function refreshRecent() {
  if (!state.backendConfigured || !state.sdk) return;
  try {
    state.recent = (await state.backend.jobRecent()).jobs || [];
  } catch (e) { /* recent jobs are a convenience */ }
}

/**
 * Starts another banner. Connections, the open source folder and the workflow choice are
 * kept; the finished job stays in Recent jobs, so nothing is lost.
 * keepProduct: true goes straight to Source for the same product; false starts at Product.
 */
function onStartNew({ keepProduct }) {
  const accepted = state.job?.status === 'accepted';
  if (accepted && !state.inserted
    // eslint-disable-next-line no-alert
    && !window.confirm('This banner hasn’t been inserted into the page yet. It stays in Recent jobs, so you can come back to it. Start a new one?')) return;
  stopPolling();
  state.job = null;
  state.jobError = null;
  state.file = null;
  state.confirmed = false;
  state.inserted = false;
  state.copy = { ...DEFAULT_COPY, imageAlt: keepProduct ? state.product?.name || '' : '' };
  if (!keepProduct) {
    state.product = null;
    state.sku = '';
    state.productError = null;
  }
  setNotice(null);
  state.step = keepProduct ? 1 : 0;
  render();
  refreshRecent().then(render);
  // Put focus where the next action is.
  setTimeout(() => {
    if (!keepProduct) document.querySelector('#ccs-sku')?.focus();
  }, 0);
}

async function onResume(job) {
  state.busy = true;
  render();
  try {
    const product = await lookupProduct(job.sku);
    if (!product) throw new Error(`SKU ${job.sku} is no longer in the catalog.`);
    state.product = product;
    state.sku = product.sku;
    state.file = {
      provider: job.source.provider || 'box', id: job.source.fileId, versionId: job.source.versionId, name: job.source.name,
    };
    state.provider = state.file.provider;
    if (job.recipe?.workflowKey) state.workflowKey = job.recipe.workflowKey;
    state.confirmed = true;
    state.job = job;
    state.inserted = false;
    state.copy.imageAlt = state.copy.imageAlt || product.name;
    if (job.status === 'accepted') state.step = 4;
    else if (job.status === 'ready-for-review') state.step = 3;
    else state.step = 2;
    if (!TERMINAL.includes(job.status)) { pollDelay = 3000; pollJob(job.id); }
  } catch (e) {
    setNotice('negative', errorText(e));
  } finally {
    state.busy = false;
    render();
  }
}

/* ---------- step availability ---------- */

function canEnter(step) {
  switch (step) {
    case 0: return true;
    case 1: return !!state.product;
    case 2: return !!state.product && !!state.file && state.confirmed;
    case 3: return jobMatchesSelection() && ['ready-for-review', 'accepted', 'delivery-failed'].includes(state.job.status);
    case 4: return jobMatchesSelection() && state.job.status === 'accepted';
    default: return false;
  }
}

function goTo(step) {
  if (!canEnter(step)) return;
  state.step = step;
  setNotice(null);
  render();
  if (step === 2 && !state.firefly.checked) refreshFirefly().then(render);
  if (step === 2 && !state.workflows.checked) refreshWorkflows().then(render);
}

/* ---------- views ---------- */

function renderHeader() {
  return h(
    'header',
    { class: 'ccs-header' },
    h(
      'div',
      { class: 'ccs-brand' },
      h('span', { class: 'ccs-app-icon', 'aria-hidden': 'true' }, icon('magic-wand')),
      h(
        'div',
        {},
        h('h1', { class: 'ccs-title', text: 'Creative Commerce Studio' }),
        h('p', { class: 'ccs-subtitle', text: 'Box & Google Drive · Firefly Creative Production · Commerce' }),
      ),
    ),
    state.sdk ? null : alert('notice', null, 'Standalone preview. Open from a Workspace document to connect Box and insert blocks.'),
  );
}

function renderTabs() {
  const tabs = h('sp-tabs', {
    selected: String(state.step),
    size: 's',
    'aria-label': 'Steps',
    class: 'ccs-tabs',
    onChange: (e) => {
      const next = Number(e.target.selected);
      if (next !== state.step) {
        if (canEnter(next)) goTo(next);
        else e.target.selected = String(state.step);
      }
    },
  });
  STEPS.forEach((label, i) => {
    tabs.append(h('sp-tab', {
      label, value: String(i), disabled: !canEnter(i),
    }));
  });
  return tabs;
}

function renderContext() {
  const p = state.product;
  if (!p || state.step === 0) return null; // the Product step shows the full card
  return h(
    'div',
    { class: 'ccs-context' },
    p.image
      ? h('img', {
        class: 'ccs-context-thumb', src: p.image, alt: '', width: 40, height: 40,
      })
      : h('span', { class: 'ccs-context-thumb is-empty' }, icon('shopping-cart')),
    h(
      'div',
      { class: 'ccs-context-text' },
      h('p', { class: 'ccs-context-name', text: p.name }),
      h('p', { class: 'ccs-detail', text: state.file ? `${p.sku} · ${state.file.name}` : p.sku }),
    ),
    state.job ? statusLight(state.job.status) : null,
  );
}

function section(title, description, ...children) {
  return h(
    'section',
    { class: 'ccs-section', 'aria-labelledby': 'ccs-section-title' },
    h('h2', { class: 'ccs-heading', id: 'ccs-section-title', text: title }),
    description ? h('p', { class: 'ccs-body', text: description }) : null,
    ...children,
  );
}

function footer(...buttons) {
  return h('div', { class: 'ccs-footer' }, ...buttons);
}

function renderProductStep() {
  const p = state.product;
  const field = h('sp-textfield', {
    id: 'ccs-sku',
    value: state.sku,
    placeholder: 'e.g. STIHL-BGA200',
    autocomplete: 'off',
    invalid: !!state.productError,
    class: 'ccs-grow',
    onInput: (e) => { state.sku = e.target.value; },
    onKeydown: (e) => { if (e.key === 'Enter') onLookup(); },
  });
  field.append(icon('search', 'icon'));
  if (state.productError) field.append(h('sp-help-text', { slot: 'negative-help-text', icon: true, text: state.productError }));

  const children = [
    renderSetupCheck(),
    h('sp-field-label', { for: 'ccs-sku', text: 'Exact SKU', required: true }),
    h('div', { class: 'ccs-inline' }, field, button('Look up', {
      variant: 'primary', treatment: 'outline', pending: state.busy, onClick: onLookup,
    })),
  ];

  if (p) {
    children.push(h(
      'div',
      { class: 'ccs-card ccs-product' },
      p.image
        ? h('img', {
          src: p.image, alt: '', width: 72, height: 72, loading: 'lazy',
        })
        : null,
      h(
        'div',
        { class: 'ccs-product-text' },
        h('p', { class: 'ccs-strong', text: p.name }),
        h('p', { class: 'ccs-detail', text: `${p.sku} · ${p.type.replace('ProductView', '')} product` }),
        h('sp-status-light', { variant: p.inStock ? 'positive' : 'notice', size: 's', text: p.inStock ? 'In stock' : 'Out of stock' }),
        p.path
          ? h('p', { class: 'ccs-detail', text: `Links to ${p.path}` })
          : alert('negative', null, 'This product has no URL key, so it cannot be linked.'),
      ),
    ));
  }

  children.push(footer(button('Continue', { variant: 'accent', disabled: !p?.path, onClick: () => goTo(1) })));

  if (state.recent.length) {
    const acc = h('sp-accordion', { size: 's', class: 'ccs-recent' });
    const item = h('sp-accordion-item', { label: `Recent jobs (${state.recent.length})` });
    const list = h('ul', { class: 'ccs-list' });
    state.recent.forEach((job) => {
      list.append(h(
        'li',
        {},
        h(
          'div',
          { class: 'ccs-list-text' },
          h('p', { class: 'ccs-strong', text: job.sku }),
          h('p', { class: 'ccs-detail', text: `${job.source?.name || ''} · ${new Date(job.updatedAt).toLocaleString()}` }),
          statusLight(job.status),
        ),
        h('sp-action-button', { size: 's', quiet: true, onClick: () => onResume(job) }, 'Resume'),
      ));
    });
    item.append(list);
    acc.append(item);
    children.push(h('sp-divider', { size: 's' }), acc);
  }

  return section('Choose the product', 'Enter the SKU exactly as it appears in the catalog.', ...children);
}

function renderFileTile(entry) {
  if (entry.type === 'folder') {
    return h('li', {}, h(
      'button',
      {
        type: 'button',
        class: 'ccs-tile is-folder',
        onClick: async () => { await openFolder(entry.id); render(); },
      },
      h('span', { class: 'ccs-tile-media' }, icon('folder')),
      h('span', { class: 'ccs-tile-name', text: entry.name }),
    ));
  }
  const supported = IMAGE_EXT.test(entry.name);
  const selected = state.file?.id === entry.id;
  return h('li', {}, h(
    'button',
    {
      type: 'button',
      class: `ccs-tile${selected ? ' is-selected' : ''}`,
      disabled: !supported,
      'aria-pressed': selected ? 'true' : 'false',
      title: supported ? entry.name : `${entry.name}: only PNG or JPEG packshots are supported`,
      onClick: () => onSelectFile(entry),
    },
    h(
      'span',
      { class: 'ccs-tile-media' },
      entry.thumbnail ? h('img', {
        src: entry.thumbnail, alt: '', width: 120, height: 120, loading: 'lazy',
      }) : icon('image'),
      selected ? h('span', { class: 'ccs-tile-check' }, icon('checkmark-circle')) : null,
    ),
    h('span', { class: 'ccs-tile-name', text: entry.name }),
    supported ? null : h('span', { class: 'ccs-detail', text: 'Unsupported' }),
  ));
}

function versionLabel(id) {
  const v = String(id || '');
  return v.length > 14 ? `${v.slice(0, 12)}…` : v;
}

function renderProviderPicker() {
  const { list } = state.sources;
  if (list.length < 2) return null;
  return h(
    'div',
    { class: 'ccs-field' },
    h('sp-field-label', { text: 'File storage' }),
    h('div', { class: 'ccs-row ccs-providers', role: 'radiogroup', 'aria-label': 'File storage' }, list.map((p) => h(
      'sp-action-button',
      {
        size: 's',
        selected: p.id === state.provider,
        role: 'radio',
        'aria-checked': p.id === state.provider ? 'true' : 'false',
        onClick: () => onSwitchProvider(p.id),
      },
      icon(SOURCE_ICONS[p.id] || 'folder', 'icon'),
      p.label,
      p.connected ? h('span', { class: 'ccs-dot', 'aria-label': 'connected', title: 'Connected' }) : null,
    ))),
  );
}

function renderSourceStep() {
  const title = 'Choose the packshot';
  if (!state.backendConfigured) {
    return section(title, null, alert('notice', 'Backend not configured', 'An administrator needs to set creative-commerce-studio → backend-url in the site config.'));
  }
  if (!state.sdk) {
    return section(title, null, alert(
      'notice',
      'Workspace required',
      'Open this plugin from an Experience Workspace document to connect your file storage.',
    ));
  }
  const children = [];
  if (!state.sources.checked) {
    children.push(h(
      'div',
      { class: 'ccs-loading' },
      h('sp-progress-circle', { indeterminate: true, size: 's', label: 'Checking file storage connections' }),
      'Checking your file storage connections…',
    ));
    return section(title, null, ...children);
  }
  const picker = renderProviderPicker();
  if (picker) children.push(picker);
  if (state.sources.error) children.push(alert('negative', null, state.sources.error));
  const source = currentSource();
  if (!source) return section(title, null, ...children);

  if (!source.connected) {
    children.push(h(
      'div',
      { class: 'ccs-empty' },
      h('span', { class: 'ccs-empty-icon', 'aria-hidden': 'true' }, icon(SOURCE_ICONS[source.id] || 'folder')),
      h('p', { class: 'ccs-strong', text: `Connect your ${source.label} account` }),
      h('p', { class: 'ccs-body', text: 'Creative Commerce Studio only reads files from the configured campaign folder and never changes them.' }),
      button(`Connect ${source.label}`, { variant: 'accent', pending: state.busy, onClick: onConnectSource }),
    ));
    return section(title, null, ...children);
  }

  children.push(h(
    'div',
    { class: 'ccs-row' },
    h('sp-status-light', { variant: 'positive', size: 's', text: `${source.label}: ${source.user?.name || source.user?.login || 'connected'}` }),
    h('sp-action-button', {
      size: 's', quiet: true, disabled: state.busy, onClick: onDisconnectSource,
    }, 'Disconnect'),
  ));

  const { folder } = state;
  if (folder) {
    const crumb = h('div', { class: 'ccs-row' });
    if (folder.parentId) {
      crumb.append(h('sp-action-button', {
        size: 's', quiet: true, label: 'Back', onClick: async () => { await openFolder(folder.parentId); render(); },
      }, icon('chevron-left', 'icon')));
    }
    crumb.append(h('span', {}, icon('folder')), h('p', { class: 'ccs-strong', text: folder.name }));
    children.push(crumb);
    if (!folder.entries.length) children.push(h('p', { class: 'ccs-detail', text: 'This folder is empty.' }));
    children.push(h('ul', { class: 'ccs-tiles' }, folder.entries.map(renderFileTile)));
  } else {
    children.push(h(
      'div',
      { class: 'ccs-loading' },
      h('sp-progress-circle', { indeterminate: true, size: 's', label: 'Loading folder' }),
      'Loading the campaign folder…',
    ));
  }

  if (state.file) {
    const fromLabel = state.sources.list.find((p) => p.id === state.file.provider)?.label
      || state.file.provider;
    children.push(h(
      'div',
      { class: 'ccs-card is-subtle' },
      h('sp-checkbox', {
        checked: state.confirmed,
        onChange: (e) => { state.confirmed = e.target.checked; render(); },
      }, `I confirm “${state.file.name}” from ${fromLabel} (version ${versionLabel(state.file.versionId)}) shows ${state.product.name} (${state.product.sku}) and I am authorized to use it.`),
    ));
  }
  children.push(footer(
    button('Back', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(0) }),
    button('Continue', { variant: 'accent', disabled: !canEnter(2), onClick: () => goTo(2) }),
  ));
  return section(title, null, ...children);
}

function elapsedText(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return min ? `${min} min ${sec} s` : `${sec} s`;
}

/** Running-job progress: real percentage when the service reports steps, else indeterminate. */
function renderProgress(job) {
  if (job.status !== 'processing') return null;
  const p = job.progress;
  const known = p && Number.isFinite(p.percent);
  const label = known && p.total ? `Step ${p.done} of ${p.total}` : 'Producing placements';
  const bar = h('sp-progress-bar', {
    class: 'ccs-progress',
    size: 'm',
    label,
    indeterminate: !known,
    progress: known ? p.percent : undefined,
  });
  const meta = [
    job.startedAt ? `Running for ${elapsedText(job.startedAt)}` : null,
    'Runs usually take a few minutes and can take up to about 10.',
  ].filter(Boolean).join(' · ');
  return h('div', { class: 'ccs-progress-wrap' }, bar, h('p', { class: 'ccs-detail', text: meta }));
}

/**
 * A failed run where one placement still succeeded: show the image that was kept next to
 * the channel that failed. (Accepting needs both, so the author runs again.)
 */
function renderChannels(job) {
  const ch = job.channels;
  if (job.status !== 'render-failed' || !ch || !(ch.desktop?.ok || ch.mobile?.ok)) return null;
  const figure = (p, label) => {
    const o = job.outputs?.[p];
    const ok = ch[p]?.ok && o;
    return h(
      'figure',
      { class: `ccs-preview is-${p}${ok ? '' : ' is-failed'}` },
      ok && o.previewUrl
        ? h('img', {
          src: o.previewUrl, alt: `${label} output (kept)`, width: o.width || undefined, height: o.height || undefined,
        })
        : h('div', { class: 'ccs-preview-missing' }, icon('image')),
      h(
        'figcaption',
        { class: 'ccs-detail' },
        h('sp-status-light', { variant: ok ? 'positive' : 'negative', size: 's', text: ok ? `${label} ready` : `${label} failed` }),
      ),
    );
  };
  return h(
    'div',
    { class: 'ccs-channels' },
    h('div', { class: 'ccs-previews' }, figure('desktop', 'Desktop'), figure('mobile', 'Mobile')),
    h('p', { class: 'ccs-detail', text: 'Both images are needed to continue. Run again to produce a new pair; the kept image stays with this job.' }),
  );
}

const FALLBACK_STEPS = ['Remove background', 'Place in the desktop layout', 'Place in the mobile layout'];

function renderWorkflowDetails(wf) {
  const steps = wf ? wf.steps || [] : FALLBACK_STEPS;
  return [
    wf?.description ? h('p', { class: 'ccs-body', text: wf.description }) : null,
    steps.length ? h('ol', { class: 'ccs-recipe' }, steps.map((s) => h('li', { text: s }))) : null,
  ];
}

/** Workflow choice: radio cards when several are offered, a plain line when there is one. */
function renderWorkflowChoice() {
  const { list } = state.workflows;
  const wf = currentWorkflow();
  if (list.length > 1) {
    const group = h('sp-radio-group', {
      id: 'ccs-workflow',
      selected: state.workflowKey,
      name: 'workflow',
      vertical: true,
      onChange: (e) => onSelectWorkflow(e.target.selected),
    });
    list.forEach((w) => group.append(h('sp-radio', { value: w.key }, w.label)));
    return h(
      'div',
      { class: 'ccs-field ccs-workflow' },
      h('sp-field-label', { for: 'ccs-workflow', text: 'Workflow' }),
      group,
      h('div', { class: 'ccs-card is-subtle ccs-workflow-details' }, ...renderWorkflowDetails(wf)),
    );
  }
  if (list.length === 1) {
    return h(
      'div',
      { class: 'ccs-workflow' },
      h('p', { class: 'ccs-detail' }, 'Workflow: ', h('strong', { text: wf?.label || list[0].label })),
      ...renderWorkflowDetails(wf || list[0]),
    );
  }
  return h('div', { class: 'ccs-workflow' }, ...renderWorkflowDetails(null));
}

function renderPrepareStep() {
  const { job } = state;
  const running = job && !TERMINAL.includes(job.status);
  const children = [renderWorkflowChoice()];
  const ff = state.firefly;
  const needsFirefly = ff.mode === 'mcp' && !ff.connected;
  if (ff.error) children.push(alert('negative', null, ff.error));
  if (ff.mode === 'bridge') {
    children.push(alert(
      'notice',
      'Demo mode: local Firefly bridge',
      'Production runs on the operator’s computer with their own Firefly sign-in, and only while the bridge is running. '
        + 'Not for production use. See PRODUCTION-READINESS.md.',
    ));
    children.push(h(
      'div',
      { class: 'ccs-row' },
      ff.connected
        ? h('sp-status-light', { variant: 'positive', size: 's', text: 'Local Firefly bridge online' })
        : h('sp-status-light', { variant: 'notice', size: 's', text: 'Local Firefly bridge offline' }),
      h('sp-action-button', {
        size: 's', quiet: true, onClick: async () => { await refreshFirefly(); render(); },
      }, icon('refresh', 'icon'), 'Check'),
    ));
    if (!ff.connected) {
      children.push(h('p', { class: 'ccs-detail', text: 'Ask the operator to run “npm run bridge” in the backend folder. You can still queue the run now; it starts as soon as the bridge comes online.' }));
    }
  }
  if (!ff.checked && state.sdk && state.backendConfigured) {
    children.push(h('div', { class: 'ccs-loading' }, h('sp-progress-circle', { indeterminate: true, size: 's', label: 'Checking Firefly connection' }), 'Checking your Firefly connection…'));
  } else if (ff.mode === 'bridge') {
    // handled above
  } else if (needsFirefly) {
    children.push(h(
      'div',
      { class: 'ccs-empty' },
      h('span', { class: 'ccs-empty-icon', 'aria-hidden': 'true' }, icon('magic-wand')),
      h('p', { class: 'ccs-strong', text: 'Connect Adobe Firefly' }),
      h('p', { class: 'ccs-body', text: 'Sign in with the Adobe account that can run your Firefly Creative Production workflows. Runs use your own Firefly access.' }),
      button('Connect Firefly', {
        variant: 'accent', pending: state.busy, disabled: !state.sdk || !state.backendConfigured, onClick: onConnectFirefly,
      }),
    ));
  } else if (ff.mode === 'mcp') {
    children.push(h(
      'div',
      { class: 'ccs-row' },
      h('sp-status-light', { variant: 'positive', size: 's', text: 'Firefly connected' }),
      h('sp-action-button', {
        size: 's', quiet: true, disabled: state.busy, onClick: onDisconnectFirefly,
      }, 'Disconnect'),
    ));
  }
  if (job && !jobMatchesSelection(job)) {
    children.push(alert('notice', 'Selection changed', 'The product or source changed since this job started. Run production again for the current selection.'));
  }
  if (job) {
    children.push(h(
      'div',
      { class: 'ccs-card ccs-job' },
      h(
        'div',
        { class: 'ccs-row' },
        running && job.status !== 'processing' ? h('sp-progress-circle', { indeterminate: true, size: 's', label: 'Waiting to start' }) : null,
        statusLight(job.status),
      ),
      renderProgress(job),
      job.message ? h('p', { class: 'ccs-body', text: job.message }) : null,
      renderChannels(job),
      h('p', { class: 'ccs-detail', text: `Job ${job.id}` }),
    ));
  }
  if (state.jobError) children.push(alert('negative', null, state.jobError));

  const buttons = [button('Back', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(1) })];
  if (!job || RERUNNABLE.includes(job.status) || !jobMatchesSelection(job)) {
    const uncertain = job?.status === 'submit-uncertain' && jobMatchesSelection(job);
    buttons.push(button(job ? 'Run again' : 'Run production', {
      variant: 'accent',
      iconName: 'magic-wand',
      pending: state.busy,
      disabled: !state.confirmed || needsFirefly,
      onClick: () => {
        // eslint-disable-next-line no-alert
        if (uncertain && !window.confirm('The previous run may still be processing in Firefly. Start another (possibly billable) run?')) return;
        onSubmitJob();
      },
    }));
  }
  if (running) {
    buttons.push(button('Refresh', {
      variant: 'secondary', iconName: 'refresh', onClick: () => { pollDelay = 3000; pollJob(job.id); },
    }));
  }
  if (canEnter(3)) buttons.push(button('Continue', { variant: 'accent', onClick: () => goTo(3) }));
  children.push(footer(...buttons));

  return section('Prepare placements', 'Runs the published Firefly Creative Production workflow on the exact file version you selected.', ...children);
}

function textField(label, key, { multiline = false, max = 200, help } = {}) {
  const id = `ccs-${key}`;
  const field = h('sp-textfield', {
    id,
    value: state.copy[key],
    multiline,
    rows: multiline ? 3 : undefined,
    maxlength: max,
    class: 'ccs-grow',
    onInput: (e) => { state.copy[key] = e.target.value; },
  });
  if (help) field.append(h('sp-help-text', { slot: 'help-text', text: help }));
  return h('div', { class: 'ccs-field' }, h('sp-field-label', { for: id, text: label }), field);
}

function renderReviewStep() {
  const { job } = state;
  const out = job.outputs || {};
  const accepted = job.status === 'accepted';
  const preview = (o, label, cls) => h(
    'figure',
    { class: `ccs-preview ${cls}` },
    o
      ? h('img', {
        src: accepted ? o.deliveryUrl : o.previewUrl, alt: `${label} output`, width: o.width || undefined, height: o.height || undefined,
      })
      : h('div', { class: 'ccs-preview-missing' }, icon('image')),
    h('figcaption', { class: 'ccs-detail', text: o ? `${label} · ${o.width || '?'}×${o.height || '?'}` : `No ${label.toLowerCase()} output` }),
  );

  const radios = h('sp-radio-group', {
    id: 'ccs-presentation',
    selected: state.copy.presentation,
    name: 'presentation',
    onChange: (e) => { state.copy.presentation = e.target.selected; },
  });
  radios.append(
    h('sp-radio', { value: 'static' }, 'Static'),
    h('sp-radio', { value: 'animated' }, 'Animated entrance'),
  );

  const children = [
    h('div', { class: 'ccs-previews' }, preview(out.desktop, 'Desktop', 'is-desktop'), preview(out.mobile, 'Mobile', 'is-mobile')),
    h('p', { class: 'ccs-detail', text: 'Check that the whole product is visible, edges are clean and nothing is distorted.' }),
    h('sp-divider', { size: 's' }),
    textField('Headline', 'headline', { max: 120 }),
    textField('Description', 'description', { multiline: true, max: 400 }),
    textField('CTA label', 'ctaLabel', { max: 40 }),
    textField('Image alt text', 'imageAlt', { max: 200, help: 'Describe the product image for screen readers.' }),
    h(
      'div',
      { class: 'ccs-field' },
      h('sp-field-label', { for: 'ccs-presentation', text: 'Presentation' }),
      radios,
      h('sp-help-text', { text: 'The animation plays once and is skipped for visitors who prefer reduced motion.' }),
    ),
  ];
  if (state.jobError) children.push(alert('negative', null, state.jobError));
  if (job.status === 'delivery-failed') {
    children.push(alert('negative', 'Delivery failed', `${job.message || 'Unknown error.'} The rendered images are kept; you can retry.`));
  }
  children.push(footer(
    button('Back', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(2) }),
    accepted
      ? button('Continue', { variant: 'accent', onClick: () => goTo(4) })
      : button(job.status === 'delivery-failed' ? 'Retry delivery' : 'Accept and deliver', {
        variant: 'accent', iconName: 'upload-to-cloud', pending: state.busy, onClick: onAccept,
      }),
  ));
  return section('Review placements and copy', 'Accepting stores both images permanently (Product Visuals or App Builder storage, as configured), so the page never depends on expiring links.', ...children);
}

function renderInsertStep() {
  const data = spotlightData();
  const row = (k, v, cls) => [h('dt', { text: k }), h('dd', { class: cls, text: v || '—' })];
  const children = [
    h(
      'dl',
      { class: 'ccs-card ccs-summary' },
      ...row('SKU', data.sku),
      ...row('Headline', data.headline),
      ...row('CTA', data.ctaLabel),
      ...row('Presentation', data.presentation === 'animated' ? 'Animated entrance' : 'Static'),
      ...(state.job?.recipe?.label ? row('Workflow', state.job.recipe.label) : []),
      ...row('Desktop', data.desktopImage, 'ccs-url'),
      ...row('Mobile', data.mobileImage, 'ccs-url'),
    ),
  ];
  if (state.notice) children.push(alert(state.notice.type, null, state.notice.text));
  children.push(footer(
    button('Edit copy', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(3) }),
    button(state.inserted ? 'Insert again' : 'Insert into page', {
      variant: state.inserted ? 'secondary' : 'accent', disabled: !state.sdk, onClick: onInsert,
    }),
    state.sdk?.actions?.closeLibrary
      ? button('Close', { variant: 'secondary', treatment: 'outline', onClick: () => state.sdk.actions.closeLibrary() })
      : null,
  ));
  children.push(h(
    'div',
    { class: 'ccs-card is-subtle ccs-next' },
    h('p', { class: 'ccs-strong', text: 'Make another banner' }),
    h('p', { class: 'ccs-detail', text: 'Your connections and workflow choice are kept. This banner stays in Recent jobs.' }),
    h(
      'div',
      { class: 'ccs-row ccs-next-actions' },
      button('New banner', {
        variant: state.inserted ? 'accent' : 'secondary', iconName: 'magic-wand', onClick: () => onStartNew({ keepProduct: false }),
      }),
      button(`Another for ${state.product?.sku || 'this product'}`, {
        variant: 'secondary', treatment: 'outline', onClick: () => onStartNew({ keepProduct: true }),
      }),
    ),
  ));
  return section('Insert into the page', 'Adds a Creative Product Spotlight block at your cursor. Nothing is published; save and preview the page as usual.', ...children);
}

const VIEWS = [
  renderProductStep, renderSourceStep, renderPrepareStep, renderReviewStep, renderInsertStep,
];

const theme = h('sp-theme', {
  system: 'spectrum-two', color: 'light', scale: 'medium', class: 'ccs-theme',
});

render = () => {
  const active = document.activeElement?.id;
  theme.replaceChildren(h(
    'div',
    { class: 'ccs-app' },
    renderHeader(),
    renderTabs(),
    renderContext(),
    VIEWS[state.step](),
  ));
  if (active) document.getElementById(active)?.focus();
};

/* ---------- boot ---------- */

async function loadSdk() {
  if (window.parent === window) return null; // not framed by Workspace
  // The SDK resolves once the Workspace host hands over its port and token.
  return Promise.race([
    DA_SDK,
    new Promise((resolve) => { setTimeout(() => resolve(null), 5000); }),
  ]);
}

let currentToken = null;

async function init() {
  root.replaceChildren(theme);
  state.sdk = await loadSdk();
  currentToken = state.sdk?.token || null;
  // Workspace pushes refreshed IMS tokens to the frame; always use the latest one.
  window.addEventListener('message', (e) => {
    if (e.source === window.parent && typeof e.data?.token === 'string') currentToken = e.data.token;
  });
  state.backend = createBackend(() => currentToken);
  try {
    state.backendConfigured = !!(await state.backend.origin());
  } catch (e) {
    state.backendConfigured = false;
  }
  try {
    state.catalogConfigured = !!(await loadSiteConfig())['commerce-endpoint'];
  } catch (e) {
    state.catalogConfigured = false;
  }
  render();
  if (state.backendConfigured && state.sdk) {
    try {
      state.recent = (await state.backend.jobRecent()).jobs || [];
    } catch (e) { /* recent jobs are a convenience */ }
    await refreshSources();
    await refreshFirefly();
    await refreshWorkflows();
    await refreshSetup();
    render();
  }
}

init();
