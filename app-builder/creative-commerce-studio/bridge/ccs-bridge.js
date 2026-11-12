#!/usr/bin/env node
/*
 * Creative Commerce Studio — LOCAL FIREFLY BRIDGE  (DEMO ONLY — NOT FOR PRODUCTION)
 *
 * Adobe's run-workflow MCP only lets local tools sign in (loopback redirect). This
 * script is such a local tool: it runs on the operator's computer, signs in with the
 * operator's own Adobe account, and executes queued Creative Commerce Studio runs.
 *
 *   npm run bridge:login   # one-time browser sign-in (http://localhost:<port>/callback)
 *   npm run bridge         # poll the backend and run queued jobs (keep it running)
 *
 * Every run uses the OPERATOR'S Firefly identity, quota and permissions, and only
 * happens while this script is running. See PRODUCTION-READINESS.md.
 *
 * Config (read from ../.env, or the environment):
 *   CCS_BACKEND_URL   https://<namespace>.adobeioruntime.net/api/v1/web/creative-commerce-studio
 *   BRIDGE_TOKEN      same random secret as in the App Builder workspace
 *   FFCPE_MCP_URL     default https://run-workflow.adobe.io/mcp
 *   BRIDGE_PORT       default 8765 (loopback sign-in callback)
 *   CCS_BRIDGE_HOME   default ~/.ccs-bridge (where the local sign-in is stored, mode 600)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { McpSession } = require('../lib/mcp');
const { findValue } = require('../lib/engines');

const homeDir = () => process.env.CCS_BRIDGE_HOME || path.join(os.homedir(), '.ccs-bridge');
const tokenFile = () => path.join(homeDir(), 'firefly.json');
const POLL_MS = 5000;

/* ---------- config ---------- */

/**
 * Reads .env exactly like `aio app deploy` does (dotenv), so the bridge and the
 * deployed backend always see the same values (quotes, trailing spaces, # comments).
 */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  try {
    // eslint-disable-next-line global-require
    return require('dotenv').parse(text);
  } catch (e) {
    // Fallback with the same rules for the common cases.
    const out = {};
    text.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
      if (!m) return;
      let v = m[2].trim();
      const q = v.match(/^(['"`])([\s\S]*)\1$/);
      if (q) v = q[2];
      else v = v.replace(/\s+#.*$/, '').trim();
      out[m[1]] = v;
    });
    return out;
  }
}

function config() {
  const fileEnv = loadDotEnv(path.join(__dirname, '..', '.env'));
  if (process.env.BRIDGE_TOKEN && fileEnv.BRIDGE_TOKEN && process.env.BRIDGE_TOKEN !== fileEnv.BRIDGE_TOKEN) {
    console.warn('Note: BRIDGE_TOKEN is set in your terminal environment and overrides the one in .env.');
  }
  const env = { ...fileEnv, ...process.env };
  const cfg = {
    backend: (env.CCS_BACKEND_URL || '').replace(/\/$/, ''),
    bridgeToken: env.BRIDGE_TOKEN || '',
    mcpUrl: env.FFCPE_MCP_URL || 'https://run-workflow.adobe.io/mcp',
    port: Number(env.BRIDGE_PORT || 8765),
  };
  return cfg;
}

function requireRunConfig(cfg) {
  const missing = [];
  if (!/^https:\/\//.test(cfg.backend)) missing.push('CCS_BACKEND_URL');
  if (cfg.bridgeToken.length < 32) missing.push('BRIDGE_TOKEN (32+ chars)');
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/* ---------- local token storage (operator's machine only) ---------- */

function readTokens() {
  try { return JSON.parse(fs.readFileSync(tokenFile(), 'utf8')); } catch (e) { return null; }
}

function writeTokens(data) {
  fs.mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(tokenFile(), JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.chmodSync(tokenFile(), 0o600);
}

/* ---------- OAuth (loopback, PKCE) ---------- */

async function metadata(mcpUrl) {
  const origin = new URL(mcpUrl).origin;
  const res = await fetch(`${origin}/.well-known/oauth-authorization-server`);
  if (!res.ok) throw new Error(`Could not read Adobe sign-in metadata (${res.status}).`);
  return res.json();
}

async function registerClient(meta, redirectUri) {
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Creative Commerce Studio local bridge',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.client_id) throw new Error(`Adobe refused the bridge registration (${res.status} ${body.error || ''}).`);
  return body.client_id;
}

async function tokenRequest(meta, cfg, clientId, form) {
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ ...form, client_id: clientId, resource: cfg.mcpUrl }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const err = new Error(`Token request failed (${res.status} ${body.error || ''}).`);
    err.invalidGrant = body.error === 'invalid_grant';
    throw err;
  }
  return body;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, () => {});
}

async function login() {
  const cfg = config();
  const redirectUri = `http://localhost:${cfg.port}/callback`;
  const meta = await metadata(cfg.mcpUrl);
  const saved = readTokens();
  const clientId = saved?.clientId && saved.redirectUri === redirectUri
    ? saved.clientId : await registerClient(meta, redirectUri);

  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(24).toString('base64url');
  const auth = new URL(meta.authorization_endpoint);
  Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: cfg.mcpUrl,
  }).forEach(([k, v]) => auth.searchParams.set(k, v));

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok
        ? '<h1>Firefly connected</h1><p>The Creative Commerce Studio bridge is signed in. You can close this window.</p>'
        : '<h1>Sign-in failed</h1><p>Close this window and run <code>npm run bridge:login</code> again.</p>');
      server.close();
      if (ok) resolve(u.searchParams.get('code')); else reject(new Error(u.searchParams.get('error') || 'Sign-in failed or state mismatch.'));
    });
    server.listen(cfg.port, '127.0.0.1', () => {
      console.log('Opening Adobe sign-in in your browser. If it does not open, visit:\n');
      console.log(`  ${auth.href}\n`);
      openBrowser(auth.href);
    });
    setTimeout(() => { server.close(); reject(new Error('Timed out waiting for sign-in (5 min).')); }, 5 * 60 * 1000).unref();
  });

  const tokens = await tokenRequest(meta, cfg, clientId, {
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier,
  });
  writeTokens({
    clientId,
    redirectUri,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresAt: Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000,
  });
  console.log(`Signed in. Tokens saved to ${tokenFile()} (readable only by you). Now run: npm run bridge`);
}

async function accessToken(cfg, { force = false } = {}) {
  const t = readTokens();
  if (!t?.accessToken) throw Object.assign(new Error('Not signed in. Run: npm run bridge:login'), { fatal: true });
  if (!force && t.expiresAt > Date.now()) return t.accessToken;
  if (!t.refreshToken) throw Object.assign(new Error('Sign-in expired. Run: npm run bridge:login'), { fatal: true });
  const meta = await metadata(cfg.mcpUrl);
  try {
    const tokens = await tokenRequest(meta, cfg, t.clientId, { grant_type: 'refresh_token', refresh_token: t.refreshToken });
    writeTokens({
      ...t,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || t.refreshToken,
      expiresAt: Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000,
    });
    return tokens.access_token;
  } catch (e) {
    if (e.invalidGrant) throw Object.assign(new Error('Sign-in expired. Run: npm run bridge:login'), { fatal: true });
    throw e;
  }
}

/* ---------- backend + MCP ---------- */

async function backend(cfg, action, body = {}) {
  const res = await fetch(`${cfg.backend}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.bridgeToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = new Error(`Backend ${action}: ${json.error?.message || res.status}`);
    err.fatal = res.status === 401 || res.status === 404;
    throw err;
  }
  return json;
}

async function withMcp(cfg, fn) {
  const run = async (token) => {
    const s = new McpSession(cfg.mcpUrl, token, fetch);
    await s.initialize();
    return fn(s);
  };
  try {
    return await run(await accessToken(cfg));
  } catch (e) {
    if (e.code !== 'firefly-reauth' || e.uncertain) throw e;
    return run(await accessToken(cfg, { force: true }));
  }
}

async function handleSubmit(cfg, task) {
  try {
    const result = await withMcp(cfg, (s) => s.callTool('run_workflow_submit', {
      workflowId: task.workflowId,
      inputs: [{
        node_id: task.productNodeId,
        content: [{
          type: 'image', url: task.sourceUrl, name: task.sourceName, mimeType: task.mimeType,
        }],
      }],
    }));
    const batchId = findValue(result, ['batchId', 'batch_id', 'instanceId']);
    if (!batchId) throw new Error(`Firefly did not accept the run: ${String(findValue(result, ['message', 'error', 'text']) || 'no batch ID').slice(0, 200)}`);
    await backend(cfg, 'bridge-report', { jobId: task.jobId, batchId: String(batchId) });
    console.log(`[${new Date().toLocaleTimeString()}] started ${task.jobId} -> ${batchId}`);
  } catch (e) {
    if (e.fatal) throw e;
    await backend(cfg, 'bridge-report', { jobId: task.jobId, failure: e.message, uncertain: !!e.uncertain }).catch(() => {});
    console.error(`[${new Date().toLocaleTimeString()}] could not start ${task.jobId}: ${e.message}`);
  }
}

async function handlePoll(cfg, task) {
  try {
    const result = await withMcp(cfg, (s) => s.callTool('run_workflow_get_status', {
      instanceId: task.batchId, includeOutputs: true, includeFailedExecutions: true,
    }));
    const r = await backend(cfg, 'bridge-report', { jobId: task.jobId, result });
    if (r.status !== 'processing' && r.status !== 'queued') console.log(`[${new Date().toLocaleTimeString()}] ${task.jobId}: ${r.status}`);
  } catch (e) {
    if (e.fatal) throw e;
    console.error(`[${new Date().toLocaleTimeString()}] status check failed for ${task.jobId} (will retry): ${e.message}`);
  }
}

async function run() {
  const cfg = config();
  requireRunConfig(cfg);
  await accessToken(cfg); // fail early if not signed in
  console.log('Creative Commerce Studio local Firefly bridge (DEMO MODE) running. Runs use YOUR Firefly sign-in. Ctrl+C to stop.');
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.log('\nStopping…'); });
  while (!stopping) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { tasks = [] } = await backend(cfg, 'bridge-next');
      // eslint-disable-next-line no-restricted-syntax
      for (const task of tasks) {
        // eslint-disable-next-line no-await-in-loop
        if (task.type === 'submit') await handleSubmit(cfg, task);
        // eslint-disable-next-line no-await-in-loop
        else if (task.type === 'poll') await handlePoll(cfg, task);
      }
    } catch (e) {
      console.error(`[${new Date().toLocaleTimeString()}] ${e.message}`);
      if (/token rejected/i.test(e.message)) {
        console.error('The BRIDGE_TOKEN in .env does not match the deployed backend. Run "aio app deploy --force-deploy" (a plain deploy can skip unchanged actions), then start the bridge again.');
      }
      if (e.fatal) process.exit(1);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, POLL_MS); });
  }
}

module.exports = {
  handleSubmit, handlePoll, loadDotEnv, config,
};

if (require.main === module) {
  const cmd = process.argv[2];
  const main = cmd === 'login' ? login : cmd === 'run' ? run : null;
  if (!main) {
    console.log('Usage: node bridge/ccs-bridge.js <login|run>');
    process.exit(1);
  }
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
