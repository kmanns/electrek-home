/*
 * Creative Commerce Studio — Experience Workspace library plugin.
 *
 * Product -> Source -> Prepare -> Review -> Insert
 *
 * UI: Spectrum Web Components, Spectrum 2 theme (vendor/spectrum.js, built from ./build).
 * Browser side only: catalog lookup (public storefront API), UI state and
 * block insertion. Box OAuth, Box downloads, FFCPE runs and Product Visuals
 * delivery all happen in the App Builder backend; no tokens are stored here.
 */
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import './vendor/spectrum.js';
import { lookupProduct } from './lib/catalog.js';
import { createBackend, BackendError } from './lib/backend.js';
import { buildSpotlightHTML } from './lib/block-table.js';

const STEPS = ['Product', 'Source', 'Prepare', 'Review', 'Insert'];
const TERMINAL = ['ready-for-review', 'render-failed', 'delivery-failed', 'accepted', 'cancelled', 'submit-uncertain'];
const RERUNNABLE = ['render-failed', 'cancelled', 'submit-uncertain'];
const IMAGE_EXT = /\.(png|jpe?g)$/i;

/** Job status -> sp-status-light variant + author-facing label. */
const STATUS = {
  queued: ['neutral', 'Queued'],
  processing: ['informative', 'Processing'],
  'ready-for-review': ['positive', 'Ready for review'],
  accepted: ['positive', 'Delivered'],
  'render-failed': ['negative', 'Production failed'],
  'delivery-failed': ['negative', 'Delivery failed'],
  'submit-uncertain': ['notice', 'Outcome unknown'],
  cancelled: ['neutral', 'Cancelled'],
};

const root = document.getElementById('ccs');

const state = {
  step: 0,
  sdk: null, // { context, token, actions } when running inside Workspace
  backend: null,
  backendConfigured: false,
  sku: '',
  product: null,
  productError: null,
  box: {
    checked: false, connected: false, user: null, error: null,
  },
  firefly: {
    checked: false, connected: false, mode: null, error: null,
  },
  folder: null, // { id, name, parentId, entries: [] }
  file: null, // { id, name, versionId, size, thumbnail }
  confirmed: false,
  job: null,
  jobError: null,
  recent: [],
  copy: {
    headline: '', description: '', ctaLabel: 'Shop now', imageAlt: '', presentation: 'static',
  },
  busy: false,
  notice: null,
};

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
    && job.source?.fileId === state.file.id
    && job.source?.versionId === state.file.versionId;
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
      if (state.product?.sku !== product.sku) resetFrom(0);
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

async function openFolder(folderId) {
  try {
    const listing = await state.backend.boxFiles(folderId);
    state.folder = { ...listing.folder, entries: listing.entries || [] };
    state.box.error = null;
  } catch (e) {
    if (e.code === 'box-reauth') state.box.connected = false;
    state.box.error = errorText(e);
  }
}

async function refreshBox() {
  if (!state.backendConfigured) return;
  try {
    const status = await state.backend.boxStatus();
    state.box = {
      checked: true, connected: !!status.connected, user: status.user || null, error: null,
    };
    if (status.connected && !state.folder) await openFolder(null);
  } catch (e) {
    state.box = {
      checked: true, connected: false, user: null, error: errorText(e),
    };
  }
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

async function onConnectBox() {
  state.busy = true;
  render();
  try {
    const { authorizeUrl } = await state.backend.boxAuthStart();
    await signInPopup(authorizeUrl, 'box', 'Box');
    await confirmConnected(refreshBox, () => state.box.connected);
  } catch (e) {
    state.box.error = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
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

async function onDisconnectBox() {
  state.busy = true;
  render();
  try {
    await state.backend.boxDisconnect();
  } catch (e) { /* show disconnected either way */ }
  state.box = {
    checked: true, connected: false, user: null, error: null,
  };
  state.folder = null;
  resetFrom(0);
  state.busy = false;
  render();
}

function onSelectFile(entry) {
  if (state.file?.id !== entry.id || state.file?.versionId !== entry.versionId) resetFrom(1);
  state.file = entry;
  render();
}

let pollTimer = null;
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
        provider: 'box', fileId: state.file.id, versionId: state.file.versionId, name: state.file.name,
      },
      associationConfirmed: true,
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
      setNotice('positive', 'Spotlight inserted at your cursor. Save and preview the page to see it.');
    }
  } catch (e) {
    setNotice('negative', errorText(e));
  }
  render();
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
      id: job.source.fileId, versionId: job.source.versionId, name: job.source.name,
    };
    state.confirmed = true;
    state.job = job;
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
        h('p', { class: 'ccs-subtitle', text: 'Box · Firefly Creative Production · Commerce' }),
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

function renderSourceStep() {
  const title = 'Choose the Box packshot';
  if (!state.backendConfigured) {
    return section(title, null, alert('notice', 'Backend not configured', 'An administrator needs to set creative-commerce-studio → backend-url in the site config.'));
  }
  if (!state.sdk) {
    return section(title, null, alert('notice', 'Workspace required', 'Open this plugin from an Experience Workspace document to connect Box.'));
  }
  const children = [];
  if (state.box.error) children.push(alert('negative', null, state.box.error));
  if (!state.box.checked) {
    children.push(h('div', { class: 'ccs-loading' }, h('sp-progress-circle', { indeterminate: true, size: 's', label: 'Checking Box connection' }), 'Checking your Box connection…'));
    return section(title, null, ...children);
  }
  if (!state.box.connected) {
    children.push(h(
      'div',
      { class: 'ccs-empty' },
      h('span', { class: 'ccs-empty-icon', 'aria-hidden': 'true' }, icon('box')),
      h('p', { class: 'ccs-strong', text: 'Connect your Box account' }),
      h('p', { class: 'ccs-body', text: 'Creative Commerce Studio only reads files from the configured campaign folder and never changes them.' }),
      button('Connect Box', { variant: 'accent', pending: state.busy, onClick: onConnectBox }),
    ));
    return section(title, null, ...children);
  }

  children.push(h(
    'div',
    { class: 'ccs-row' },
    h('sp-status-light', { variant: 'positive', size: 's', text: `Connected as ${state.box.user?.name || state.box.user?.login || 'Box user'}` }),
    h('sp-action-button', {
      size: 's', quiet: true, disabled: state.busy, onClick: onDisconnectBox,
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
  }

  if (state.file) {
    children.push(h(
      'div',
      { class: 'ccs-card is-subtle' },
      h('sp-checkbox', {
        checked: state.confirmed,
        onChange: (e) => { state.confirmed = e.target.checked; render(); },
      }, `I confirm “${state.file.name}” (version ${state.file.versionId}) shows ${state.product.name} (${state.product.sku}) and I am authorized to use it.`),
    ));
  }
  children.push(footer(
    button('Back', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(0) }),
    button('Continue', { variant: 'accent', disabled: !canEnter(2), onClick: () => goTo(2) }),
  ));
  return section(title, null, ...children);
}

function renderPrepareStep() {
  const { job } = state;
  const running = job && !TERMINAL.includes(job.status);
  const children = [
    h(
      'ol',
      { class: 'ccs-recipe' },
      h('li', { text: 'Remove background' }),
      h('li', { text: 'Place in the desktop layout' }),
      h('li', { text: 'Place in the mobile layout' }),
    ),
  ];
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
        running ? h('sp-progress-circle', { indeterminate: true, size: 's', label: 'Production running' }) : null,
        statusLight(job.status),
      ),
      job.message ? h('p', { class: 'ccs-body', text: job.message }) : null,
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

  return section('Prepare placements', 'Runs the published Firefly Creative Production workflow on the exact Box file version you selected.', ...children);
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
    children.push(alert('negative', 'Delivery to Product Visuals failed', `${job.message || 'Unknown error.'} The rendered images are kept; you can retry.`));
  }
  children.push(footer(
    button('Back', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(2) }),
    accepted
      ? button('Continue', { variant: 'accent', onClick: () => goTo(4) })
      : button(job.status === 'delivery-failed' ? 'Retry delivery' : 'Accept and deliver', {
        variant: 'accent', iconName: 'upload-to-cloud', pending: state.busy, onClick: onAccept,
      }),
  ));
  return section('Review placements and copy', 'Accepting copies both images to Product Visuals, so the page never depends on expiring links.', ...children);
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
      ...row('Desktop', data.desktopImage, 'ccs-url'),
      ...row('Mobile', data.mobileImage, 'ccs-url'),
    ),
  ];
  if (state.notice) children.push(alert(state.notice.type, null, state.notice.text));
  children.push(footer(
    button('Edit copy', { variant: 'secondary', treatment: 'outline', onClick: () => goTo(3) }),
    button('Insert into page', {
      variant: 'accent', disabled: !state.sdk, onClick: onInsert,
    }),
    state.sdk?.actions?.closeLibrary
      ? button('Close', { variant: 'secondary', treatment: 'outline', onClick: () => state.sdk.actions.closeLibrary() })
      : null,
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
  render();
  if (state.backendConfigured && state.sdk) {
    try {
      state.recent = (await state.backend.jobRecent()).jobs || [];
    } catch (e) { /* recent jobs are a convenience */ }
    await refreshBox();
    await refreshFirefly();
    render();
  }
}

init();
