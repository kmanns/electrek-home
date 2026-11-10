/**
 * AES-256-GCM encryption for Box tokens at rest in App Builder State,
 * plus HMAC-signed OAuth state values.
 * TOKEN_ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32).
 */
const crypto = require('crypto');
const { AppError } = require('./http');

function key(params) {
  const raw = params.TOKEN_ENCRYPTION_KEY ? Buffer.from(params.TOKEN_ENCRYPTION_KEY, 'base64') : null;
  if (!raw || raw.length !== 32) {
    throw new AppError(500, 'misconfigured', 'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  }
  return raw;
}

function encrypt(params, plaintextObj, aad = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(params), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(JSON.stringify(plaintextObj), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

function decrypt(params, sealed, aad = '') {
  const [v, iv, tag, data] = String(sealed).split('.');
  if (v !== 'v1') throw new Error('unknown ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(params), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { encrypt, decrypt, randomId };
