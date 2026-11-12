const crypto = require('crypto');
const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const box = require('../lib/box');
const jobs = require('../lib/jobs');
const fireflyAuth = require('../lib/firefly-auth');
const { parseSse } = require('../lib/mcp');

const P = {
  ...h.PARAMS, FFCPE_MODE: 'mcp', AEM_AUTHOR_URL: undefined, DELIVERY_MODE: 'public',
};
const alice = { id: 'alice', key: 'a'.repeat(32) };
const bob = { id: 'bob', key: 'b'.repeat(32) };
const PNG = h.png(2400, 2400);
const AS = 'https://run-workflow.adobe.io';

/** Fake Adobe run-workflow: OAuth AS (DCR + PKCE) and an MCP server. */
function adobe(opts = {}) {
  const state = {
    registrations: 0, codes: new Map(), tokens: new Set(), submits: [], polls: 0, sessions: 0, rejectNext401: !!opts.expireFirst,
  };
  const json = (o, status = 200, headers = {}) => ({ status, json: o, headers });
  const sse = (msg) => ({ status: 200, body: `event: message\ndata: ${JSON.stringify(msg)}\n\n`, headers: { 'content-type': 'text/event-stream' } });
  const routes = [
    ['GET', `${AS}/.well-known/oauth-authorization-server`, () => json({
      issuer: AS, authorization_endpoint: `${AS}/mcp/auth/authorize`, token_endpoint: `${AS}/mcp/auth/token`, registration_endpoint: `${AS}/mcp/auth/register`,
    })],
    ['POST', `${AS}/mcp/auth/register`, (u, init) => {
      state.registrations += 1;
      const body = JSON.parse(init.body);
      expect(body.redirect_uris).toEqual([P.FIREFLY_REDIRECT_URI]);
      expect(body.token_endpoint_auth_method).toBe('none');
      return json({ client_id: 'dyn-client-1' }, 201);
    }],
    ['POST', `${AS}/mcp/auth/token`, (u, init) => {
      const f = new URLSearchParams(init.body);
      expect(f.get('client_id')).toBe('dyn-client-1');
      expect(f.get('resource')).toBe(`${AS}/mcp`);
      if (f.get('grant_type') === 'authorization_code') {
        const challenge = state.codes.get(f.get('code'));
        if (!challenge) return json({ error: 'invalid_grant' }, 400);
        const expected = crypto.createHash('sha256').update(f.get('code_verifier')).digest('base64url');
        if (expected !== challenge) return json({ error: 'invalid_grant' }, 400);
      }
      if (f.get('grant_type') === 'refresh_token' && !f.get('refresh_token').startsWith('rt-')) return json({ error: 'invalid_grant' }, 400);
      const at = `at-${Math.random().toString(36).slice(2)}`;
      state.tokens.add(at);
      return json({ access_token: at, refresh_token: `rt-${Date.now()}`, expires_in: 3600 });
    }],
    ['POST', `${AS}/mcp`, (u, init) => {
      const token = (init.headers.Authorization || '').replace('Bearer ', '');
      if (state.rejectNext401) { state.rejectNext401 = false; return json({ error: 'expired' }, 401); }
      if (!state.tokens.has(token)) return json({ error: 'UNAUTHORIZED' }, 401);
      const msg = JSON.parse(init.body);
      if (msg.method === 'initialize') {
        state.sessions += 1;
        return json({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'run-workflow' } } }, 200, { 'mcp-session-id': `sess-${state.sessions}` });
      }
      expect(init.headers['Mcp-Session-Id']).toMatch(/^sess-/);
      if (msg.method === 'notifications/initialized') return { status: 202 };
      if (msg.method === 'tools/list') {
        return sse({ jsonrpc: '2.0', id: msg.id, result: { tools: ['Firefly-Creative-Production-MCP-run_workflow_submit', 'Firefly-Creative-Production-MCP-run_workflow_get_status', 'Firefly-Creative-Production-MCP-inspect_run'].map((name) => ({ name })) } });
      }
      if (msg.method === 'tools/call') {
        const { name, arguments: args } = msg.params;
        if (name.endsWith('run_workflow_submit')) {
          state.submits.push(args);
          return sse({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ status: 'accepted', batchId: 'batch-xyz', links: { status: '...' } }) }] } });
        }
        if (name.endsWith('run_workflow_get_status')) {
          expect(args).toEqual({ instanceId: 'batch-xyz', includeOutputs: true, includeFailedExecutions: true });
          state.polls += 1;
          if (opts.fail) {
            return json({ jsonrpc: '2.0', id: msg.id, result: { structuredContent: { status: 'failed', executions: [{ status: 'failed', error: 'Background removal failed: no subject found' }] }, content: [] } });
          }
          const done = state.polls > 1;
          return json({ jsonrpc: '2.0', id: msg.id, result: { structuredContent: done ? {
            status: 'completed',
            summary: { succeeded: 1, failed: 0 },
            outputUrls: [
              { nodeId: 'node_cutout', name: 'product.png', url: 'https://bucket.s3.amazonaws.com/cut.png?X-Amz-Expires=3600', mimeType: 'image/png' },
              { nodeId: 'node_mobile', name: 'source-desktop-background_896_1200.jpg', url: 'https://bucket.s3.amazonaws.com/m.jpg?X-Amz-Expires=3600', mimeType: 'image/jpeg' },
              { nodeId: 'node_desktop', name: 'source-mobile-background_1200_896.jpg', url: 'https://bucket.s3.amazonaws.com/d.jpg?X-Amz-Expires=3600', mimeType: 'image/jpeg' },
            ],
          } : { status: 'running', progress: 40 }, content: [] } });
        }
      }
      return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'unknown' } });
    }],
    ['GET', 'https://bucket.s3.amazonaws.com/d.jpg', () => ({ body: h.png(1200, 896) })],
    ['GET', 'https://bucket.s3.amazonaws.com/m.jpg', () => ({ body: h.png(896, 1200) })],
    // Box
    ['POST', 'https://api.box.com/oauth2/token', () => json({ access_token: 'box-at', refresh_token: 'box-rt', expires_in: 3600 })],
    ['GET', 'https://api.box.com/2.0/users/me', () => json({ name: 'Alice' })],
    ['GET', 'https://api.box.com/2.0/files/555?', () => json({ id: '555', type: 'file', name: 'bga200.png', size: PNG.length, file_version: { id: '777' }, path_collection: { entries: [{ id: '0' }, { id: '100' }] } })],
    ['GET', 'https://api.box.com/2.0/files/555/content', () => ({ body: PNG })],
  ];
  const f = h.router(routes);
  f.state = state;
  /** Simulates the author's browser: follow the authorize URL and get the redirect back. */
  f.authorize = (authorizeUrl) => {
    const u = new URL(authorizeUrl);
    expect(u.origin + u.pathname).toBe(`${AS}/mcp/auth/authorize`);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('resource')).toBe(`${AS}/mcp`);
    const code = `code-${Math.random().toString(36).slice(2)}`;
    state.codes.set(code, u.searchParams.get('code_challenge'));
    return { code, state: u.searchParams.get('state') };
  };
  return f;
}

async function connectBox(user, f) {
  const { authorizeUrl } = await box.startAuth(P, user);
  await box.completeAuth(P, { code: 'c', state: new URL(authorizeUrl).searchParams.get('state') }, f);
}

async function connectFirefly(user, f) {
  const { authorizeUrl } = await fireflyAuth.startAuth(P, user, f);
  return fireflyAuth.completeAuth(P, f.authorize(authorizeUrl), f);
}

const body = (extra = {}) => ({
  requestId: '11111111-2222-4333-8444-555555555555',
  sku: 'STIHL-BGA200',
  productName: 'BGA 200',
  source: { provider: 'box', fileId: '555', versionId: '777', name: 'bga200.png' },
  associationConfirmed: true,
  ...extra,
});

beforeEach(() => { h.reset(); fireflyAuth._reset(); });

describe('Firefly sign-in (run-workflow MCP OAuth)', () => {
  test('registers once, uses PKCE, stores tokens encrypted per author', async () => {
    const f = adobe();
    expect(await connectFirefly(alice, f)).toMatchObject({ ok: true });
    await connectFirefly(bob, f);
    expect(f.state.registrations).toBe(1);
    expect([...h.stateData.values()].join(' ')).not.toMatch(/at-|rt-/);
    expect(await fireflyAuth.status(P, alice)).toEqual({ connected: true, mode: 'mcp' });
    await fireflyAuth.disconnect(P, alice);
    expect(await fireflyAuth.status(P, alice)).toEqual({ connected: false, mode: 'mcp' });
    expect(await fireflyAuth.status(P, bob)).toEqual({ connected: true, mode: 'mcp' });
  });

  test('rejects a wrong PKCE verifier and single-use state', async () => {
    const f = adobe();
    const { authorizeUrl } = await fireflyAuth.startAuth(P, alice, f);
    const cb = f.authorize(authorizeUrl);
    f.state.codes.set(cb.code, 'not-the-challenge');
    await expect(fireflyAuth.completeAuth(P, cb, f)).rejects.toMatchObject({ code: 'firefly-reauth' });
    expect(await fireflyAuth.completeAuth(P, cb, f)).toMatchObject({ ok: false });
  });
});

describe('jobs via the MCP engine', () => {
  test('submit -> poll -> ready-for-review -> accepted (public delivery), matched by node ID', async () => {
    const f = adobe();
    await connectBox(alice, f);
    await connectFirefly(alice, f);
    const job = await jobs.submit(P, alice, body(), f);
    expect(job.status).toBe('processing');
    expect(f.state.submits).toEqual([{
      workflowId: 'wf-1',
      inputs: [{ node_id: 'node_product', content: [{ type: 'image', url: expect.stringMatching(/^https:\/\/files\.example\/ccs\/.+\/source\.png/), name: 'bga200.png', mimeType: 'image/png' }] }],
    }]);
    expect((await jobs.status(P, alice, job.id, f)).status).toBe('processing');
    const ready = await jobs.status(P, alice, job.id, f);
    expect(ready.status).toBe('ready-for-review');
    expect(ready.outputs.desktop).toMatchObject({ width: 1200, height: 896 });
    expect(ready.outputs.mobile).toMatchObject({ width: 896, height: 1200 });
    const accepted = await jobs.accept(P, alice, job.id, f);
    expect(accepted.status).toBe('accepted');
    expect(accepted.outputs.desktop.deliveryUrl).toMatch(/^https:\/\/pub\.blob\.core\.windows\.net\/container-public\/public\/creative-commerce-studio\/stihl-bga200\/stihl-bga200-desktop-[a-z0-9]+\.png$/);
    expect(accepted.outputs.desktop.deliveryUrl).not.toContain(job.id);
    expect(JSON.stringify(accepted)).not.toMatch(/amazonaws|X-Amz/);
  });

  test('fails fast with firefly-reauth before downloading anything when Firefly is not connected', async () => {
    const f = adobe();
    await connectBox(alice, f);
    await expect(jobs.submit(P, alice, body(), f)).rejects.toMatchObject({ code: 'firefly-reauth' });
    expect(h.filesData.size).toBe(0);
    expect(f.calls.some((c) => c.url.includes('/files/555/content'))).toBe(false);
  });

  test('refreshes the author token once when the MCP answers 401', async () => {
    const f = adobe({ expireFirst: true });
    await connectBox(alice, f);
    await connectFirefly(alice, f);
    const job = await jobs.submit(P, alice, body(), f);
    expect(job.status).toBe('processing');
    expect(f.state.submits).toHaveLength(1);
  });

  test('surfaces the workflow error message on failure', async () => {
    const f = adobe({ fail: true });
    await connectBox(alice, f);
    await connectFirefly(alice, f);
    const job = await jobs.submit(P, alice, body(), f);
    const failed = await jobs.status(P, alice, job.id, f);
    expect(failed).toMatchObject({ status: 'render-failed', message: 'Background removal failed: no subject found' });
  });
});

test('parseSse reads JSON-RPC messages from event-stream bodies', () => {
  expect(parseSse('event: message\ndata: {"id":1}\n\n: ping\n\ndata: {"id":2}\n\n')).toEqual([{ id: 1 }, { id: 2 }]);
});
