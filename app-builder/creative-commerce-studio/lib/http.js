/**
 * Web action helpers: CORS restricted to configured origins, JSON responses,
 * typed errors that are safe to show to authors (never echo secrets/tokens).
 */

class AppError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function allowedOrigins(params) {
  return (params.ALLOWED_ORIGINS || 'https://da.live')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(params) {
  const origin = params.__ow_headers?.origin;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins(params).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function json(params, statusCode, body) {
  return { statusCode, headers: corsHeaders(params), body };
}

function errorResponse(params, err, logger = console) {
  if (err instanceof AppError) {
    return json(params, err.status, { error: { code: err.code, message: err.message, detail: err.detail } });
  }
  logger.error('unexpected error', err?.message);
  return json(params, 500, { error: { code: 'internal', message: 'Unexpected server error. Check the action logs.' } });
}

/**
 * Reads the JSON request fields. Web actions merge JSON body fields into params;
 * the action inputs are annotated `final: true` so a request cannot override
 * them, and only the known request keys are picked here.
 */
function readBody(params) {
  const {
    jobId, folderId, requestId, sku, productName, source, associationConfirmed,
    batchId, failure, uncertain, result, provider,
  } = params;
  return {
    jobId, folderId, requestId, sku, productName, source, associationConfirmed, batchId, failure, uncertain, result, provider,
  };
}

/**
 * Drops unresolved manifest placeholders ("$NAME" when a .env line is missing)
 * so built-in defaults apply instead of a literal "$NAME".
 */
function cleanParams(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (typeof v === 'string' && /^\$[A-Z][A-Z0-9_]*$/.test(v)) return;
    if (v === '') return;
    out[k] = v;
  });
  return out;
}

/**
 * Wraps an action handler with CORS preflight, origin check and error handling.
 * handler(params, body) -> body object
 */
function webAction(handler) {
  return async function main(rawParams) {
    const params = cleanParams(rawParams);
    const method = (params.__ow_method || 'post').toLowerCase();
    if (method === 'options') return { statusCode: 204, headers: corsHeaders(params) };
    try {
      const origin = params.__ow_headers?.origin;
      if (origin && !allowedOrigins(params).includes(origin)) {
        throw new AppError(403, 'origin-not-allowed', 'This origin is not allowed to call Creative Commerce Studio.');
      }
      if (method !== 'post') throw new AppError(405, 'method-not-allowed', 'Use POST.');
      const result = await handler(params, readBody(params));
      return json(params, 200, result);
    } catch (err) {
      return errorResponse(params, err);
    }
  };
}

module.exports = {
  AppError, webAction, cleanParams, json, corsHeaders, allowedOrigins, readBody,
};
