/* workflows:upload validation (runs on the operator's computer before anything is uploaded). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./helpers');
const { plan } = require('../scripts/workflows-upload');

const LOOK = {
  key: 'look-workshop',
  label: 'Campaign Look: Workshop',
  workflowId: 'wf',
  productNodeId: 'p',
  desktopNodeId: 'd',
  mobileNodeId: 'm',
  inputs: [
    { nodeId: 'db', file: 'looks/workshop/desktop-background.png', role: 'desktop-background' },
    { nodeId: 'dm', file: 'looks/workshop/desktop-mask.png', role: 'desktop-mask' },
  ],
};

const made = [];
afterAll(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function folder(list, images = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-upload-'));
  made.push(dir);
  if (list) fs.writeFileSync(path.join(dir, 'workflows.json'), typeof list === 'string' ? list : JSON.stringify(list));
  Object.entries(images).forEach(([file, bytes]) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), bytes);
  });
  return dir;
}

test('passes a valid list and collects each scene image once', () => {
  const dir = folder([LOOK, { ...LOOK, key: 'look-copy' }], {
    'looks/workshop/desktop-background.png': h.png(1200, 896),
    'looks/workshop/desktop-mask.png': h.png(1200, 896),
  });
  const p = plan(dir, {});
  expect(p.problems).toEqual([]);
  expect(p.entries.map((e) => e.key)).toEqual(['look-workshop', 'look-copy']);
  expect(p.files.map((f) => f.file)).toEqual(['looks/workshop/desktop-background.png', 'looks/workshop/desktop-mask.png']);
});

test('reports missing files, size mismatches, bad JSON and the FFCPE_WORKFLOWS override', () => {
  const dir = folder([LOOK], { 'looks/workshop/desktop-background.png': h.png(1200, 896) });
  expect(plan(dir, {}).problems).toEqual(['looks/workshop/desktop-mask.png (Campaign Look: Workshop) is not in the backend folder.']);

  const dir2 = folder([LOOK], {
    'looks/workshop/desktop-background.png': h.png(1200, 896),
    'looks/workshop/desktop-mask.png': h.png(896, 1200),
  });
  expect(plan(dir2, {}).problems.join(' ')).toMatch(/desktop mask .* is 896×1200 but its background .* is 1200×896/);

  expect(plan(folder('[{'), {}).problems.join(' ')).toMatch(/workflows.json: is not valid JSON/);
  expect(plan(folder(null), {}).problems.join(' ')).toMatch(/not found/);
  expect(plan(dir, { FFCPE_WORKFLOWS: '[...]' }).notes.join(' ')).toMatch(/takes precedence/);
});

test('the shipped workflows.json files are valid', () => {
  // eslint-disable-next-line global-require
  const workflows = require('../lib/workflows');
  ['workflows.json', 'workflows.example.json'].forEach((name) => {
    const file = path.join(__dirname, '..', name);
    if (!fs.existsSync(file)) return;
    expect(() => workflows.parse(fs.readFileSync(file, 'utf8'), name)).not.toThrow();
  });
});
