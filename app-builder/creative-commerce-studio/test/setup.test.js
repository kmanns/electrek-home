/* Setup check: configured state only, never secrets or node IDs. */
const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const setup = require('../lib/setup');
const workflows = require('../lib/workflows');

const alice = { id: 'alice', key: 'a'.repeat(32) };
const LOOK = {
  key: 'look-w',
  label: 'Campaign Look: Workshop',
  workflowId: 'wf-secret-id',
  productNodeId: 'n-prod',
  desktopNodeId: 'n-d',
  mobileNodeId: 'n-m',
  inputs: [
    { nodeId: 'n-bg', file: 'looks/w/w-desktop-background.jpg', role: 'desktop-background' },
    { nodeId: 'n-mask', file: 'looks/w/w-desktop-mask.png', role: 'desktop-mask' },
  ],
};

beforeEach(() => h.reset());

test('reports sources, Firefly mode, workflows and delivery without secrets or node IDs', async () => {
  h.filesData.set(workflows.CONFIG_PATH, Buffer.from(JSON.stringify([LOOK])));
  h.filesData.set('looks/w/w-desktop-background.jpg', Buffer.from([1]));
  const params = {
    ...h.PARAMS, FFCPE_MODE: 'bridge', BRIDGE_TOKEN: 'x'.repeat(40), DELIVERY_MODE: 'public', AEM_AUTHOR_URL: undefined,
  };
  const s = await setup.status(params, alice);
  expect(s.encryptionKey).toBe(true);
  expect(s.sources).toEqual([
    {
      id: 'box', label: 'Box', configured: true, connected: false,
    },
    {
      id: 'gdrive', label: 'Google Drive', configured: false, connected: false,
    },
  ]);
  expect(s.firefly).toEqual({
    mode: 'bridge', connected: false, bridgeOnline: false, error: null,
  });
  expect(s.workflows).toEqual({
    source: 'uploaded', count: 1, labels: ['Campaign Look: Workshop'], error: null, scenesMissing: [{ workflow: 'Campaign Look: Workshop', count: 1 }],
  });
  expect(s.delivery).toEqual({ mode: 'public', error: null });
  const text = JSON.stringify(s);
  expect(text).not.toMatch(/wf-secret-id|n-prod|n-bg|box-secret|looks\/|x{40}/);
});

test('flags a bad encryption key, a broken workflow list and a bad delivery mode', async () => {
  const s = await setup.status({
    ...h.PARAMS, TOKEN_ENCRYPTION_KEY: 'short', FFCPE_WORKFLOWS: '[{bad', DELIVERY_MODE: 'ftp',
  }, alice);
  expect(s.encryptionKey).toBe(false);
  expect(s.workflows).toMatchObject({ source: 'env', count: 0, error: expect.stringMatching(/not valid JSON/) });
  expect(s.delivery).toEqual({ mode: null, error: expect.stringMatching(/DELIVERY_MODE must be aem or public/) });
});

test('single-workflow and unconfigured installs', async () => {
  expect((await setup.status({ ...h.PARAMS }, alice)).workflows).toMatchObject({ source: 'single', count: 1 });
  const none = await setup.status({ ...h.PARAMS, FFCPE_WORKFLOW_ID: undefined }, alice);
  expect(none.workflows).toMatchObject({ source: 'none', count: 0, error: null });
});
