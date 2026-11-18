/* Campaign Looks contract: fixed scene inputs, workflows.json, nested outputs, partial results. */
const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const box = require('../lib/box');
const jobs = require('../lib/jobs');
const workflows = require('../lib/workflows');
const scenes = require('../lib/scenes');
const ffcpe = require('../lib/ffcpe');
const { placementsFrom } = require('../lib/engines');
const { sniff } = require('../lib/image');

/** A minimal JPEG header (SOI + SOF0) with the given size: enough for sniffing. */
function jpeg(width, height) {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(0xffd8, 0);
  b.writeUInt16BE(0xffc0, 2);
  b.writeUInt16BE(17, 4);
  b[6] = 8;
  b.writeUInt16BE(height, 7);
  b.writeUInt16BE(width, 9);
  return b;
}

const LOOK = {
  key: 'look-workshop',
  label: 'Campaign Look: Workshop',
  workflowId: 'wf-looks',
  productNodeId: 'n-product',
  desktopNodeId: 'n-desk-out',
  mobileNodeId: 'n-mob-out',
  inputs: [
    { nodeId: 'n-desk-bg', file: 'looks/workshop/desktop-background.jpg', role: 'desktop-background' },
    { nodeId: 'n-desk-mask', file: 'looks/workshop/desktop-mask.png', role: 'desktop-mask' },
    { nodeId: 'n-mob-bg', file: 'looks/workshop/mobile-background.jpg', role: 'mobile-background' },
    { nodeId: 'n-mob-mask', file: 'looks/workshop/mobile-mask.png', role: 'mobile-mask' },
  ],
};
const SPOT = {
  key: 'spotlight', label: 'Product spotlight', workflowId: 'wf-spot', productNodeId: 'n-spot-in', desktopNodeId: 'n-spot-d', mobileNodeId: 'n-spot-m',
};

const base = {
  ...h.PARAMS,
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

function uploadConfig(list = [SPOT, LOOK]) {
  h.filesData.set(workflows.CONFIG_PATH, Buffer.from(JSON.stringify(list)));
}
function uploadScenes(overrides = {}) {
  const files = {
    'looks/workshop/desktop-background.jpg': jpeg(1200, 896),
    'looks/workshop/desktop-mask.png': h.png(1200, 896),
    'looks/workshop/mobile-background.jpg': jpeg(896, 1200),
    'looks/workshop/mobile-mask.png': h.png(896, 1200),
    ...overrides,
  };
  Object.entries(files).forEach(([p, b]) => { if (b) h.filesData.set(p, b); });
}

function world(extra = []) {
  return h.router([
    ['POST', 'https://api.box.com/oauth2/token', () => ({ json: { access_token: 'box-at', refresh_token: 'box-rt', expires_in: 3600 } })],
    ['GET', 'https://api.box.com/2.0/users/me', () => ({ json: { name: 'Alice' } })],
    ['GET', 'https://api.box.com/2.0/files/555?', () => ({ json: { id: '555', type: 'file', name: 'packshot.png', size: PNG.length, file_version: { id: '777' }, path_collection: { entries: [{ id: '0' }, { id: '100' }] } } })],
    ['GET', 'https://api.box.com/2.0/files/555/content', () => ({ body: PNG })],
    ['GET', 'https://out.example/d.jpg', () => ({ body: jpeg(1200, 896) })],
    ['GET', 'https://out.example/m.jpg', () => ({ body: jpeg(896, 1200) })],
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
    requestId: `21111111-2222-4333-8444-${String(seq).padStart(12, '0')}`,
    sku: 'DEMO-SKU-001',
    productName: 'Demo product',
    source: { provider: 'box', fileId: '555', versionId: '777', name: 'packshot.png' },
    associationConfirmed: true,
    ...extra,
  };
};

/** The observed MCP status shape: node_id on the output, the link one level down. */
const nested = (desktop = true, mobile = true, extra = []) => ({
  status: 'completed',
  outputs: [
    { node_id: 'n-desk-bg', status: 'completed', content: { presignedUrl: 'https://out.example/bg-echo.jpg', name: 'desktop-background.jpg' } },
    { node_id: 'n-cutout', status: 'completed', content: { presignedUrl: 'https://out.example/cut.png', mimeType: 'image/png' } },
    ...(desktop ? [{ node_id: 'n-desk-out', status: 'completed', content: { presignedUrl: 'https://out.example/d.jpg', mimeType: 'image/jpeg', name: 'd.jpg' } }] : []),
    ...(mobile ? [{ node_id: 'n-mob-out', status: 'completed', content: [{ presignedUrl: 'https://out.example/m.jpg', mimeType: 'image/jpeg', name: 'm.jpg' }] }] : []),
    ...extra,
  ],
});

beforeEach(() => { h.reset(); ffcpe._reset(); });

describe('workflows.json and scene inputs', () => {
  test('an uploaded workflows.json is used; FFCPE_WORKFLOWS in .env still wins', async () => {
    uploadConfig();
    expect((await workflows.list(base)).map((w) => w.key)).toEqual(['spotlight', 'look-workshop']);
    expect((await workflows.list({ ...base, FFCPE_WORKFLOWS: JSON.stringify([SPOT]) })).map((w) => w.key)).toEqual(['spotlight']);
    const look = await workflows.resolve(base, 'look-workshop');
    expect(look.inputs).toHaveLength(4);
    expect(look.inputs[1]).toEqual({ nodeId: 'n-desk-mask', file: 'looks/workshop/desktop-mask.png', role: 'desktop-mask' });
    const pub = await workflows.publicList(base);
    expect(JSON.stringify(pub)).not.toMatch(/looks\/|n-desk|wf-looks/);
  });

  test('rejects unsafe paths, reused nodes and unknown roles with readable errors', () => {
    const bad = (inputs) => () => workflows.parse([{ ...LOOK, inputs }], 'workflows.json');
    expect(bad([{ nodeId: 'x', file: 'public/bg.jpg' }])).toThrow(/under looks\//);
    expect(bad([{ nodeId: 'x', file: 'looks/../config/workflows.json' }])).toThrow(/under looks\//);
    expect(bad([{ nodeId: 'x', file: 'looks/a.gif' }])).toThrow(/PNG or JPEG/);
    expect(bad([{ nodeId: 'n-product', file: 'looks/a.png' }])).toThrow(/used twice \(or is the product input\)/);
    expect(bad([{ nodeId: 'x', file: 'looks/a.png' }, { nodeId: 'x', file: 'looks/b.png' }])).toThrow(/used twice/);
    expect(bad([{ nodeId: 'x', file: 'looks/a.png', role: 'sky' }])).toThrow(/"role" must be one of/);
    expect(bad([{ nodeId: 'x', file: 'looks/a.png', width: '1200' }])).toThrow(/whole number/);
    expect(() => workflows.parse('{', 'workflows.json')).toThrow(/workflows.json: is not valid JSON/);
  });

  test('scene checks: masks must be PNG and match their background size', () => {
    const item = (file, role, buf, extra = {}) => ({
      file, role, kind: sniff(buf), ...extra,
    });
    expect(scenes.check([
      item('looks/w/db.jpg', 'desktop-background', jpeg(1200, 896)),
      item('looks/w/dm.png', 'desktop-mask', h.png(1200, 896)),
    ])).toEqual([]);
    const problems = scenes.check([
      item('looks/w/db.jpg', 'desktop-background', jpeg(1200, 896)),
      item('looks/w/dm.jpg', 'desktop-mask', jpeg(1200, 896)),
      item('looks/w/mb.jpg', 'mobile-background', jpeg(896, 1200), { width: 900 }),
      item('looks/w/mm.png', 'mobile-mask', h.png(1200, 896)),
      { file: 'looks/w/x.png', role: 'other', kind: null },
    ], 'Workshop');
    expect(problems.join('\n')).toMatch(/dm\.jpg \(Workshop\) is a placement mask and must be a PNG/);
    expect(problems.join('\n')).toMatch(/mb\.jpg \(Workshop\) is 896×1200; the configuration expects width 900/);
    expect(problems.join('\n')).toMatch(/mobile mask looks\/w\/mm\.png is 1200×896 but its background looks\/w\/mb\.jpg is 896×1200/);
    expect(problems.join('\n')).toMatch(/x\.png \(Workshop\) is not a readable PNG or JPEG/);
  });

  test('scene checks: a renamed file whose extension does not match its real type is flagged', () => {
    const problems = scenes.check([
      { file: 'looks/p/p-desktop-background.jpg', role: 'desktop-background', kind: sniff(h.png(1200, 896)) },
      { file: 'looks/p/p-desktop-mask.png', role: 'desktop-mask', kind: sniff(jpeg(1200, 896)) },
    ]);
    expect(problems).toEqual([
      expect.stringMatching(/p-desktop-background\.jpg is actually a PNG image\. Give it a \.png name, or convert it \(for example: sips -s format jpeg/),
      expect.stringMatching(/p-desktop-mask\.png is actually a JPEG image\. Give it a \.jpg name/),
    ]);
  });
});

describe('runs with scene inputs', () => {
  test('missing or invalid scene images are refused before any download or job', async () => {
    uploadConfig();
    const f = world();
    await connectBox(BRIDGE, f);
    await expect(jobs.submit(BRIDGE, alice, body({ workflowKey: 'look-workshop' }), f))
      .rejects.toMatchObject({ code: 'scenes-missing', message: expect.stringMatching(/desktop-background\.jpg.*npm run workflows:upload/) });
    uploadScenes({ 'looks/workshop/mobile-mask.png': h.png(1200, 896) });
    await expect(jobs.submit(BRIDGE, alice, body({ workflowKey: 'look-workshop' }), f))
      .rejects.toMatchObject({ code: 'scenes-invalid', message: expect.stringMatching(/mobile mask/) });
    expect(f.calls.some((c) => c.url.includes('/content'))).toBe(false);
    expect((await jobs.recent(alice)).jobs).toEqual([]);
  });

  test('bridge: the task carries all five inputs; an older bridge is refused with a clear message', async () => {
    uploadConfig();
    uploadScenes();
    const f = world();
    await connectBox(BRIDGE, f);
    const old = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'look-workshop' }), f);
    expect((await jobs.bridgeNext(BRIDGE, {})).tasks).toEqual([]);
    expect(await jobs.status(BRIDGE, alice, old.id, f)).toMatchObject({ status: 'render-failed', message: expect.stringMatching(/bridge is out of date/) });

    const job = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'look-workshop' }), f);
    expect(job.recipe).toMatchObject({ workflowKey: 'look-workshop', workflowId: 'wf-looks' });
    const [task] = (await jobs.bridgeNext(BRIDGE, { capabilities: ['multi-input'] })).tasks;
    expect(task.inputs.map((i) => i.nodeId)).toEqual(['n-product', 'n-desk-bg', 'n-desk-mask', 'n-mob-bg', 'n-mob-mask']);
    expect(task.inputs[0].url).toMatch(/^https:\/\/files\.example\/ccs\/.+\/source\.png/);
    expect(task.inputs[2]).toEqual({
      nodeId: 'n-desk-mask', url: 'https://files.example/looks/workshop/desktop-mask.png?sig=abc', name: 'desktop-mask.png', mimeType: 'image/png',
    });
    expect(task.inputs[1].mimeType).toBe('image/jpeg');
  });

  test('bridge: results are matched by composite node even when the link is nested under the output', async () => {
    uploadConfig();
    uploadScenes();
    const f = world();
    await connectBox(BRIDGE, f);
    const job = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'look-workshop' }), f);
    await jobs.bridgeNext(BRIDGE, { capabilities: ['multi-input'] });
    await jobs.bridgeReport(BRIDGE, { jobId: job.id, batchId: 'b-1' });
    await jobs.bridgeReport(BRIDGE, { jobId: job.id, result: nested() }, f);
    const done = await jobs.status(BRIDGE, alice, job.id, f);
    expect(done.status).toBe('ready-for-review');
    expect(done.outputs.desktop).toMatchObject({ width: 1200, height: 896 });
    expect(done.outputs.mobile).toMatchObject({ width: 896, height: 1200 });
    expect(done.channels).toEqual({ desktop: { ok: true }, mobile: { ok: true } });
    expect(f.calls.some((c) => c.url.includes('bg-echo') || c.url.includes('cut.png'))).toBe(false);
  });

  test('partial result: the desktop image is kept, the mobile failure is reported, accept is refused', async () => {
    uploadConfig();
    uploadScenes();
    const f = world();
    await connectBox(BRIDGE, f);
    const job = await jobs.submit(BRIDGE, alice, body({ workflowKey: 'look-workshop' }), f);
    await jobs.bridgeNext(BRIDGE, { capabilities: ['multi-input'] });
    await jobs.bridgeReport(BRIDGE, { jobId: job.id, batchId: 'b-1' });
    const result = nested(true, false, [{ node_id: 'n-mob-out', status: 'failed', error: { message: 'Composite returned HTTP 500' } }]);
    result.status = 'failed';
    await jobs.bridgeReport(BRIDGE, { jobId: job.id, result }, f);
    const v = await jobs.status(BRIDGE, alice, job.id, f);
    expect(v.status).toBe('render-failed');
    expect(v.message).toBe('The mobile composite failed: Composite returned HTTP 500. The desktop image was kept.');
    expect(v.channels).toEqual({ desktop: { ok: true }, mobile: { ok: false, message: 'Composite returned HTTP 500' } });
    expect(v.outputs.desktop.previewUrl).toMatch(/desktop\.jpg/);
    expect(v.outputs.mobile).toBeUndefined();
    await expect(jobs.accept(BRIDGE, alice, job.id, f)).rejects.toMatchObject({ code: 'not-reviewable' });
  });

  test('MCP and API engines send all five inputs in their own request shapes', async () => {
    uploadConfig();
    uploadScenes();
    const API = {
      ...base, FFCPE_MODE: 'api', FFCPE_API_BASE: 'https://ffcpe.example/v1', FFCPE_CLIENT_ID: 'c', FFCPE_CLIENT_SECRET: 's', FFCPE_IMS_ORG_ID: 'O@AdobeOrg',
    };
    const f = world([
      ['POST', 'https://ims-na1.adobelogin.com/ims/token/v3', () => ({ json: { access_token: 'svc', expires_in: 86400 } })],
      ['POST', 'https://ffcpe.example/v1/batch/execute', () => ({ status: 202, json: { batchId: 'b-api' } })],
    ]);
    await connectBox(API, f);
    await jobs.submit(API, alice, body({ workflowKey: 'look-workshop' }), f);
    const sent = JSON.parse(f.calls.find((c) => c.url.endsWith('/batch/execute')).init.body);
    expect(sent.workflow).toEqual({ workflowId: 'wf-looks' });
    expect(sent.inputs.map((i) => i.node_id)).toEqual(['n-product', 'n-desk-bg', 'n-desk-mask', 'n-mob-bg', 'n-mob-mask']);
    expect(sent.inputs[3]).toEqual({ node_id: 'n-mob-bg', content: [{ sourceUrl: 'https://files.example/looks/workshop/mobile-background.jpg?sig=abc', name: 'mobile-background.jpg' }] });

    // FFCPE_EXECUTE_TEMPLATE can't express scene inputs: refused clearly.
    h.reset();
    uploadConfig();
    uploadScenes();
    const T = { ...API, FFCPE_EXECUTE_TEMPLATE: '{"workflowId":"{{workflowId}}"}' };
    await connectBox(T, f);
    const job = await jobs.submit(T, alice, body({ workflowKey: 'look-workshop' }), f);
    expect(job).toMatchObject({ status: 'render-failed', message: expect.stringMatching(/only supports workflows with the product photo/) });
  });
});

test('MCP submit shape: one entry per node with { type: "image", url } content', () => {
  // eslint-disable-next-line global-require
  const { mcpInputs } = require('../lib/engines');
  expect(mcpInputs([
    {
      nodeId: 'n-product', url: 'https://f/p.png', name: 'p.png', mimeType: 'image/png',
    },
    {
      nodeId: 'n-desk-mask', url: 'https://f/m.png', name: 'm.png', mimeType: 'image/png',
    },
  ])).toEqual([
    { node_id: 'n-product', content: [{ type: 'image', url: 'https://f/p.png', name: 'p.png', mimeType: 'image/png' }] },
    { node_id: 'n-desk-mask', content: [{ type: 'image', url: 'https://f/m.png', name: 'm.png', mimeType: 'image/png' }] },
  ]);
});

describe('output matching', () => {
  const params = { FFCPE_PRODUCT_NODE_ID: 'n-product', FFCPE_DESKTOP_NODE_ID: 'n-desk-out', FFCPE_MOBILE_NODE_ID: 'n-mob-out' };

  test('nested content (object or list) is matched to its output node; echoed inputs are ignored', () => {
    const r = placementsFrom(params, nested());
    expect(r.state).toBe('rendered');
    expect(r.placements.desktop).toMatchObject({ nodeId: 'n-desk-out', url: 'https://out.example/d.jpg' });
    expect(r.placements.mobile).toMatchObject({ nodeId: 'n-mob-out', url: 'https://out.example/m.jpg', mimeType: 'image/jpeg' });
  });

  test('a failed batch with no outputs reports the service error', () => {
    const r = placementsFrom(params, { status: 'failed', executions: [{ status: 'failed', error: { message: 'Quota exceeded' } }] }, { failed: true });
    expect(r).toMatchObject({ state: 'render-failed', message: 'Quota exceeded', placements: {} });
  });
});
