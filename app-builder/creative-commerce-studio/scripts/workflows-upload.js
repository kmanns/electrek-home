#!/usr/bin/env node
/*
 * Creative Commerce Studio — upload the workflow list and its scene images.
 *
 *   npm run workflows:check    # validate workflows.json and every scene image, upload nothing
 *   npm run workflows:upload   # validate, then upload to the backend's private storage
 *
 * Reads workflows.json and the images it references (looks/...) from this backend folder.
 * Uploads go to App Builder Files under private paths (looks/..., config/workflows.json);
 * nothing becomes public. Changes apply to the next run without a redeploy.
 *
 * How it uploads (from .env):
 *   - Through the backend (preferred): CCS_BACKEND_URL plus ADMIN_TOKEN, or BRIDGE_TOKEN in
 *     bridge mode. The deployed backend hands out 10-minute upload links, so this computer
 *     needs no storage credentials.
 *   - Directly: AIO_runtime_namespace / AIO_runtime_auth (written by `aio app use`), used
 *     when no backend URL and token are set, or with --direct.
 */
/* eslint-disable no-console -- command-line tool: console output is its interface */
const fs = require('fs');
const path = require('path');
const workflows = require('../lib/workflows.js');
const scenes = require('../lib/scenes.js');
const { sniff } = require('../lib/image.js');

const ROOT = path.join(__dirname, '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  // eslint-disable-next-line global-require
  return require('dotenv').parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Validates the list and every referenced image. Returns
 * { entries, files: [{ file, bytes }], problems: [], notes: [] }.
 */
function plan(root = ROOT, env = {}, listFile = path.join(root, 'workflows.json')) {
  const problems = [];
  const notes = [];
  if (!fs.existsSync(listFile)) {
    return {
      entries: [], files: [], problems: [`${path.relative(root, listFile) || listFile} not found. Copy workflows.example.json to workflows.json and fill it in.`], notes,
    };
  }
  const text = fs.readFileSync(listFile, 'utf8');
  let entries;
  try {
    entries = workflows.parse(text, 'workflows.json');
  } catch (e) {
    return {
      entries: [], files: [], problems: [e.message], notes,
    };
  }
  if (env.FFCPE_WORKFLOWS && !/^\$/.test(env.FFCPE_WORKFLOWS)) {
    notes.push('FFCPE_WORKFLOWS is set in .env, and it takes precedence: the uploaded workflows.json is ignored until you empty FFCPE_WORKFLOWS and run "aio app deploy --force-deploy".');
  }
  const files = new Map();
  entries.forEach((wf) => {
    const items = wf.inputs.map((inp) => {
      const local = path.join(root, inp.file);
      if (!fs.existsSync(local)) {
        problems.push(`${inp.file} (${wf.label}) is not in the backend folder.`);
        return null;
      }
      const bytes = fs.readFileSync(local);
      files.set(inp.file, bytes);
      return { ...inp, kind: sniff(bytes) };
    }).filter(Boolean);
    problems.push(...scenes.check(items, wf.label));
  });
  return {
    entries, files: [...files].map(([file, bytes]) => ({ file, bytes })), text, problems, notes,
  };
}

/** All uploads in order: scene images first, the list last (it never points at missing images). */
function uploads(p) {
  return [
    ...p.files.map(({ file, bytes }) => ({ file, bytes, label: file })),
    { file: workflows.CONFIG_PATH, bytes: Buffer.from(p.text), label: `workflows.json (${p.entries.length} workflow${p.entries.length === 1 ? '' : 's'})` },
  ];
}

const contentType = (file) => {
  if (/\.png$/i.test(file)) return 'image/png';
  if (/\.json$/i.test(file)) return 'application/json';
  return 'image/jpeg';
};

/** Uploads through the deployed backend: it returns short-lived write links, we PUT each file. */
async function uploadViaBackend(p, env, fetchImpl = fetch) {
  const backend = String(env.CCS_BACKEND_URL || '').replace(/\/$/, '');
  const token = env.ADMIN_TOKEN || env.BRIDGE_TOKEN;
  const list = uploads(p);
  const res = await fetchImpl(`${backend}/workflows-upload-urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ files: list.map((u) => u.file) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.links) {
    const why = json.error?.message || `HTTP ${res.status}`;
    const hint = res.status === 404 ? ' The backend may not have this action yet: run "aio app deploy --force-deploy" first.' : '';
    throw new Error(`The backend refused the upload: ${why}.${hint}`);
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const u of list) {
    // eslint-disable-next-line no-await-in-loop
    const put = await fetchImpl(json.links[u.file], {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType(u.file) },
      body: u.bytes,
    });
    if (!put.ok) throw new Error(`Uploading ${u.file} failed (HTTP ${put.status}). Nothing after it was uploaded; run the command again.`);
    console.log(`  uploaded ${u.label} (${Math.round(u.bytes.length / 1024)} KB)`);
  }
}

async function uploadDirect(p, env) {
  if (!env.AIO_runtime_namespace || !env.AIO_runtime_auth) {
    throw new Error('AIO_runtime_namespace / AIO_runtime_auth are missing in .env. Run "aio app use" in this folder first.');
  }
  // eslint-disable-next-line global-require
  const files = await require('@adobe/aio-lib-files').init({ ow: { namespace: env.AIO_runtime_namespace, auth: env.AIO_runtime_auth } });
  // eslint-disable-next-line no-restricted-syntax
  for (const u of uploads(p)) {
    // eslint-disable-next-line no-await-in-loop
    await files.write(u.file, u.bytes);
    console.log(`  uploaded ${u.label} (${Math.round(u.bytes.length / 1024)} KB)`);
  }
}

/** Through the backend when its URL and a token are in .env (unless --direct), else directly. */
function route(env, argv = process.argv) {
  const token = env.ADMIN_TOKEN || env.BRIDGE_TOKEN;
  if (!argv.includes('--direct') && /^https:\/\//.test(env.CCS_BACKEND_URL || '') && token && token.length >= 32) return 'backend';
  return 'direct';
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const env = { ...loadEnv(path.join(ROOT, '.env')), ...process.env };
  const p = plan(ROOT, env);
  p.notes.forEach((n) => console.warn(`Note: ${n}`));
  if (p.problems.length) {
    console.error('Not uploaded. Fix these first:');
    p.problems.forEach((x) => console.error(`  - ${x}`));
    process.exit(1);
  }
  console.log('Authors will see, in this order (the first is the default):');
  p.entries.forEach((wf) => console.log(`  - ${wf.label}${wf.inputs.length ? ` (${wf.inputs.length} scene images)` : ''}`));
  if (checkOnly) {
    console.log(`Check passed: ${p.entries.length} workflows, ${p.files.length} scene images. Nothing uploaded.`);
    return;
  }
  if (route(env) === 'backend') {
    console.log('Uploading through the backend…');
    await uploadViaBackend(p, env);
  } else {
    console.log('Uploading directly to App Builder storage…');
    await uploadDirect(p, env);
  }
  console.log('Done. The next run uses this list; no redeploy needed. Reload the plugin to see the choices.');
}

module.exports = { plan, route, uploadViaBackend };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
