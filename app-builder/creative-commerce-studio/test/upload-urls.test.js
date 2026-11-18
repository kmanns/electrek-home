/* Uploading the workflow list and scene images through the backend (no local storage credentials). */
const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const action = require('../actions/workflows-upload-urls/index');
const { route, uploadViaBackend } = require('../scripts/workflows-upload');

const BRIDGE_TOKEN = 'b'.repeat(40);
const ADMIN_TOKEN = 'a'.repeat(40);
const call = (params, files, token) => action.main({
  ...h.PARAMS, ...params, files, __ow_method: 'post', __ow_headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe('workflows-upload-urls action', () => {
  test('bridge mode: BRIDGE_TOKEN gets 10-minute write links for allowed paths', async () => {
    const spy = jest.spyOn(h.filesMock, 'generatePresignURL');
    const res = await call({ FFCPE_MODE: 'bridge', BRIDGE_TOKEN }, ['looks/workshop/workshop-desktop-mask.png', 'config/workflows.json'], BRIDGE_TOKEN);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body.links)).toEqual(['looks/workshop/workshop-desktop-mask.png', 'config/workflows.json']);
    expect(spy).toHaveBeenCalledWith('looks/workshop/workshop-desktop-mask.png', { expiryInSeconds: 600, permissions: 'w' });
    spy.mockRestore();
  });

  test('ADMIN_TOKEN works in any mode; BRIDGE_TOKEN only in bridge mode; wrong or missing tokens are refused', async () => {
    expect((await call({ FFCPE_MODE: 'api', ADMIN_TOKEN }, ['config/workflows.json'], ADMIN_TOKEN)).statusCode).toBe(200);
    expect((await call({ FFCPE_MODE: 'api', ADMIN_TOKEN, BRIDGE_TOKEN }, ['config/workflows.json'], BRIDGE_TOKEN)).statusCode).toBe(401);
    expect((await call({ FFCPE_MODE: 'bridge', BRIDGE_TOKEN }, ['config/workflows.json'], 'x'.repeat(40))).statusCode).toBe(401);
    expect((await call({ FFCPE_MODE: 'bridge', BRIDGE_TOKEN }, ['config/workflows.json'])).statusCode).toBe(401);
    const none = await call({ FFCPE_MODE: 'api' }, ['config/workflows.json'], ADMIN_TOKEN);
    expect(none.statusCode).toBe(500);
    expect(none.body.error.message).toMatch(/Set ADMIN_TOKEN/);
  });

  test('only the workflow list and looks/ images can be uploaded', async () => {
    const P = { FFCPE_MODE: 'bridge', BRIDGE_TOKEN };
    for (const bad of [['public/x.png'], ['ccs/job/desktop.jpg'], ['looks/../config/workflows.json'], ['looks/a.gif'], []]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call(P, bad, BRIDGE_TOKEN);
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('upload command routing', () => {
  test('uses the backend when its URL and a token are set, unless --direct', () => {
    const env = { CCS_BACKEND_URL: 'https://ns.adobeioruntime.net/api/v1/web/ccs', BRIDGE_TOKEN };
    expect(route(env, [])).toBe('backend');
    expect(route({ ...env, BRIDGE_TOKEN: undefined, ADMIN_TOKEN }, [])).toBe('backend');
    expect(route(env, ['--direct'])).toBe('direct');
    expect(route({ BRIDGE_TOKEN }, [])).toBe('direct');
    expect(route({ CCS_BACKEND_URL: env.CCS_BACKEND_URL, BRIDGE_TOKEN: 'short' }, [])).toBe('direct');
  });

  test('PUTs every scene image, then the list last, to the links the backend returns', async () => {
    const p = {
      entries: [{ key: 'a' }],
      text: '[{"key":"a"}]',
      files: [{ file: 'looks/w/w-desktop-mask.png', bytes: h.png(10, 10) }, { file: 'looks/w/w-desktop-background.jpg', bytes: Buffer.from([0xff, 0xd8]) }],
    };
    const puts = [];
    const f = h.router([
      ['POST', 'https://be.example/workflows-upload-urls', (u, init) => {
        expect(init.headers.Authorization).toBe(`Bearer ${BRIDGE_TOKEN}`);
        const { files } = JSON.parse(init.body);
        return { json: { links: Object.fromEntries(files.map((x) => [x, `https://blob.example/${x}?sig=w`])) } };
      }],
      ['PUT', 'https://blob.example/', (u, init) => { puts.push([u.split('?')[0], init.headers['Content-Type'], init.headers['x-ms-blob-type']]); return { status: 201 }; }],
    ]);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await uploadViaBackend(p, { CCS_BACKEND_URL: 'https://be.example/', BRIDGE_TOKEN }, f);
    log.mockRestore();
    expect(puts).toEqual([
      ['https://blob.example/looks/w/w-desktop-mask.png', 'image/png', 'BlockBlob'],
      ['https://blob.example/looks/w/w-desktop-background.jpg', 'image/jpeg', 'BlockBlob'],
      ['https://blob.example/config/workflows.json', 'application/json', 'BlockBlob'],
    ]);
  });

  test('explains a backend without the new action (not yet deployed)', async () => {
    const f = h.router([['POST', 'https://be.example/workflows-upload-urls', () => ({ status: 404, json: { error: { message: 'not found' } } })]]);
    await expect(uploadViaBackend({ entries: [], text: '[]', files: [] }, { CCS_BACKEND_URL: 'https://be.example', BRIDGE_TOKEN }, f))
      .rejects.toThrow(/aio app deploy --force-deploy/);
  });
});
