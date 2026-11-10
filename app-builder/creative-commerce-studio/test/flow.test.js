const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const box = require('../lib/box');
const jobs = require('../lib/jobs');
const ffcpe = require('../lib/ffcpe');
const assets = require('../lib/assets');

const P = h.PARAMS;
const alice = { id: 'alice', key: 'a'.repeat(32) };
const bob = { id: 'bob', key: 'b'.repeat(32) };
const PNG = h.png(2400, 2400);

function world(overrides = {}) {
  const aemAssets = new Map();
  let batchPolls = 0;
  const routes = [
    // Box
    ['POST', 'https://api.box.com/oauth2/token', (u, init) => {
      const form = new URLSearchParams(init.body);
      if (overrides.refreshFails && form.get('grant_type') === 'refresh_token') return { status: 400, json: { error: 'invalid_grant' } };
      return { json: { access_token: `at-${form.get('grant_type')}`, refresh_token: `rt-${Date.now()}`, expires_in: 3600 } };
    }],
    ['GET', 'https://api.box.com/2.0/users/me', () => ({ json: { name: 'Alice', login: 'alice@example.com' } })],
    ['GET', 'https://api.box.com/2.0/folders/100/items', () => ({ json: { entries: [
      { type: 'file', id: '555', name: 'bga200.png', size: PNG.length, file_version: { id: '777' } },
      { type: 'file', id: '556', name: 'brief.pdf', size: 10, file_version: { id: '1' } },
      { type: 'folder', id: '101', name: 'Archive' },
    ] } })],
    ['GET', 'https://api.box.com/2.0/folders/100?', () => ({ json: { id: '100', type: 'folder', name: 'Campaign', path_collection: { entries: [{ id: '0' }] } } })],
    ['GET', 'https://api.box.com/2.0/folders/999?', () => ({ json: { id: '999', type: 'folder', name: 'Private', path_collection: { entries: [{ id: '0' }] } } })],
    ['GET', /\/files\/\d+\/thumbnail/, () => ({ status: 202 })],
    ['GET', 'https://api.box.com/2.0/files/555?', () => ({ json: { id: '555', type: 'file', name: 'bga200.png', size: PNG.length, file_version: { id: '777' }, sha1: 'abc', path_collection: { entries: [{ id: '0' }, { id: '100' }] } } })],
    ['GET', 'https://api.box.com/2.0/files/666?', () => ({ json: { id: '666', type: 'file', name: 'other.png', size: 10, file_version: { id: '1' }, path_collection: { entries: [{ id: '0' }, { id: '999' }] } } })],
    ['GET', 'https://api.box.com/2.0/files/555/content', () => ({ body: PNG })],
    // IMS (service credentials for FFCPE + AEM)
    ['POST', 'https://ims-na1.adobelogin.com/ims/token/v3', () => ({ json: { access_token: 'svc', expires_in: 86400 } })],
    // FFCPE
    ['POST', 'https://ffcpe.example/v1/batch/execute', () => (overrides.executeThrows ? new TypeError('socket hang up') : { status: 202, json: { batchId: 'batch-1', status: 'pending' } })],
    ['GET', 'https://ffcpe.example/v1/batch/batch-1/status', () => { batchPolls += 1; return { json: { status: batchPolls > 1 ? 'completed' : 'running' } }; }],
    ['GET', 'https://ffcpe.example/v1/batch/batch-1/executions', () => ({ json: { executions: [{ status: 'success', outputs: [
      { name: 'spotlight-desktop', url: 'https://out.example/desktop.png' },
      { name: 'spotlight-mobile', url: 'https://out.example/mobile.png' },
    ] }] } })],
    ['GET', 'https://out.example/desktop.png', () => ({ body: h.png(1600, 900) })],
    ['GET', 'https://out.example/mobile.png', () => ({ body: h.png(800, 1000) })],
    // AEM Assets
    ['POST', 'https://author-p1-e2.adobeaemcloud.com/api/assets/', () => ({ status: 201, json: {} })],
    ['POST', /\.initiateUpload\.json$/, (u, init) => {
      const name = new URLSearchParams(init.body).get('fileName');
      return { json: { completeURI: '/content/dam/creative-commerce-studio/stihl-bga200.completeUpload.json', files: [{ fileName: name, uploadToken: `tok-${name}`, uploadURIs: [`https://blob.example/${name}`] }] } };
    }],
    ['PUT', 'https://blob.example/', () => (overrides.blobFails ? { status: 500 } : { status: 201 })],
    ['POST', /completeUpload\.json$/, (u, init) => {
      const name = new URLSearchParams(init.body).get('fileName');
      aemAssets.set(name, `uuid-${name}`);
      return { status: 200, json: {} };
    }],
    ['PUT', 'https://author-p1-e2.adobeaemcloud.com/api/assets/', () => ({ status: 200, json: {} })],
    ['GET', /adobeaemcloud\.com\/content\/dam\/.*\.json$/, (u) => {
      const name = u.split('/').pop().replace(/\.json$/, '');
      return aemAssets.has(name) ? { json: { 'jcr:uuid': aemAssets.get(name) } } : { status: 404, json: {} };
    }],
    ['HEAD', 'https://delivery-p1-e2.adobeaemcloud.com/adobe/assets/', () => ({ status: 200 })],
  ];
  return h.router(routes);
}

async function connect(user, f) {
  const { authorizeUrl } = await box.startAuth(P, user);
  const state = new URL(authorizeUrl).searchParams.get('state');
  return box.completeAuth(P, { code: 'c0de', state }, f);
}

const submitBody = (extra = {}) => ({
  requestId: '11111111-2222-4333-8444-555555555555',
  sku: 'STIHL-BGA200',
  productName: 'BGA 200',
  source: { provider: 'box', fileId: '555', versionId: '777', name: 'bga200.png' },
  associationConfirmed: true,
  ...extra,
});

beforeEach(() => { h.reset(); ffcpe._reset(); assets._reset(); });

describe('Box connector', () => {
  test('OAuth state is single-use and bound to the author; tokens are encrypted at rest', async () => {
    const f = world();
    const { authorizeUrl } = await box.startAuth(P, alice);
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://account.box.com/api/oauth2/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe(P.BOX_REDIRECT_URI);
    const state = url.searchParams.get('state');
    expect(await box.completeAuth(P, { code: 'x', state }, f)).toMatchObject({ ok: true });
    expect(await box.completeAuth(P, { code: 'x', state }, f)).toMatchObject({ ok: false });
    const raw = [...h.stateData.values()].join(' ');
    expect(raw).not.toMatch(/at-authorization_code|rt-/);
    expect(await box.status(P, alice)).toEqual({ connected: true, user: { name: 'Alice', login: 'alice@example.com' } });
    expect(await box.status(P, bob)).toEqual({ connected: false, user: null });
  });

  test('lists only the allowed folder tree', async () => {
    const f = world();
    await connect(alice, f);
    const listing = await box.listFolder(P, alice, null, f);
    expect(listing.folder).toMatchObject({ id: '100', parentId: null });
    expect(listing.entries.map((e) => [e.name, e.supported ?? 'folder'])).toEqual([['bga200.png', true], ['brief.pdf', false], ['Archive', 'folder']]);
    await expect(box.listFolder(P, alice, '999', f)).rejects.toMatchObject({ code: 'box-folder-not-allowed' });
  });

  test('refreshes expired tokens; a revoked refresh token asks the author to reconnect', async () => {
    const f = world({ refreshFails: true });
    await connect(alice, f);
    const [k, v] = [...h.stateData.entries()].find(([key]) => key.startsWith('box.conn.'));
    const conn = JSON.parse(v);
    const { decrypt, encrypt } = require('../lib/crypto');
    const tokens = decrypt(P, conn.sealed, k);
    h.stateData.set(k, JSON.stringify({ ...conn, sealed: encrypt(P, { ...tokens, expiresAt: 0 }, k) }));
    await expect(box.listFolder(P, alice, null, f)).rejects.toMatchObject({ code: 'box-reauth' });
    expect(await box.status(P, alice)).toMatchObject({ connected: false });
  });
});

describe('jobs', () => {
  test('full path: submit -> processing -> ready-for-review -> accepted with durable URLs', async () => {
    const f = world();
    await connect(alice, f);
    const submitted = await jobs.submit(P, alice, submitBody(), f);
    expect(submitted).toMatchObject({ status: 'processing', sku: 'STIHL-BGA200', source: { fileId: '555', versionId: '777' } });
    expect(JSON.stringify(submitted)).not.toMatch(/files\.example|filePath/);

    const execCall = f.calls.find((c) => c.url.endsWith('/batch/execute'));
    expect(JSON.parse(execCall.init.body)).toEqual({ workflowId: 'wf-1', inputs: [{ name: 'STIHL-BGA200', url: expect.stringMatching(/^https:\/\/files\.example\/ccs\/.+\/source\.png/) }] });

    expect((await jobs.status(P, alice, submitted.id, f)).status).toBe('processing');
    const ready = await jobs.status(P, alice, submitted.id, f);
    expect(ready.status).toBe('ready-for-review');
    expect(ready.outputs.desktop).toMatchObject({ width: 1600, height: 900, previewUrl: expect.stringMatching(/^https:/) });
    expect(ready.outputs.mobile).toMatchObject({ width: 800, height: 1000 });

    const accepted = await jobs.accept(P, alice, submitted.id, f);
    expect(accepted.status).toBe('accepted');
    expect(accepted.outputs.desktop.deliveryUrl).toMatch(/^https:\/\/delivery-p1-e2\.adobeaemcloud\.com\/adobe\/assets\/urn:aaid:aem:uuid-stihl-bga200-desktop-.+\/as\/stihl-bga200-desktop-.+\.png$/);
    expect(accepted.outputs.mobile.previewUrl).toBeUndefined();

    const recent = await jobs.recent(alice);
    expect(recent.jobs.map((j) => j.id)).toEqual([submitted.id]);
    expect((await jobs.recent(bob)).jobs).toEqual([]);
  });

  test('same requestId or same active selection never starts a second paid run', async () => {
    const f = world();
    await connect(alice, f);
    const a = await jobs.submit(P, alice, submitBody(), f);
    const b = await jobs.submit(P, alice, submitBody(), f);
    const c = await jobs.submit(P, alice, submitBody({ requestId: '99999999-2222-4333-8444-555555555555' }), f);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(f.calls.filter((x) => x.url.endsWith('/batch/execute'))).toHaveLength(1);
  });

  test('requires explicit association, the allowed folder, and ownership', async () => {
    const f = world();
    await connect(alice, f);
    await expect(jobs.submit(P, alice, submitBody({ associationConfirmed: false }), f)).rejects.toMatchObject({ code: 'association-required' });
    await expect(jobs.submit(P, alice, submitBody({ source: { provider: 'box', fileId: '666', versionId: '1' } }), f)).rejects.toMatchObject({ code: 'box-folder-not-allowed' });
    const job = await jobs.submit(P, alice, submitBody(), f);
    await expect(jobs.status(P, bob, job.id, f)).rejects.toMatchObject({ code: 'job-not-found' });
  });

  test('an uncertain submission is not retried automatically', async () => {
    const f = world({ executeThrows: true });
    await connect(alice, f);
    const job = await jobs.submit(P, alice, submitBody(), f);
    expect(job.status).toBe('submit-uncertain');
    expect(f.calls.filter((x) => x.url.endsWith('/batch/execute'))).toHaveLength(1);
  });

  test('delivery failure is its own state and can be retried', async () => {
    const f = world({ blobFails: true });
    await connect(alice, f);
    const job = await jobs.submit(P, alice, submitBody(), f);
    await jobs.status(P, alice, job.id, f);
    await jobs.status(P, alice, job.id, f);
    const failed = await jobs.accept(P, alice, job.id, f);
    expect(failed.status).toBe('delivery-failed');
    expect(failed.message).toMatch(/Uploading the binary failed/);
    expect(failed.outputs.desktop.previewUrl).toMatch(/^https:/);
  });
});
