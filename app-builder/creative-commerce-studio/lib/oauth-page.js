/**
 * Shared OAuth callback page: notifies the plugin window (explicit target
 * origins only, never "*") and closes itself on success.
 */
const { allowedOrigins } = require('./http');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function callbackPage(params, { provider, title, ok, message }) {
  const origins = JSON.stringify(allowedOrigins(params).filter((o) => o !== 'https://da.live'));
  const payload = JSON.stringify({ type: 'ccs-auth', provider, ok: !!ok });
  const legacy = provider === 'box' ? JSON.stringify({ type: 'ccs-box-auth', ok: !!ok }) : 'null';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:15px system-ui,sans-serif;margin:40px;color:#16181d}</style></head>
<body><h1>${escapeHtml(ok ? `${title} connected` : `${title} connection failed`)}</h1><p>${escapeHtml(message)}</p>
<script>
(function(){var o=window.opener;var origins=${origins};var msgs=[${payload},${legacy}];
if(o){origins.forEach(function(t){msgs.forEach(function(m){if(m){try{o.postMessage(m,t);}catch(e){}}});});}
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

module.exports = { callbackPage, escapeHtml };
