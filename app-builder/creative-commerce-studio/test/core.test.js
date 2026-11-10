const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const { encrypt, decrypt } = require('../lib/crypto');
const { webAction } = require('../lib/http');
const auth = require('../lib/auth');
const ffcpe = require('../lib/ffcpe');
const { sniff } = require('../lib/image');

beforeEach(() => { h.reset(); auth._cache.clear(); });

describe('crypto', () => {
  test('round-trips and binds ciphertext to its key context', () => {
    const sealed = encrypt(h.PARAMS, { a: 1 }, 'box.conn.u1');
    expect(sealed).not.toContain('"a"');
    expect(decrypt(h.PARAMS, sealed, 'box.conn.u1')).toEqual({ a: 1 });
    expect(() => decrypt(h.PARAMS, sealed, 'box.conn.u2')).toThrow();
  });
  test('rejects a missing/short key', () => {
    expect(() => encrypt({ TOKEN_ENCRYPTION_KEY: 'c2hvcnQ=' }, {})).toThrow(/32 bytes/);
  });
});

describe('webAction', () => {
  const main = webAction(async () => ({ ok: true }));
  test('answers preflight with CORS only for allowed origins', async () => {
    const ok = await main({ ...h.PARAMS, __ow_method: 'options', __ow_headers: { origin: 'https://da.live' } });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers['Access-Control-Allow-Origin']).toBe('https://da.live');
    const bad = await main({ ...h.PARAMS, __ow_method: 'options', __ow_headers: { origin: 'https://evil.example' } });
    expect(bad.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
  test('rejects calls from other origins', async () => {
    const res = await main({ ...h.PARAMS, __ow_method: 'post', __ow_headers: { origin: 'https://evil.example' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('auth', () => {
  const token = h.jwt({ client_id: 'darkalley', user_id: 'U1@AdobeID', created_at: String(Date.now()), expires_in: '86400000' });
  const imsOk = () => h.router([['POST', 'https://ims-na1.adobelogin.com/ims/validate_token', () => ({ json: { valid: true, token: { user_id: 'U1@AdobeID' } } })]]);

  test('requires a bearer token', async () => {
    await expect(auth.authenticate({ ...h.PARAMS, __ow_headers: {} })).rejects.toMatchObject({ code: 'no-session' });
  });
  test('rejects tokens issued to other clients', async () => {
    const other = h.jwt({ client_id: 'someone-else', user_id: 'U1' });
    await expect(auth.authenticate({ ...h.PARAMS, __ow_headers: { authorization: `Bearer ${other}` } }, imsOk()))
      .rejects.toMatchObject({ code: 'invalid-session' });
  });
  test('validates with IMS and derives a stable user key', async () => {
    const f = imsOk();
    const user = await auth.authenticate({ ...h.PARAMS, __ow_headers: { authorization: `Bearer ${token}` } }, f);
    expect(user.id).toBe('U1@AdobeID');
    expect(user.key).toMatch(/^[0-9a-f]{32}$/);
    await auth.authenticate({ ...h.PARAMS, __ow_headers: { authorization: `Bearer ${token}` } }, f);
    expect(f.calls).toHaveLength(1); // cached
  });
  test('rejects tokens IMS reports as invalid', async () => {
    const f = h.router([['POST', 'https://ims-na1.adobelogin.com/', () => ({ json: { valid: false } })]]);
    await expect(auth.authenticate({ ...h.PARAMS, __ow_headers: { authorization: `Bearer ${token}` } }, f))
      .rejects.toMatchObject({ code: 'invalid-session' });
  });
});

describe('ffcpe contract helpers', () => {
  test('fills the execute template with JSON-escaped values', () => {
    const body = ffcpe.fillTemplate(h.PARAMS.FFCPE_EXECUTE_TEMPLATE, { workflowId: 'wf', sku: 'A"B', sourceUrl: 'https://x/y?a=1&b=2' });
    expect(body).toEqual({ workflowId: 'wf', inputs: [{ name: 'A"B', url: 'https://x/y?a=1&b=2' }] });
  });
  test('refuses unknown placeholders', () => {
    expect(() => ffcpe.fillTemplate('{"x":"{{nope}}"}', {})).toThrow(/unknown placeholder/);
  });
  test('maps desktop/mobile outputs by name and refuses ambiguity', () => {
    const body = { executions: [{ status: 'success', outputs: [{ name: 'BGA-desktop', url: 'https://o/1.png' }, { name: 'BGA-mobile', url: 'https://o/2.png' }] }] };
    const m = ffcpe.mapPlacements(h.PARAMS, body);
    expect(m.desktop.url).toBe('https://o/1.png');
    expect(m.mobile.url).toBe('https://o/2.png');
    expect(() => ffcpe.mapPlacements(h.PARAMS, { executions: [{ outputs: [{ name: 'a', url: 'https://o/a.png' }, { name: 'b', url: 'https://o/b.png' }] }] }))
      .toThrow(/desktop and mobile/);
  });
  test('interprets batch states', () => {
    expect(ffcpe.interpret({ status: 'running' }).state).toBe('processing');
    expect(ffcpe.interpret({ status: 'failed' }, { executions: [{ status: 'failed', error: { message: 'bad mask' } }] }))
      .toEqual({ state: 'render-failed', message: 'bad mask' });
    expect(ffcpe.interpret({ status: 'completed' }, { executions: [{ status: 'success' }] }).state).toBe('rendered');
  });
});

describe('image sniffing', () => {
  test('reads PNG size and rejects non-images', () => {
    expect(sniff(h.png(800, 1000))).toEqual({ type: 'image/png', width: 800, height: 1000 });
    expect(sniff(Buffer.from('%PDF-1.7'))).toBeNull();
  });
});
