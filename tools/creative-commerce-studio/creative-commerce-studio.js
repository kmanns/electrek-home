/*
 * Creative Commerce Studio — Experience Workspace library plugin.
 *
 * Product -> Source -> Prepare -> Review -> Insert
 *
 * Browser side only: catalog lookup (public storefront API), UI state and
 * block insertion. Box OAuth, Box downloads, FFCPE runs and Product Visuals
 * delivery all happen in the App Builder backend; no tokens are stored here.
 */
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { lookupProduct } from './lib/catalog.js';
import { createBackend, BackendError } from './lib/backend.js';
import { buildSpotlightHTML } from './lib/block-table.js';

const STEPS = ['Product', 'Source', 'Prepare', 'Review', 'Insert'];
const TERMINAL = ['ready-for-review', 'render-failed', 'delivery-failed', 'accepted', 'cancelled', 'submit-uncertain'];
const RERUNNABLE = ['render-failed', 'cancelled', 'submit-uncertain'];
const IMAGE_EXT = /\.(png|jpe?g)$/i;

const root = document.getElementById('ccs');

const state = {
  step: 0,
  sdk: null, // { context, token, actions } when running inside Workspace
  backend: null,
  backendConfigured: false,
  product: null,
  productError: null,
  box: {
    checked: false, connected: false, user: null, error: null,
  },
  folder: null, // { id, name, entries: [] }
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

function errorText(err) {
  if (err instanceof BackendError && err.code === 'box-reauth') {
    return 'Your Box connection expired or was revoked. Reconnect Box to continue.';
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

/* ---------- actions ---------- */

async function onLookup(event) {
  event.preventDefault();
  const sku = new FormData(event.target).get('sku')?.toString().trim();
  if (!sku) return;
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

async function openFolder(folderId) {
  try {
    const listing = await state.backend.boxFiles(folderId);
    state.folder = listing.folder;
    state.folder.entries = listing.entries || [];
    state.box.error = null;
  } catch (e) {
    if (e.code === 'box-reauth') state.box.connected = false;
    state.box.error = errorText(e);
  }
}

async function onConnectBox() {
  state.busy = true;
  render();
  try {
    const { authorizeUrl } = await state.backend.boxAuthStart();
    const popup = window.open(authorizeUrl, 'ccs-box-auth', 'popup,width=520,height=700');
    if (!popup) throw new Error('The Box sign-in window was blocked. Allow pop-ups for this page and try again.');
    const backendOrigin = await state.backend.origin();
    await new Promise((resolve) => {
      const watch = { timer: null, onMessage: null };
      const done = () => {
        window.removeEventListener('message', watch.onMessage);
        clearInterval(watch.timer);
        resolve();
      };
      watch.onMessage = (msg) => {
        if (msg.origin === backendOrigin && msg.data?.type === 'ccs-box-auth') done();
      };
      window.addEventListener('message', watch.onMessage);
      watch.timer = setInterval(() => { if (popup.closed) done(); }, 750);
    });
    // Box pages may sever window.opener (COOP), so confirm via the backend for up to ~1 min.
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await refreshBox();
      if (state.box.connected) break;
      render();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 3000); });
    }
  } catch (e) {
    state.box.error = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
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
    state.jobError = errorText(e);
    // keep the job; author can retry status without resubmitting
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
    state.jobError = errorText(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function onAccept() {
  if (!jobMatchesSelection() || state.job.status !== 'ready-for-review') return;
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

async function onInsert() {
  setNotice(null);
  if (!jobMatchesSelection() || state.job.status !== 'accepted') {
    setNotice('error', 'Only an accepted job for the selected product and file can be inserted.');
    render();
    return;
  }
  try {
    const html = buildSpotlightHTML(spotlightData());
    if (!state.sdk?.actions?.sendHTML) {
      setNotice('error', 'Insertion is only available when the plugin is opened from a Workspace document.');
    } else {
      state.sdk.actions.sendHTML(html);
      setNotice('success', 'Spotlight inserted at your cursor. Save and preview the page to see it.');
    }
  } catch (e) {
    setNotice('error', errorText(e));
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
    setNotice('error', errorText(e));
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
}

/* ---------- views ---------- */

function renderStepper() {
  return h('ol', { class: 'ccs-steps' }, STEPS.map((label, i) => h('li', {
    class: `ccs-step${i === state.step ? ' is-current' : ''}${canEnter(i) ? '' : ' is-locked'}`,
  }, h('button', {
    type: 'button',
    disabled: !canEnter(i),
    'aria-current': i === state.step ? 'step' : null,
    onClick: () => goTo(i),
  }, `${i + 1}. ${label}`))));
}

function renderSelectionSummary() {
  if (!state.product) return null;
  return h(
    'div',
    { class: 'ccs-summary' },
    h('span', {}, h('strong', { text: state.product.sku }), ` · ${state.product.name}`),
    state.file ? h('span', { text: `Source: ${state.file.name}` }) : null,
    state.job ? h('span', { class: `ccs-badge is-${state.job.status}`, text: state.job.status }) : null,
  );
}

function renderProductStep() {
  const p = state.product;
  return h(
    'section',
    { class: 'ccs-panel' },
    h('h2', { text: 'Choose the product' }),
    h(
      'form',
      { class: 'ccs-row', onSubmit: onLookup },
      h('label', { for: 'ccs-sku', class: 'ccs-label', text: 'Exact SKU' }),
      h('input', {
        id: 'ccs-sku', name: 'sku', required: true, autocomplete: 'off', value: p?.sku || '', placeholder: 'e.g. STIHL-BGA200',
      }),
      h('button', { type: 'submit', class: 'ccs-btn', disabled: state.busy }, state.busy ? 'Looking up…' : 'Look up'),
    ),
    state.productError ? h('p', { class: 'ccs-error', role: 'alert', text: state.productError }) : null,
    p ? h(
      'div',
      { class: 'ccs-product' },
      p.image ? h('img', {
        src: p.image, alt: '', width: 96, height: 96, loading: 'lazy',
      }) : null,
      h(
        'div',
        {},
        h('p', {}, h('strong', { text: p.name })),
        h('p', { class: 'ccs-muted', text: `${p.sku} · ${p.type.replace('ProductView', '')} · ${p.inStock ? 'in stock' : 'out of stock'}` }),
        p.path ? h('p', { class: 'ccs-muted', text: `Links to ${p.path}` }) : h('p', { class: 'ccs-error', text: 'This product has no URL key, so it cannot be linked.' }),
      ),
    ) : null,
    h('div', { class: 'ccs-actions' }, h('button', {
      type: 'button', class: 'ccs-btn primary', disabled: !p?.path, onClick: () => goTo(1),
    }, 'Next: choose source')),
    state.recent.length ? renderRecent() : null,
  );
}

function renderRecent() {
  return h(
    'details',
    { class: 'ccs-recent' },
    h('summary', { text: `Your recent jobs (${state.recent.length})` }),
    h('ul', {}, state.recent.map((job) => h(
      'li',
      {},
      h('span', { text: `${job.sku} · ${job.source?.name || ''} · ${job.status} · ${new Date(job.updatedAt).toLocaleString()}` }),
      h('button', { type: 'button', class: 'ccs-btn small', onClick: () => onResume(job) }, 'Resume'),
    ))),
  );
}

function renderSourceStep() {
  const panel = h('section', { class: 'ccs-panel' }, h('h2', { text: 'Choose the Box packshot' }));
  if (!state.backendConfigured) {
    panel.append(h('p', { class: 'ccs-error', text: 'The Creative Commerce Studio backend is not configured for this site. An administrator needs to set creative-commerce-studio → backend-url in the site config.' }));
    return panel;
  }
  if (!state.sdk) {
    panel.append(h('p', { class: 'ccs-error', text: 'Open this plugin from an Experience Workspace document to connect Box.' }));
    return panel;
  }
  if (state.box.error) panel.append(h('p', { class: 'ccs-error', role: 'alert', text: state.box.error }));
  if (!state.box.checked) {
    panel.append(h('p', { text: 'Checking your Box connection…' }));
    return panel;
  }
  if (!state.box.connected) {
    panel.append(
      h('p', { text: 'Connect your own Box account. Creative Commerce Studio only reads files from the configured campaign folder and never changes them.' }),
      h('button', {
        type: 'button', class: 'ccs-btn primary', disabled: state.busy, onClick: onConnectBox,
      }, 'Connect Box'),
    );
    return panel;
  }

  panel.append(h(
    'p',
    { class: 'ccs-muted' },
    `Connected as ${state.box.user?.name || state.box.user?.login || 'Box user'} · `,
    h('button', { type: 'button', class: 'ccs-link', onClick: onDisconnectBox }, 'Disconnect'),
  ));

  const { folder } = state;
  if (folder) {
    if (folder.parentId) {
      panel.append(h('button', { type: 'button', class: 'ccs-link', onClick: async () => { await openFolder(folder.parentId); render(); } }, '← Back'));
    }
    panel.append(h('p', {}, h('strong', { text: folder.name })));
    if (!folder.entries.length) panel.append(h('p', { class: 'ccs-muted', text: 'This folder is empty.' }));
    const grid = h('ul', { class: 'ccs-files' });
    folder.entries.forEach((entry) => {
      if (entry.type === 'folder') {
        grid.append(h('li', {}, h('button', { type: 'button', class: 'ccs-file is-folder', onClick: async () => { await openFolder(entry.id); render(); } }, h('span', { class: 'ccs-file-icon', text: '📁' }), h('span', { text: entry.name }))));
        return;
      }
      const supported = IMAGE_EXT.test(entry.name);
      const selected = state.file?.id === entry.id;
      grid.append(h('li', {}, h(
        'button',
        {
          type: 'button',
          class: `ccs-file${selected ? ' is-selected' : ''}`,
          disabled: !supported,
          'aria-pressed': selected ? 'true' : 'false',
          title: supported ? entry.name : `${entry.name} — only PNG or JPEG packshots are supported`,
          onClick: () => onSelectFile(entry),
        },
        entry.thumbnail ? h('img', {
          src: entry.thumbnail, alt: '', width: 120, height: 120, loading: 'lazy',
        }) : h('span', { class: 'ccs-file-icon', text: '🖼' }),
        h('span', { text: entry.name }),
      )));
    });
    panel.append(grid);
  }

  if (state.file) {
    panel.append(h(
      'label',
      { class: 'ccs-confirm' },
      h('input', {
        type: 'checkbox',
        checked: state.confirmed,
        onChange: (e) => { state.confirmed = e.target.checked; render(); },
      }),
      h('span', { text: `I confirm “${state.file.name}” (version ${state.file.versionId}) shows ${state.product.name} (${state.product.sku}) and I am authorized to use it.` }),
    ));
  }
  panel.append(h('div', { class: 'ccs-actions' }, h('button', {
    type: 'button', class: 'ccs-btn primary', disabled: !canEnter(2), onClick: () => goTo(2),
  }, 'Next: prepare')));
  return panel;
}

function renderPrepareStep() {
  const { job } = state;
  const running = job && !TERMINAL.includes(job.status);
  const panel = h(
    'section',
    { class: 'ccs-panel' },
    h('h2', { text: 'Prepare placements with Firefly Creative Production' }),
    h('p', { text: 'Runs the published product-packshot workflow on the exact Box file version you selected: background removal, then desktop (16:9) and mobile (4:5) layouts.' }),
  );
  if (job && !jobMatchesSelection(job)) {
    panel.append(h('p', { class: 'ccs-error', text: 'The product or source changed since this job was started. Submit a new job for the current selection.' }));
  }
  if (job) {
    panel.append(h(
      'dl',
      { class: 'ccs-job' },
      h('dt', { text: 'Job' }),
      h('dd', { text: job.id }),
      h('dt', { text: 'Status' }),
      h('dd', {}, h('span', { class: `ccs-badge is-${job.status}`, text: job.status })),
      job.message ? h('dt', { text: 'Detail' }) : null,
      job.message ? h('dd', { text: job.message }) : null,
    ));
  }
  if (state.jobError) panel.append(h('p', { class: 'ccs-error', role: 'alert', text: state.jobError }));
  const actions = h('div', { class: 'ccs-actions' });
  if (!job || RERUNNABLE.includes(job.status) || !jobMatchesSelection(job)) {
    const uncertain = job?.status === 'submit-uncertain' && jobMatchesSelection(job);
    actions.append(h('button', {
      type: 'button',
      class: 'ccs-btn primary',
      disabled: state.busy || !state.confirmed,
      onClick: () => {
        // eslint-disable-next-line no-alert
        if (uncertain && !window.confirm('The previous run may still be processing in Firefly. Start another (possibly billable) run?')) return;
        onSubmitJob();
      },
    }, job ? 'Run again' : 'Run production'));
  }
  if (running) {
    actions.append(h('button', { type: 'button', class: 'ccs-btn', onClick: () => { pollDelay = 3000; pollJob(job.id); } }, 'Refresh status'));
  }
  if (canEnter(3)) {
    actions.append(h('button', { type: 'button', class: 'ccs-btn primary', onClick: () => goTo(3) }, 'Next: review'));
  }
  panel.append(actions);
  return panel;
}

function field(label, key, opts = {}) {
  const id = `ccs-${key}`;
  const input = opts.multiline
    ? h('textarea', { id, rows: 3, value: state.copy[key] })
    : h('input', { id, value: state.copy[key], maxlength: opts.max || 200 });
  input.addEventListener('input', (e) => { state.copy[key] = e.target.value; });
  return h('div', { class: 'ccs-field' }, h('label', { for: id, text: label }), input, opts.hint ? h('small', { class: 'ccs-muted', text: opts.hint }) : null);
}

function renderReviewStep() {
  const { job } = state;
  const out = job.outputs || {};
  const accepted = job.status === 'accepted';
  const preview = (o, label) => h('figure', { class: 'ccs-preview' }, o ? h('img', { src: accepted ? o.deliveryUrl : o.previewUrl, alt: `${label} output` }) : h('p', { class: 'ccs-error', text: `No ${label.toLowerCase()} output.` }), h('figcaption', { text: o ? `${label} · ${o.width || '?'}×${o.height || '?'}` : label }));
  const panel = h(
    'section',
    { class: 'ccs-panel' },
    h('h2', { text: 'Review placements and copy' }),
    h('p', { class: 'ccs-muted', text: 'Check that the whole product is visible, edges are clean and nothing is distorted. Accepting copies both images to Product Visuals so the page never depends on expiring links.' }),
    h('div', { class: 'ccs-previews' }, preview(out.desktop, 'Desktop'), preview(out.mobile, 'Mobile')),
    field('Headline', 'headline', { max: 120 }),
    field('Description', 'description', { multiline: true }),
    field('CTA label', 'ctaLabel', { max: 40 }),
    field('Image alt text', 'imageAlt', { max: 200, hint: 'Describe the product image for screen readers.' }),
    h(
      'fieldset',
      { class: 'ccs-field' },
      h('legend', { text: 'Presentation' }),
      ...['static', 'animated'].map((v) => h(
        'label',
        { class: 'ccs-radio' },
        h('input', {
          type: 'radio', name: 'presentation', value: v, checked: state.copy.presentation === v, onChange: () => { state.copy.presentation = v; },
        }),
        v === 'static' ? 'Static' : 'Animated entrance (respects reduced motion)',
      )),
    ),
  );
  if (state.jobError) panel.append(h('p', { class: 'ccs-error', role: 'alert', text: state.jobError }));
  if (job.status === 'delivery-failed') panel.append(h('p', { class: 'ccs-error', text: `Delivery to Product Visuals failed: ${job.message || 'unknown error'}. The rendered images are kept; you can retry.` }));
  panel.append(h(
    'div',
    { class: 'ccs-actions' },
    accepted
      ? h('button', { type: 'button', class: 'ccs-btn primary', onClick: () => goTo(4) }, 'Next: insert')
      : h('button', {
        type: 'button', class: 'ccs-btn primary', disabled: state.busy, onClick: onAccept,
      }, state.busy ? 'Delivering…' : 'Accept and deliver'),
  ));
  return panel;
}

function renderInsertStep() {
  const data = spotlightData();
  const panel = h(
    'section',
    { class: 'ccs-panel' },
    h('h2', { text: 'Insert into the page' }),
    h('p', { text: 'Inserts a Creative Product Spotlight block at your cursor. Nothing is published; save and preview the page as usual.' }),
    h(
      'dl',
      { class: 'ccs-job' },
      h('dt', { text: 'SKU' }),
      h('dd', { text: data.sku }),
      h('dt', { text: 'Headline' }),
      h('dd', { text: data.headline || '—' }),
      h('dt', { text: 'Presentation' }),
      h('dd', { text: data.presentation }),
      h('dt', { text: 'Desktop' }),
      h('dd', { class: 'ccs-url', text: data.desktopImage || '—' }),
      h('dt', { text: 'Mobile' }),
      h('dd', { class: 'ccs-url', text: data.mobileImage || '—' }),
    ),
  );
  if (state.notice) panel.append(h('p', { class: state.notice.type === 'error' ? 'ccs-error' : 'ccs-success', role: 'status', text: state.notice.text }));
  panel.append(h(
    'div',
    { class: 'ccs-actions' },
    h('button', { type: 'button', class: 'ccs-btn', onClick: () => goTo(3) }, 'Edit copy'),
    h('button', {
      type: 'button', class: 'ccs-btn primary', disabled: !state.sdk, onClick: onInsert,
    }, 'Insert block'),
    state.sdk?.actions?.closeLibrary ? h('button', { type: 'button', class: 'ccs-btn', onClick: () => state.sdk.actions.closeLibrary() }, 'Close') : null,
  ));
  return panel;
}

const VIEWS = [
  renderProductStep, renderSourceStep, renderPrepareStep, renderReviewStep, renderInsertStep,
];

function render() {
  const active = document.activeElement?.id;
  const view = VIEWS[state.step]();
  const header = h(
    'header',
    { class: 'ccs-header' },
    h('h1', { text: 'Creative Commerce Studio' }),
    state.sdk ? null : h('p', { class: 'ccs-warning', text: 'Standalone preview: open from a Workspace document to connect Box and insert blocks.' }),
  );
  root.replaceChildren(header, renderStepper(), renderSelectionSummary() || '', view);
  if (active) document.getElementById(active)?.focus();
}

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
    render();
  }
}

init();
