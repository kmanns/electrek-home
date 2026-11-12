const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./helpers');

// Isolate the bridge's local token file before the script is loaded.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bridge-test-'));
process.env.CCS_BRIDGE_HOME = path.join(TMP_HOME, '.ccs-bridge');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const box = require('../lib/box');
const jobs = require('../lib/jobs');
const fireflyAuth = require('../lib/firefly-auth');
const bridgeNextAction = require('../actions/bridge-next/index');
const bridgeReportAction = require('../actions/bridge-report/index');
const bridgeScript = require('../bridge/ccs-bridge');

const TOKEN = 'x'.repeat(40);
const P = {
  ...h.PARAMS, FFCPE_MODE: 'bridge', BRIDGE_TOKEN: TOKEN, AEM_AUTHOR_URL: undefined, DELIVERY_MODE: 'public',
};
const alice = { id: 'alice', key: 'a'.repeat(32) };
const PNG = h.png(2400, 2400);

function boxWorld() {
  return h.router([
    ['POST', 'https://api.box.com/oauth2/token', () => ({ json: { access_token: 'box-at', refresh_token: 'box-rt', expires_in: 3600 } })],
    ['GET', 'https://api.box.com/2.0/users/me', () => ({ json: { name: 'Alice' } })],
    ['GET', 'https://api.box.com/2.0/files/555?', () => ({ json: { id: '555', type: 'file', name: 'bga200.png', size: PNG.length, file_version: { id: '777' }, path_collection: { entries: [{ id: '0' }, { id: '100' }] } } })],
    ['GET', 'https://api.box.com/2.0/files/555/content', () => ({ body: PNG })],
    ['GET', 'https://bucket.s3.amazonaws.com/d.jpg', () => ({ body: h.png(1200, 896) })],
    ['GET', 'https://bucket.s3.amazonaws.com/m.jpg', () => ({ body: h.png(896, 1200) })],
  ]);
}

async function connectBox(user, f) {
  const { authorizeUrl } = await box.startAuth(P, user);
  await box.completeAuth(P, { code: 'c', state: new URL(authorizeUrl).searchParams.get('state') }, f);
}

const body = (extra = {}) => ({
  requestId: '11111111-2222-4333-8444-555555555555',
  sku: 'STIHL-BGA200',
  productName: 'BGA 200',
  source: { provider: 'box', fileId: '555', versionId: '777', name: 'bga200.png' },
  associationConfirmed: true,
  ...extra,
});

const asBridge = (extra = {}, token = TOKEN) => ({ ...P, __ow_method: 'post', __ow_headers: { authorization: `Bearer ${token}` }, ...extra });

const completed = {
  status: 'completed',
  outputUrls: [
    { nodeId: 'node_cutout', url: 'https://bucket.s3.amazonaws.com/cut.png' },
    { nodeId: 'node_desktop', url: 'https://bucket.s3.amazonaws.com/d.jpg', mimeType: 'image/jpeg' },
    { nodeId: 'node_mobile', url: 'https://bucket.s3.amazonaws.com/m.jpg', mimeType: 'image/jpeg' },
  ],
};

beforeEach(() => { h.reset(); });

describe('backend side of the local bridge', () => {
  test('queues without calling Firefly, then claim -> started -> rendered -> accepted', async () => {
    const f = boxWorld();
    await connectBox(alice, f);
    const job = await jobs.submit(P, alice, body(), f);
    expect(job).toMatchObject({ status: 'queued', message: expect.stringMatching(/local Firefly bridge/) });
    expect(f.calls.some((c) => /run-workflow|ffcpe/.test(c.url))).toBe(false);

    const next1 = await bridgeNextAction.main(asBridge());
    expect(next1.statusCode).toBe(200);
    expect(next1.body.tasks).toEqual([expect.objectContaining({
      type: 'submit', jobId: job.id, workflowId: 'wf-1', productNodeId: 'node_product', mimeType: 'image/png', sourceUrl: expect.stringMatching(/^https:\/\/files\.example\/ccs\//),
    })]);
    expect((await bridgeNextAction.main(asBridge())).body.tasks).toEqual([]); // claimed once only

    expect((await bridgeReportAction.main(asBridge({ jobId: job.id, batchId: 'batch-1' }))).body).toEqual({ status: 'processing' });
    expect((await bridgeNextAction.main(asBridge())).body.tasks).toEqual([{ type: 'poll', jobId: job.id, batchId: 'batch-1' }]);
    expect((await bridgeReportAction.main(asBridge({ jobId: job.id, result: { status: 'running' } }))).body).toEqual({ status: 'processing' });

    const done = await jobs.bridgeReport(P, { jobId: job.id, result: completed }, f);
    expect(done).toEqual({ status: 'ready-for-review' });
    const view = await jobs.status(P, alice, job.id, f);
    expect(view.outputs.desktop).toMatchObject({ width: 1200, height: 896 });
    expect((await bridgeNextAction.main(asBridge())).body.tasks).toEqual([]);
    expect((await jobs.accept(P, alice, job.id, f)).status).toBe('accepted');
  });

  test('rejects a wrong bridge token and refuses when bridge mode is off', async () => {
    expect((await bridgeNextAction.main(asBridge({}, 'y'.repeat(40)))).statusCode).toBe(401);
    expect((await bridgeNextAction.main({ ...asBridge(), FFCPE_MODE: 'mcp' })).statusCode).toBe(404);
  });

  test('a claimed run that never starts becomes submit-uncertain, never resubmitted', async () => {
    const f = boxWorld();
    await connectBox(alice, f);
    const job = await jobs.submit(P, alice, body(), f);
    await jobs.bridgeNext(P);
    const key = `job.${job.id}`;
    const rec = JSON.parse(h.stateData.get(key));
    rec.bridge.claimedAt = Date.now() - 11 * 60 * 1000;
    h.stateData.set(key, JSON.stringify(rec));
    expect((await jobs.bridgeNext(P)).tasks).toEqual([]);
    expect((await jobs.status(P, alice, job.id, f)).status).toBe('submit-uncertain');
  });

  test('failure reports and heartbeat-based status', async () => {
    const f = boxWorld();
    await connectBox(alice, f);
    expect(await fireflyAuth.status(P, alice)).toMatchObject({ mode: 'bridge', connected: false });
    const job = await jobs.submit(P, alice, body(), f);
    await jobs.bridgeNext(P);
    expect(await fireflyAuth.status(P, alice)).toMatchObject({ mode: 'bridge', connected: true, bridgeOnline: true });
    await jobs.bridgeReport(P, { jobId: job.id, failure: 'socket hang up', uncertain: true });
    expect((await jobs.status(P, alice, job.id, f))).toMatchObject({ status: 'submit-uncertain', message: 'socket hang up' });
  });
});

describe('local bridge script', () => {
  const tokenFile = path.join(TMP_HOME, '.ccs-bridge', 'firefly.json');
  const cfg = {
    backend: 'https://ns.adobeioruntime.net/api/v1/web/creative-commerce-studio', bridgeToken: TOKEN, mcpUrl: 'https://run-workflow.adobe.io/mcp', port: 8765,
  };

  function mcpAndBackend(reports, { submitResult } = {}) {
    return h.router([
      ['POST', 'https://run-workflow.adobe.io/mcp', (u, init) => {
        expect(init.headers.Authorization).toBe('Bearer local-at');
        const msg = JSON.parse(init.body);
        if (msg.method === 'initialize') return { json: { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18' } }, headers: { 'mcp-session-id': 's1' } };
        if (msg.method === 'notifications/initialized') return { status: 202 };
        if (msg.method === 'tools/list') return { json: { jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'run_workflow_submit' }, { name: 'run_workflow_get_status' }] } } };
        const { name } = msg.params;
        if (name === 'run_workflow_submit') return { json: { jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(submitResult || { batchId: 'batch-9' }) }] } } };
        return { json: { jsonrpc: '2.0', id: msg.id, result: { structuredContent: completed } } };
      }],
      ['POST', `${cfg.backend}/bridge-report`, (u, init) => {
        expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
        reports.push(JSON.parse(init.body));
        return { json: { status: 'processing' } };
      }],
    ]);
  }

  beforeEach(() => {
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, JSON.stringify({ clientId: 'c', accessToken: 'local-at', refreshToken: 'r', expiresAt: Date.now() + 3600e3 }));
  });

  test('submits with the published workflow contract and reports the batch ID', async () => {
    const reports = [];
    global.fetch = mcpAndBackend(reports);
    await bridgeScript.handleSubmit(cfg, {
      type: 'submit', jobId: 'job-12345678', workflowId: 'wf-1', productNodeId: 'node_product', sourceUrl: 'https://files.example/s.png', sourceName: 's.png', mimeType: 'image/png',
    });
    const call = global.fetch.calls.find((c) => c.init.body?.includes('run_workflow_submit'));
    expect(JSON.parse(call.init.body).params.arguments).toEqual({
      workflowId: 'wf-1', inputs: [{ node_id: 'node_product', content: [{ type: 'image', url: 'https://files.example/s.png', name: 's.png', mimeType: 'image/png' }] }],
    });
    expect(reports).toEqual([{ jobId: 'job-12345678', batchId: 'batch-9' }]);
  });

  test('reports a clear failure when Firefly does not accept the run', async () => {
    const reports = [];
    global.fetch = mcpAndBackend(reports, { submitResult: { status: 'rejected', message: 'workflow not published' } });
    await bridgeScript.handleSubmit(cfg, {
      type: 'submit', jobId: 'job-12345678', workflowId: 'wf-1', productNodeId: 'n', sourceUrl: 'https://f/s.png', sourceName: 's.png', mimeType: 'image/png',
    });
    expect(reports).toEqual([{ jobId: 'job-12345678', failure: expect.stringMatching(/workflow not published/), uncertain: false }]);
  });

  test('forwards the raw status payload for the backend to interpret', async () => {
    const reports = [];
    global.fetch = mcpAndBackend(reports);
    await bridgeScript.handlePoll(cfg, { type: 'poll', jobId: 'job-12345678', batchId: 'batch-9' });
    expect(reports).toEqual([{ jobId: 'job-12345678', result: completed }]);
  });

  test('reads only KEY=VALUE lines from .env', () => {
    const f = path.join(TMP_HOME, 'test.env');
    fs.writeFileSync(f, '# comment\nCCS_BACKEND_URL=https://x\nBRIDGE_TOKEN="abc"\nnot a line\n');
    expect(bridgeScript.loadDotEnv(f)).toEqual({ CCS_BACKEND_URL: 'https://x', BRIDGE_TOKEN: 'abc' });
  });
});

describe('hosted Firefly sign-in refusal', () => {
  test('turns Adobe\'s redirect_uri refusal into a clear error before any popup', async () => {
    fireflyAuth._reset();
    const f = h.router([
      ['GET', 'https://run-workflow.adobe.io/.well-known/oauth-authorization-server', () => ({ json: {} })],
      ['POST', 'https://run-workflow.adobe.io/mcp/auth/register', () => ({ status: 201, json: { client_id: 'dyn' } })],
      ['GET', 'https://run-workflow.adobe.io/mcp/auth/authorize', () => ({ status: 400, json: { error: 'BAD_REQUEST', message: 'redirect_uri must be a loopback (localhost) URL or the Claude hosted callback.' } })],
    ]);
    await expect(fireflyAuth.startAuth({ ...P, FFCPE_MODE: 'mcp' }, alice, f))
      .rejects.toMatchObject({ code: 'firefly-signin-not-allowed', message: expect.stringMatching(/only lets local tools/) });
  });
});
