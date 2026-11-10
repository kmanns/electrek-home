/**
 * Thin wrappers over App Builder State (aio-lib-state) and Files (aio-lib-files).
 * State keys must match /^[a-zA-Z0-9-_.]{1,1024}$/; values are JSON strings.
 */
const DAY = 86400;

let statePromise;
let filesPromise;

function getState() {
  if (!statePromise) statePromise = require('@adobe/aio-lib-state').init();
  return statePromise;
}

function getFiles() {
  if (!filesPromise) filesPromise = require('@adobe/aio-lib-files').init();
  return filesPromise;
}

async function getJSON(key) {
  const state = await getState();
  const res = await state.get(key);
  if (!res?.value) return null;
  try { return JSON.parse(res.value); } catch (e) { return null; }
}

async function putJSON(key, value, ttlDays = 30) {
  const state = await getState();
  await state.put(key, JSON.stringify(value), { ttl: Math.round(ttlDays * DAY) });
}

async function del(key) {
  const state = await getState();
  await state.delete(key);
}

module.exports = {
  getState, getFiles, getJSON, putJSON, del, DAY,
};
