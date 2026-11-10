/*
 * box-auth-callback: Box OAuth redirect target (BOX_REDIRECT_URI).
 * Not IMS-authenticated (it is a browser redirect from Box); the one-time
 * `state` binds the result to the author who started the flow.
 * Responds with a tiny page that notifies the plugin window and closes.
 */
const box = require('../../lib/box');
const { allowedOrigins } = require('../../lib/http');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function page(params, ok, message) {
  const origins = JSON.stringify(allowedOrigins(params).filter((o) => o !== 'https://da.live'));
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Box connection</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:15px system-ui,sans-serif;margin:40px;color:#16181d}</style></head>
<body><h1>${ok ? 'Box connected' : 'Box connection failed'}</h1><p>${escapeHtml(message)}</p>
<script>
(function(){var o=window.opener;var origins=${origins};
if(o){origins.forEach(function(t){try{o.postMessage({type:'ccs-box-auth',ok:${ok ? 'true' : 'false'}},t);}catch(e){}});}
${ok ? 'setTimeout(function(){window.close();},800);' : ''}})();
</script></body></html>`;
  return {
    statusCode: ok ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    },
    body: html,
  };
}

exports.main = async function main(params) {
  try {
    const result = await box.completeAuth(params, {
      code: params.code, state: params.state, error: params.error,
    });
    return page(params, result.ok, result.message);
  } catch (e) {
    return page(params, false, e.code === 'misconfigured' ? e.message : 'Box sign-in failed. Close this window and try again.');
  }
};
