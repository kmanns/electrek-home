const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const box = require('../lib/box');
const jobs = require('../lib/jobs');
const workflows = require('../lib/workflows');
const ffcpe = require('../lib/ffcpe');
const listAction = require('../actions/workflows-list/index');

const WORKFLOWS = [
  {
    key: 'spotlight', label: 'Product spotlight', description: 'Cutout on the brand backdrop', steps: ['Remove background', 'Place in layouts'], workflowId: 'wf-spot', productNodeId: 'n-spot-in', desktopNodeId: 'n-spot-d', mobileNodeId: 'n-spot-m',
  },
  {
    key: 'lifestyle', label: 'Lifestyle scene', workflowId: 'wf-life', productNodeId: 'n-life-in', desktopNodeId: 'n-life-d', mobileNodeId: 'n-life-m',
  },
];
const base = {
  ...h.PARAMS,
  FFCPE_WORKFLOWS: JSON.stringify(WORKFLOWS),
  FFCPE_WORKFLOW_ID: undefined,
  FFCPE_PRODUCT_NODE_ID: undefined,
  FFCPE_DESKTOP_NODE_ID: undefined,
  FFCPE_MOBILE_NODE_ID: undefined,
  AEM_AUTHOR_URL: undefined,
  DELIVERY_MODE: 'public',
};
const BRIDGE = { ...base, FFCPE_MODE: 'bridge', BRIDGE_TOKEN: 'x'.repeat(40) };
const alice = { id: 'alice', key: 'a'.repeat(32) };
const PNG = h.png(2400, 2400);

function world(extra = []) {
  return h.router([
    ['POST', 'https://api.box.com/oauth2/token', () => ({ json: { access_token: 'box-at', refresh_token: 'box-rt', expires_in: 3600 } })],
    ['GET', 'https://api.box.com/2.0/users/me', () => ({ json: { name: 'Alice' } })],
    ['GET', 'https://api.box.com/2.0/files/555?', () => ({ json: { id: '555', type: 'file', name: 'packshot.png', size: PNG.length, file_version: { id: '777' }, path_collection: { entries: [{ id: '0' }, { id: '100' }] } } })],
    ['GET', 'https://api.box.com/2.0/files/555/content', () => ({ body: PNG })],
    ['GET', 'https://out.example/d.jpg', () => ({ body: h.png(1200, 896) })],
    ['GET', 'https://out.example/m.jpg', () => ({ body: h.png(896, 1200) })],
    ...extra,
  ]);
}

async function connectBox(params, f) {
  const { authorizeUrl } = await box.startAuth(params, alice);
  await box.completeAuth(params, { code: 'c', state: new URL(authorizeUrl).searchParams.get('state') }, f);
}

let seq = 0;
const body = (extra = {}) => {
  seq += 1;
  return {
    requestId: `11111111-2222-4333-8444-${String(seq).padStart(12, '0')}`,
    sku: 'DEMO-SKU-001',
    productName: 'Demo product',
    source: { provider: 'box', fileId: '555', versionId: '777', name: 'packshot.png' },
    associationConfirmed: true,
    ...extra,
  };
};

beforeEach(() => { h.reset(); ffcpe._reset(); });

describe('workflow configuration', () => {
  test('parses the curated list; the first entry is the default', () => {
    const all = workflows.list(base);
    expect(all.map((w) => w.key)).toEqual(['spotlight', 'lifestyle']);
    expect(workflows.resolve(base, null).key).toBe('spotlight');
    expect(workflows.resolve(base, 'lifestyle').workflowId).toBe('wf-life');
    expect(all[1].label).toBe('Lifestyle scene');
    expect(all[1].steps).toEqual([]);
  });

  test('falls back to the single FFCPE_WORKFLOW_ID setup', () => {
    const single = workflows.list({ ...h.PARAMS, FFCPE_WORKFLOW_LABEL: 'Our spotlight' });
    expect(single).toEqual([expect.objectContaining({
      key: 'default', label: 'Our spotlight', workflowId: 'wf-1', productNodeId: 'node_product', steps: workflows.DEFAULT_STEPS,
    })]);
  });

  test('rejects invalid JSON, duplicate keys and missing node IDs with readable errors', () => {
    expect(() => workflows.list({ FFCPE_WORKFLOWS: '[{bad' })).toThrow(/not valid JSON/);
    expect(() => workflows.list({ FFCPE_WORKFLOWS: JSON.stringify([WORKFLOWS[0], WORKFLOWS[0]]) })).toThrow(/duplicate key "spotlight"/);
    expect(() => workflows.list({ FFCPE_WORKFLOWS: JSON.stringify([{ ...WORKFLOWS[1], mobileNodeId: '' }]) })).toThrow(/"lifestyle": "mobileNodeId" is missing/);
    expect(() => workflows.list({ FFCPE_WORKFLOWS: JSON.stringify([{ ...WORKFLOWS[1], key: 'Bad Key' }]) })).toThrow(/"key" must be/);
    expect(() => workflows.resolve(base, 'nope')).toThrow(/not available on this site/);
  });

  test('the workflows-list action shows labels, descriptions and steps but never node IDs', async () => {
    const token = h.jwt({ client_id: 'darkalley', user_id: 'U1@AdobeID', created_at: String(Date.now()), expires_in: '86400000' });
    const realFetch = global.fetch;
    global.fetch = h.router([['POST', 'https://ims-na1.adobelogin.com/ims/validate_token', () => ({ json: { valid: true, token: { user_id: 'U1@AdobeID' } } })]]);
    try {
      const res = await listAction.main({ ...base, __ow_method: 'post', __ow_headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        defaultKey: 'spotlight',
        workflows: [
          {
            key: 'spotlight', label: 'Product spotlight', description: 'Cutout on the brand backdrop', steps: ['Remove background', 'Place in layouts'],
          },
          {
            key: 'lifestyle', label: 'Lifestyle scene', description: '', steps: [],
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/n-spot|n-life|wf-/);
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe('jobs run the chosen workflow', () => {
  test('bridge: task and result matching use the chosen workflow and its nodes', async () => {
    const f = world();
    await connectBox(BRIDGE, f);
    const job = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'lifestyle' }), f);
    expect(job.recipe).toEqual({
      workflowKey: 'lifestyle', label: 'Lifestyle scene', workflowId: 'wf-life', version: '1', mode: 'bridge',
    });
    const [task] = (await jobs.bridgeNext(BRIDGE)).tasks;
    expect(task).toMatchObject({ type: 'submit', workflowId: 'wf-life', productNodeId: 'n-life-in' });
    await jobs.bridgeReport(BRIDGE, { jobId: job.id, batchId: 'b-1' });

    // outputs at the *spotlight* nodes don't count for a lifestyle job
    await jobs.bridgeReport(BRIDGE, {
      jobId: job.id,
      result: { status: 'completed', outputUrls: [{ nodeId: 'n-spot-d', url: 'https://out.example/d.jpg' }, { nodeId: 'n-spot-m', url: 'https://out.example/m.jpg' }] },
    }, f);
    expect((await jobs.status(BRIDGE, alice, job.id, f))).toMatchObject({ status: 'render-failed', message: expect.stringMatching(/n-spot-d/) });

    const job2 = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'lifestyle' }), f);
    await jobs.bridgeNext(BRIDGE);
    await jobs.bridgeReport(BRIDGE, { jobId: job2.id, batchId: 'b-2' });
    await jobs.bridgeReport(BRIDGE, {
      jobId: job2.id,
      result: { status: 'completed', outputUrls: [{ nodeId: 'n-life-d', url: 'https://out.example/d.jpg' }, { nodeId: 'n-life-m', url: 'https://out.example/m.jpg' }] },
    }, f);
    expect((await jobs.status(BRIDGE, alice, job2.id, f)).status).toBe('ready-for-review');
  });

  test('no workflow key uses the default; an unknown key is refused before any download', async () => {
    const f = world();
    await connectBox(BRIDGE, f);
    const job = await jobs.submit(BRIDGE, alice, body(), f);
    expect(job.recipe.workflowKey).toBe('spotlight');
    const downloadsBefore = f.calls.filter((c) => c.url.includes('/content')).length;
    await expect(jobs.submit(BRIDGE, alice, body({ workflowKey: 'nope' }), f)).rejects.toMatchObject({ code: 'workflow-not-allowed' });
    expect(f.calls.filter((c) => c.url.includes('/content')).length).toBe(downloadsBefore);
  });

  test('duplicate-run protection is per workflow', async () => {
    const f = world();
    await connectBox(BRIDGE, f);
    const a = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'spotlight' }), f);
    const again = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'spotlight' }), f);
    const other = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'lifestyle' }), f);
    expect(again.id).toBe(a.id);
    expect(other.id).not.toBe(a.id);
  });

  test('api mode sends the chosen workflow and product node in /batch/execute', async () => {
    const API = {
      ...base, FFCPE_MODE: 'api', FFCPE_API_BASE: 'https://ffcpe.example/v1', FFCPE_CLIENT_ID: 'c', FFCPE_CLIENT_SECRET: 's', FFCPE_IMS_ORG_ID: 'O@AdobeOrg',
    };
    const f = world([
      ['POST', 'https://ims-na1.adobelogin.com/ims/token/v3', () => ({ json: { access_token: 'svc', expires_in: 86400 } })],
      ['POST', 'https://ffcpe.example/v1/batch/execute', () => ({ status: 202, json: { batchId: 'b-api' } })],
    ]);
    await connectBox(API, f);
    await jobs.submit(API, alice, body({ workflowKey: 'lifestyle' }), f);
    const exec = f.calls.find((c) => c.url.endsWith('/batch/execute'));
    expect(JSON.parse(exec.init.body).workflow).toMatchObject({ workflowId: 'wf-life', inputs: [[{ node_id: 'n-life-in' }]] });
  });
});
