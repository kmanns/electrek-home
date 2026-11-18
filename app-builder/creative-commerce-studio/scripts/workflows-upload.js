#!/usr/bin/env node
/*
 * Creative Commerce Studio — upload the workflow list and its scene images.
 *
 *   npm run workflows:check    # validate workflows.json and every scene image, upload nothing
 *   npm run workflows:upload   # validate, then upload to the backend's private storage
 *
 * Reads workflows.json and the images it references (looks/...) from this backend folder,
 * and the App Builder workspace credentials (AIO_runtime_namespace, AIO_runtime_auth)
 * from .env, which `aio app use` writes. Uploads go to App Builder Files under private
 * paths (looks/..., config/workflows.json); nothing becomes public. Changes apply to the
 * next run without a redeploy.
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

async function upload(p, env) {
  if (!env.AIO_runtime_namespace || !env.AIO_runtime_auth) {
    throw new Error('AIO_runtime_namespace / AIO_runtime_auth are missing in .env. Run "aio app use" in this folder first.');
  }
  // eslint-disable-next-line global-require
  const files = await require('@adobe/aio-lib-files').init({ ow: { namespace: env.AIO_runtime_namespace, auth: env.AIO_runtime_auth } });
  // eslint-disable-next-line no-restricted-syntax
  for (const { file, bytes } of p.files) {
    // eslint-disable-next-line no-await-in-loop
    await files.write(file, bytes);
    console.log(`  uploaded ${file} (${Math.round(bytes.length / 1024)} KB)`);
  }
  // The list goes last, so it never points at images that aren't uploaded yet.
  await files.write(workflows.CONFIG_PATH, Buffer.from(p.text));
  console.log(`  uploaded workflows.json (${p.entries.length} workflow${p.entries.length === 1 ? '' : 's'})`);
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
  await upload(p, env);
  console.log('Done. The next run uses this list; no redeploy needed. Reload the plugin to see the choices.');
}

module.exports = { plan };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
