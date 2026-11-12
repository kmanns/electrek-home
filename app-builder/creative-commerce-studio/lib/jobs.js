/**
 * Durable job records (App Builder State) for one-SKU / one-source production runs.
 *
 * States: queued -> processing -> ready-for-review -> accepted
 *         render-failed | delivery-failed | cancelled | submit-uncertain
 *
 * - Ownership: every read/write checks job.owner === author key.
 * - Idempotency: a client requestId maps to exactly one job; an active job for the
 *   same SKU + file version is returned instead of starting another paid run.
 * - An uncertain submission (network failure after sending) is never retried
 *   automatically; it becomes submit-uncertain.
 * - Rendering failure and delivery failure are separate states.
 */
const crypto = require('crypto');
const { AppError } = require('./http');
const store = require('./store');
const sources = require('./sources');
const { engine, mode: ffMode, interpretMcpStatus, BRIDGE_QUEUE } = require('./engines');
const delivery = require('./delivery');
const fireflyAuth = require('./firefly-auth');
const { randomId } = require('./crypto');
const { sniff } = require('./image');

const TERMINAL = ['ready-for-review', 'accepted', 'render-failed', 'delivery-failed', 'cancelled', 'submit-uncertain'];
const ACTIVE = ['queued', 'processing'];
const SKU_RE = /^[\w.-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_TTL_DAYS = 30;
const PREVIEW_SECONDS = 15 * 60;
const SOURCE_URL_SECONDS = 60 * 60;

const jobKey = (id) => `job.${id}`;
const indexKey = (user) => `jobs.${user.key}`;
const requestKey = (user, requestId) => `req.${user.key}.${crypto.createHash('sha256').update(requestId).digest('hex').slice(0, 32)}`;

async function load(user, jobId) {
  if (!/^[\w-]{8,64}$/.test(String(jobId || ''))) throw new AppError(400, 'bad-request', 'Invalid job ID.');
  const job = await store.getJSON(jobKey(jobId));
  if (!job || job.owner !== user.key) throw new AppError(404, 'job-not-found', 'Job not found. It may have expired.');
  return job;
}

async function save(job) {
  job.updatedAt = new Date().toISOString();
  await store.putJSON(jobKey(job.id), job, JOB_TTL_DAYS);
  return job;
}

async function addToIndex(user, jobId) {
  const ids = (await store.getJSON(indexKey(user))) || [];
  await store.putJSON(indexKey(user), [jobId, ...ids.filter((i) => i !== jobId)].slice(0, 10), JOB_TTL_DAYS);
}

/** Public view: no Files paths, no source URLs, short-lived previews only. */
async function view(job) {
  const out = {};
  const files = ['ready-for-review', 'delivery-failed'].includes(job.status) ? await store.getFiles() : null;
  await Promise.all(['desktop', 'mobile'].map(async (p) => {
    const o = job.outputs?.[p];
    if (!o) return;
    out[p] = { width: o.width, height: o.height, deliveryUrl: o.deliveryUrl || null };
    if (files && o.filePath) {
      out[p].previewUrl = await files.generatePresignURL(o.filePath, { expiryInSeconds: PREVIEW_SECONDS, permissions: 'r' });
    }
  }));
  return {
    id: job.id,
    sku: job.sku,
    productName: job.productName,
    source: {
      provider: job.source.provider, fileId: job.source.fileId, versionId: job.source.versionId, name: job.source.name,
    },
    recipe: job.recipe,
    status: job.status,
    message: job.message || null,
    progress: ACTIVE.includes(job.status) ? job.progress || null : null,
    startedAt: job.startedAt || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputs: Object.keys(out).length ? out : null,
    retryAfterMs: ACTIVE.includes(job.status) ? 5000 : undefined,
  };
}

async function findActiveDuplicate(user, sku, source) {
  const ids = (await store.getJSON(indexKey(user))) || [];
  const jobs = await Promise.all(ids.map((id) => store.getJSON(jobKey(id))));
  return jobs.find((j) => j && j.owner === user.key && ACTIVE.includes(j.status)
    && j.sku === sku && (j.source.provider || 'box') === source.provider
    && j.source.fileId === source.fileId && j.source.versionId === source.versionId);
}

async function submit(params, user, body, fetchImpl = fetch) {
  const {
    requestId, sku, productName, source, associationConfirmed,
  } = body || {};
  if (!UUID_RE.test(String(requestId || ''))) throw new AppError(400, 'bad-request', 'A request ID is required.');
  if (!SKU_RE.test(String(sku || ''))) throw new AppError(400, 'bad-request', 'A valid SKU is required.');
  if (associationConfirmed !== true) throw new AppError(400, 'association-required', 'Confirm that the source file shows this product.');
  if (!source?.provider || !source.fileId || !source.versionId) {
    throw new AppError(400, 'bad-request', 'A source file and version are required.');
  }
  const connector = sources.get(params, String(source.provider));

  const existingId = await store.getJSON(requestKey(user, requestId));
  if (existingId) return view(await load(user, existingId));
  const duplicate = await findActiveDuplicate(user, sku, source);
  if (duplicate) return view(duplicate);

  // Fail fast (before any download or job record) when the author still has to connect Firefly.
  if (ffMode(params) === 'mcp') await fireflyAuth.accessToken(params, user, fetchImpl);

  // Retrieve the exact selected file version (validates folder allow-list + type).
  const src = await connector.downloadVersion(params, user, source.fileId, source.versionId, fetchImpl);
  const kind = sniff(src.bytes);
  if (!kind) throw new AppError(415, 'unsupported-source', 'The selected file is not a readable PNG or JPEG image.');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    owner: user.key,
    requestId,
    sku,
    productName: String(productName || '').slice(0, 200),
    source: {
      provider: String(source.provider), fileId: String(source.fileId), versionId: String(source.versionId), name: src.name, sha1: src.sha1, md5: src.md5 || null, width: kind.width, height: kind.height,
    },
    recipe: { workflowId: params.FFCPE_WORKFLOW_ID, version: params.FFCPE_RECIPE_VERSION || '1', mode: ffMode(params) },
    deliveryToken: randomId(12).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase(),
    status: 'queued',
    createdAt: now,
  };

  const files = await store.getFiles();
  const ext = kind.type === 'image/png' ? 'png' : 'jpg';
  job.source.filePath = `ccs/${id}/source.${ext}`;
  await files.write(job.source.filePath, src.bytes);
  await save(job);
  await store.putJSON(requestKey(user, requestId), id, 1);
  await addToIndex(user, id);

  const sourceUrl = await files.generatePresignURL(job.source.filePath, { expiryInSeconds: SOURCE_URL_SECONDS, permissions: 'r' });
  try {
    const started = await engine(params).submit(params, user, {
      sourceUrl, sku, jobId: id, productName: job.productName, sourceName: src.name, mimeType: kind.type,
    }, fetchImpl);
    if (started.queued) {
      job.status = 'queued';
      job.message = 'Waiting for the local Firefly bridge to pick up this run.';
    } else {
      job.batchId = started.batchId;
      job.status = 'processing';
      job.startedAt = new Date().toISOString();
    }
  } catch (e) {
    job.status = e.uncertain ? 'submit-uncertain' : 'render-failed';
    job.message = e.uncertain
      ? 'The Firefly request may or may not have started. Check Firefly before running again.'
      : e.message;
  }
  await save(job);
  return view(job);
}

async function fetchOutput(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new AppError(502, 'output-retrieval-failed', `Could not download a workflow output (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) throw new AppError(502, 'output-invalid', 'A workflow output is not a PNG or JPEG image.');
  return { bytes, kind };
}

async function status(params, user, jobId, fetchImpl = fetch) {
  const job = await load(user, jobId);
  if (TERMINAL.includes(job.status) || !job.batchId || job.recipe?.mode === 'bridge') return view(job);

  // A firefly-reauth error propagates: the author reconnects and the job is polled again unchanged.
  const result = await engine(params).poll(params, user, job.batchId, fetchImpl);

  if (result.state !== 'rendered') {
    const progress = result.progress || job.progress || null;
    if (result.state !== job.status || result.message !== job.message
      || JSON.stringify(progress) !== JSON.stringify(job.progress || null)) {
      job.status = result.state;
      job.message = result.message;
      job.progress = progress;
      await save(job);
    }
    return view(job);
  }

  await storeOutputs(job, result.placements, fetchImpl);
  return view(job);
}

/** Copies the matched (short-lived) outputs into App Builder Files and marks the job reviewable. */
async function storeOutputs(job, placements, fetchImpl) {
  try {
    const files = await store.getFiles();
    job.outputs = {};
    // eslint-disable-next-line no-restricted-syntax
    for (const p of ['desktop', 'mobile']) {
      // eslint-disable-next-line no-await-in-loop
      const { bytes, kind } = await fetchOutput(fetchImpl, placements[p].url);
      const filePath = `ccs/${job.id}/${p}.${kind.type === 'image/png' ? 'png' : 'jpg'}`;
      // eslint-disable-next-line no-await-in-loop
      await files.write(filePath, bytes);
      job.outputs[p] = {
        filePath, contentType: kind.type, width: kind.width, height: kind.height, outputName: placements[p].name, nodeId: placements[p].nodeId,
      };
    }
    job.status = 'ready-for-review';
    job.message = null;
  } catch (e) {
    job.status = 'render-failed';
    job.message = e.message;
  }
  await save(job);
}

/* ---------- local bridge (DEMO ONLY, FFCPE_MODE=bridge) ---------- */

const BRIDGE_HEARTBEAT = 'bridge.heartbeat';
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

/** Returns work for the operator's local bridge and records its heartbeat. */
async function bridgeNext(params) {
  const ids = nodeIdsFor(params);
  await store.putJSON(BRIDGE_HEARTBEAT, { at: Date.now() }, 1);
  const queue = (await store.getJSON(BRIDGE_QUEUE)) || [];
  const keep = [];
  const tasks = [];
  const files = await store.getFiles();
  // eslint-disable-next-line no-restricted-syntax
  for (const jobId of queue) {
    // eslint-disable-next-line no-await-in-loop
    const job = await store.getJSON(jobKey(jobId));
    // eslint-disable-next-line no-continue
    if (!job || TERMINAL.includes(job.status)) continue;
    if (job.batchId) {
      keep.push(jobId);
      tasks.push({ type: 'poll', jobId, batchId: job.batchId });
    } else if (!job.bridge?.claimedAt) {
      job.bridge = { claimedAt: Date.now() };
      job.message = 'The local Firefly bridge is starting the run.';
      // eslint-disable-next-line no-await-in-loop
      await save(job);
      // eslint-disable-next-line no-await-in-loop
      const sourceUrl = await files.generatePresignURL(job.source.filePath, { expiryInSeconds: SOURCE_URL_SECONDS, permissions: 'r' });
      keep.push(jobId);
      tasks.push({
        type: 'submit',
        jobId,
        workflowId: params.FFCPE_WORKFLOW_ID,
        productNodeId: ids.product,
        sourceUrl,
        sourceName: job.source.name,
        mimeType: job.source.filePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
      });
    } else if (Date.now() - job.bridge.claimedAt > CLAIM_TIMEOUT_MS) {
      // Claimed but never confirmed: never resubmit blindly.
      job.status = 'submit-uncertain';
      job.message = 'The local bridge took this run but never confirmed it started. Check Firefly before running again.';
      // eslint-disable-next-line no-await-in-loop
      await save(job);
    } else {
      keep.push(jobId);
    }
  }
  await store.putJSON(BRIDGE_QUEUE, keep, 30);
  return { tasks: tasks.slice(0, 5) };
}

/** Accepts a progress report from the bridge: { jobId, batchId } | { jobId, result } | { jobId, failure, uncertain }. */
async function bridgeReport(params, report, fetchImpl = fetch) {
  const jobId = String(report?.jobId || '');
  if (!/^[\w-]{8,64}$/.test(jobId)) throw new AppError(400, 'bad-request', 'Invalid job ID.');
  const job = await store.getJSON(jobKey(jobId));
  if (!job || job.recipe?.mode !== 'bridge') throw new AppError(404, 'job-not-found', 'Job not found.');
  if (TERMINAL.includes(job.status)) return { status: job.status };

  if (report.failure) {
    job.status = report.uncertain ? 'submit-uncertain' : 'render-failed';
    job.message = String(report.failure).slice(0, 300);
    await save(job);
    return { status: job.status };
  }
  if (report.batchId && !report.result) {
    job.batchId = String(report.batchId).slice(0, 200);
    job.status = 'processing';
    job.message = null;
    job.startedAt = new Date().toISOString();
    await save(job);
    return { status: job.status };
  }
  if (report.result && job.batchId) {
    const r = interpretMcpStatus(params, report.result);
    if (r.state === 'rendered') {
      await storeOutputs(job, r.placements, fetchImpl);
    } else if (r.state !== job.status || r.message !== job.message
      || JSON.stringify(r.progress || null) !== JSON.stringify(job.progress || null)) {
      job.status = r.state;
      job.message = r.message || null;
      job.progress = r.progress || job.progress || null;
      await save(job);
    }
    return { status: job.status };
  }
  throw new AppError(400, 'bad-request', 'Nothing to report.');
}

async function bridgeStatus() {
  const hb = await store.getJSON(BRIDGE_HEARTBEAT);
  const lastSeenMs = hb?.at ? Date.now() - hb.at : null;
  return { online: lastSeenMs !== null && lastSeenMs < 60 * 1000, lastSeenMs };
}

async function accept(params, user, jobId, fetchImpl = fetch) {
  const job = await load(user, jobId);
  if (job.status === 'accepted') return view(job);
  if (!['ready-for-review', 'delivery-failed'].includes(job.status)) {
    throw new AppError(409, 'not-reviewable', `Only a job that is ready for review can be accepted (current: ${job.status}).`);
  }
  const files = await store.getFiles();
  try {
    // eslint-disable-next-line no-restricted-syntax
    for (const p of ['desktop', 'mobile']) {
      const o = job.outputs?.[p];
      if (!o?.filePath) throw new AppError(409, 'delivery-failed', `The ${p} output is missing.`);
      // eslint-disable-next-line no-continue
      if (o.deliveryUrl) continue;
      // eslint-disable-next-line no-await-in-loop
      const bytes = await files.read(o.filePath);
      // eslint-disable-next-line no-await-in-loop
      const delivered = await delivery.deliver(params, {
        sku: job.sku, jobId: job.id, placement: p, bytes, mimeType: o.contentType, title: `${job.productName || job.sku} — ${p}`, token: job.deliveryToken,
      }, fetchImpl);
      o.deliveryUrl = delivered.deliveryUrl;
      o.assetPath = delivered.assetPath;
      o.deliveryMode = delivered.mode;
      // eslint-disable-next-line no-await-in-loop
      await save(job); // keep partial progress so a retry skips finished placements
    }
    job.status = 'accepted';
    job.message = null;
    job.acceptedAt = new Date().toISOString();
  } catch (e) {
    job.status = 'delivery-failed';
    job.message = e.message;
  }
  await save(job);
  return view(job);
}

async function recent(user) {
  const ids = (await store.getJSON(indexKey(user))) || [];
  const jobs = (await Promise.all(ids.map((id) => store.getJSON(jobKey(id)))))
    .filter((j) => j && j.owner === user.key);
  return { jobs: await Promise.all(jobs.map(view)) };
}

function nodeIdsFor(params) {
  // eslint-disable-next-line global-require
  return require('./engines').nodeIds(params);
}

module.exports = {
  submit, status, accept, recent, bridgeNext, bridgeReport, bridgeStatus, TERMINAL,
};
