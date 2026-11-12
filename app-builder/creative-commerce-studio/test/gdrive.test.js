const crypto = require('crypto');
const h = require('./helpers');

jest.mock('@adobe/aio-lib-state', () => ({ init: async () => require('./helpers').stateMock }));
jest.mock('@adobe/aio-lib-files', () => ({ init: async () => require('./helpers').filesMock }));

const gdrive = require('../lib/gdrive');
const sources = require('../lib/sources');
const jobs = require('../lib/jobs');

const ROOT = 'root-folder-0000000001';
const SUB = 'sub-folder-0000000002';
const OTHER = 'other-folder-000000003';
const P = {
  ...h.PARAMS,
  GDRIVE_CLIENT_ID: 'g-client.apps.googleusercontent.com',
  GDRIVE_CLIENT_SECRET: 'g-secret',
  GDRIVE_REDIRECT_URI: 'https://ns.adobeioruntime.net/api/v1/web/creative-commerce-studio/gdrive-auth-callback',
  GDRIVE_ALLOWED_FOLDER_ID: ROOT,
  FFCPE_MODE: 'bridge',
  BRIDGE_TOKEN: 'x'.repeat(40),
  AEM_AUTHOR_URL: undefined,
  DELIVERY_MODE: 'public',
};
const alice = { id: 'alice', key: 'a'.repeat(32) };
const PNG = h.png(2400, 2400);
const OLD_PNG = h.png(1000, 1000);
const API = 'https://www.googleapis.com/drive/v3';

const ITEMS = {
  [ROOT]: { id: ROOT, name: 'Campaign masters', mimeType: 'application/vnd.google-apps.folder', parents: ['drive-root-x'] },
  [SUB]: { id: SUB, name: 'Spring', mimeType: 'application/vnd.google-apps.folder', parents: [ROOT] },
  [OTHER]: { id: OTHER, name: 'Private', mimeType: 'application/vnd.google-apps.folder', parents: ['drive-root-x'] },
  'drive-root-x': { id: 'drive-root-x', name: 'My Drive', mimeType: 'application/vnd.google-apps.folder', parents: [] },
  'file-bga200-000001': {
    id: 'file-bga200-000001', name: 'bga200.png', mimeType: 'image/png', size: String(PNG.length), headRevisionId: 'rev-head-000002', md5Checksum: 'abc', parents: [SUB], thumbnailLink: 'https://lh3.googleusercontent.com/thumb-1=s220',
  },
  'file-brief-0000001': { id: 'file-brief-0000001', name: 'brief.pdf', mimeType: 'application/pdf', size: '10', headRevisionId: 'rev-pdf-000001', parents: [ROOT] },
  'file-private-00001': { id: 'file-private-00001', name: 'secret.png', mimeType: 'image/png', size: '10', headRevisionId: 'rev-p-0000001', parents: [OTHER] },
};

function google(opts = {}) {
  const state = { codes: new Map(), tokens: new Set(), refreshes: 0, expireFirst: !!opts.expireFirst };
  const json = (o, status = 200) => ({ status, json: o });
  const authed = (init) => state.tokens.has((init.headers.Authorization || '').replace('Bearer ', ''));
  const f = h.router([
    ['POST', 'https://oauth2.googleapis.com/token', (u, init) => {
      const form = new URLSearchParams(init.body);
      expect(form.get('client_id')).toBe(P.GDRIVE_CLIENT_ID);
      expect(form.get('client_secret')).toBe(P.GDRIVE_CLIENT_SECRET);
      if (form.get('grant_type') === 'authorization_code') {
        const challenge = state.codes.get(form.get('code'));
        const ok = challenge && crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url') === challenge;
        if (!ok) return json({ error: 'invalid_grant' }, 400);
        const at = `ya29.at-${Math.random()}`; state.tokens.add(at);
        return json({ access_token: at, refresh_token: '1//refresh', expires_in: 3599, scope: gdrive.SCOPE });
      }
      state.refreshes += 1;
      const at = `ya29.refreshed-${Math.random()}`; state.tokens.add(at);
      return json({ access_token: at, expires_in: 3599, scope: gdrive.SCOPE }); // Google omits refresh_token here
    }],
    ['POST', 'https://oauth2.googleapis.com/revoke', () => json({})],
    ['GET', `${API}/about`, (u, init) => (authed(init) ? json({ user: { displayName: 'Alice', emailAddress: 'alice@gmail.com' } }) : json({}, 401))],
    ['GET', /\/drive\/v3\/files\?q=/, (u, init) => {
      if (!authed(init)) return json({}, 401);
      const q = decodeURIComponent(new URL(u).searchParams.get('q'));
      const parent = q.match(/'([^']+)' in parents/)[1];
      return json({ files: Object.values(ITEMS).filter((i) => (i.parents || []).includes(parent)) });
    }],
    ['GET', /\/drive\/v3\/files\/[^/?]+\/revisions\/[^/?]+\?alt=media/, (u, init) => (authed(init) ? { body: OLD_PNG } : json({}, 401))],
    ['GET', /\/drive\/v3\/files\/[^/?]+\?alt=media/, (u, init) => (authed(init) ? { body: PNG } : json({}, 401))],
    ['GET', /\/drive\/v3\/files\/[^/?]+\?fields=/, (u, init) => {
      if (state.expireFirst) { state.expireFirst = false; return json({}, 401); }
      if (!authed(init)) return json({}, 401);
      const id = decodeURIComponent(new URL(u).pathname.split('/').pop());
      return ITEMS[id] ? json(ITEMS[id]) : json({ error: { code: 404 } }, 404);
    }],
    ['GET', 'https://lh3.googleusercontent.com/', (u, init) => {
      expect(u).toMatch(/=s320$/);
      return authed(init) ? { body: Buffer.from([0xff, 0xd8, 0xff]), headers: { 'content-type': 'image/jpeg' } } : json({}, 401);
    }],
  ]);
  f.state = state;
  f.consent = (authorizeUrl) => {
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(P.GDRIVE_REDIRECT_URI);
    const code = `4/code-${Math.random()}`;
    state.codes.set(code, url.searchParams.get('code_challenge'));
    return { code, state: url.searchParams.get('state') };
  };
  return f;
}

async function connect(f) {
  const { authorizeUrl } = await gdrive.startAuth(P, alice);
  return gdrive.completeAuth(P, f.consent(authorizeUrl), f);
}

beforeEach(() => { h.reset(); });

describe('Google Drive sign-in', () => {
  test('PKCE + offline access; single-use state; tokens encrypted at rest', async () => {
    const f = google();
    const { authorizeUrl } = await gdrive.startAuth(P, alice);
    const cb = f.consent(authorizeUrl);
    expect(await gdrive.completeAuth(P, cb, f)).toMatchObject({ ok: true });
    expect(await gdrive.completeAuth(P, cb, f)).toMatchObject({ ok: false });
    expect([...h.stateData.values()].join(' ')).not.toMatch(/ya29|1\/\/refresh/);
    expect(await gdrive.status(P, alice)).toEqual({ connected: true, user: { name: 'Alice', login: 'alice@gmail.com' } });
    await gdrive.disconnect(P, alice, f);
    expect(f.calls.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true);
    expect(await gdrive.status(P, alice)).toMatchObject({ connected: false });
  });

  test('sources-status offers only configured providers', async () => {
    const both = await sources.statusAll(P, alice);
    expect(both.providers.map((p) => [p.id, p.configured])).toEqual([['box', true], ['gdrive', true]]);
    const boxOnly = await sources.statusAll({ ...P, GDRIVE_CLIENT_ID: undefined }, alice);
    expect(boxOnly.providers.find((p) => p.id === 'gdrive').configured).toBe(false);
    expect(() => sources.get({ ...P, GDRIVE_CLIENT_ID: undefined }, 'gdrive')).toThrow(/not set up/);
  });
});

describe('Google Drive browsing and download', () => {
  test('lists the allowed folder with versions, support flags and thumbnails; blocks other folders', async () => {
    const f = google();
    await connect(f);
    const root = await gdrive.listFolder(P, alice, null, f);
    expect(root.folder).toEqual({ id: ROOT, name: 'Campaign masters', parentId: null });
    expect(root.entries.map((e) => [e.type, e.name, e.supported ?? null])).toEqual([['folder', 'Spring', null], ['file', 'brief.pdf', false]]);
    const sub = await gdrive.listFolder(P, alice, SUB, f);
    expect(sub.folder.parentId).toBe(ROOT);
    expect(sub.entries[0]).toMatchObject({ id: 'file-bga200-000001', versionId: 'rev-head-000002', supported: true, thumbnail: expect.stringMatching(/^data:image\/jpeg;base64,/) });
    await expect(gdrive.listFolder(P, alice, OTHER, f)).rejects.toMatchObject({ code: 'gdrive-folder-not-allowed' });
  });

  test('downloads the exact revision (current or older) and refuses files outside the tree', async () => {
    const f = google();
    await connect(f);
    const cur = await gdrive.downloadVersion(P, alice, 'file-bga200-000001', 'rev-head-000002', f);
    expect(cur.bytes.equals(PNG)).toBe(true);
    const old = await gdrive.downloadVersion(P, alice, 'file-bga200-000001', 'rev-older-000001', f);
    expect(old.bytes.equals(OLD_PNG)).toBe(true);
    await expect(gdrive.downloadVersion(P, alice, 'file-private-00001', 'rev-p-0000001', f)).rejects.toMatchObject({ code: 'gdrive-folder-not-allowed' });
    await expect(gdrive.downloadVersion(P, alice, 'file-brief-0000001', 'rev-pdf-000001', f)).rejects.toMatchObject({ code: 'unsupported-source' });
  });

  test('refreshes once on 401 and keeps the original refresh token', async () => {
    const f = google({ expireFirst: true });
    await connect(f);
    await gdrive.listFolder(P, alice, null, f);
    expect(f.state.refreshes).toBe(1);
    const conn = JSON.parse([...h.stateData.entries()].find(([k]) => k.startsWith('gdrive.conn.'))[1]);
    const { decrypt } = require('../lib/crypto');
    const key = [...h.stateData.keys()].find((k) => k.startsWith('gdrive.conn.'));
    expect(decrypt(P, conn.sealed, key).refreshToken).toBe('1//refresh');
  });

  test('a production job can use a Google Drive file version', async () => {
    const f = google();
    await connect(f);
    const job = await jobs.submit(P, alice, {
      requestId: '11111111-2222-4333-8444-555555555555',
      sku: 'STIHL-BGA200',
      productName: 'BGA 200',
      source: { provider: 'gdrive', fileId: 'file-bga200-000001', versionId: 'rev-head-000002', name: 'bga200.png' },
      associationConfirmed: true,
    }, f);
    expect(job).toMatchObject({ status: 'queued', source: { provider: 'gdrive', fileId: 'file-bga200-000001', versionId: 'rev-head-000002', name: 'bga200.png' } });
    const tasks = (await jobs.bridgeNext(P)).tasks;
    expect(tasks[0]).toMatchObject({ type: 'submit', mimeType: 'image/png', sourceUrl: expect.stringMatching(/^https:\/\/files\.example\/ccs\//) });
  });
});
