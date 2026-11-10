/* Test doubles: in-memory App Builder State/Files and a tiny fetch router. */

const stateData = new Map();
const filesData = new Map();

const stateMock = {
  get: async (k) => (stateData.has(k) ? { value: stateData.get(k) } : undefined),
  put: async (k, v) => {
    if (!/^[a-zA-Z0-9-_.]{1,1024}$/.test(k)) throw new Error(`invalid state key ${k}`);
    stateData.set(k, v);
  },
  delete: async (k) => { stateData.delete(k); },
};

const filesMock = {
  write: async (p, b) => { filesData.set(p, Buffer.from(b)); },
  read: async (p) => filesData.get(p),
  generatePresignURL: async (p) => `https://files.example/${p}?sig=abc`,
};

function reset() {
  stateData.clear();
  filesData.clear();
}

/** routes: [[method, urlPrefixOrRegex, handler(url, init) => {status, json|body|headers}]] */
function router(routes) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ method, url, init });
    const route = routes.find(([m, match]) => m === method
      && (match instanceof RegExp ? match.test(url) : url.startsWith(match)));
    if (!route) throw new Error(`unrouted ${method} ${url}`);
    const r = await route[2](url, init);
    if (r instanceof Error) throw r;
    const body = r.json !== undefined ? JSON.stringify(r.json) : r.body;
    return new Response(body ?? null, { status: r.status || 200, headers: r.headers });
  };
  fn.calls = calls;
  return fn;
}

/** A 1x1 PNG with a custom width/height header (enough for sniffing). */
function png(width = 1600, height = 900) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const PARAMS = {
  ALLOWED_ORIGINS: 'https://da.live,https://main--site--org.aem.page',
  IMS_ALLOWED_CLIENT_IDS: 'darkalley',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  BOX_CLIENT_ID: 'box-client',
  BOX_CLIENT_SECRET: 'box-secret',
  BOX_REDIRECT_URI: 'https://ns.adobeioruntime.net/api/v1/web/creative-commerce-studio/box-auth-callback',
  BOX_ALLOWED_FOLDER_ID: '100',
  FFCPE_API_BASE: 'https://ffcpe.example/v1',
  FFCPE_WORKFLOW_ID: 'wf-1',
  FFCPE_CLIENT_ID: 'ff-client',
  FFCPE_CLIENT_SECRET: 'ff-secret',
  FFCPE_EXECUTE_TEMPLATE: '{"workflowId":"{{workflowId}}","inputs":[{"name":"{{sku}}","url":"{{sourceUrl}}"}]}',
  FFCPE_OUTPUT_MATCH: '{"desktop":"desktop","mobile":"mobile"}',
  AEM_AUTHOR_URL: 'https://author-p1-e2.adobeaemcloud.com',
  AEM_DELIVERY_URL: 'https://delivery-p1-e2.adobeaemcloud.com',
  AEM_CLIENT_ID: 'aem-client',
  AEM_CLIENT_SECRET: 'aem-secret',
  AEM_SCOPES: 'aem.assets.author',
};

function jwt(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256' })}.${enc(claims)}.sig`;
}

module.exports = {
  stateMock, filesMock, stateData, filesData, reset, router, png, PARAMS, jwt,
};
