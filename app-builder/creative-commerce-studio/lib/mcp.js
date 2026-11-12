/**
 * Minimal MCP client (Streamable HTTP transport) for the run-workflow MCP.
 * One short session per action invocation: initialize -> initialized ->
 * tools/list (name resolution) -> tools/call. Replies may be JSON or SSE.
 */
const { AppError } = require('./http');
const fireflyAuth = require('./firefly-auth');

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'creative-commerce-studio', version: '0.3.0' };

/** Extracts JSON-RPC messages from an SSE body. */
function parseSse(text) {
  const messages = [];
  text.split(/\r?\n\r?\n/).forEach((event) => {
    const data = event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (!data) return;
    try { messages.push(JSON.parse(data)); } catch (e) { /* ignore non-JSON events */ }
  });
  return messages;
}

class McpSession {
  constructor(url, token, fetchImpl) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl;
    this.sessionId = null;
    this.protocolVersion = null;
    this.nextId = 1;
    this.tools = null;
  }

  headers() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.token}`,
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...(this.protocolVersion ? { 'MCP-Protocol-Version': this.protocolVersion } : {}),
    };
  }

  async post(message) {
    let res;
    try {
      res = await this.fetch(this.url, { method: 'POST', headers: this.headers(), body: JSON.stringify(message) });
    } catch (e) {
      const err = new AppError(502, 'ffcpe-unreachable', 'Firefly Creative Production could not be reached.');
      err.uncertain = message.method === 'tools/call';
      throw err;
    }
    if (res.status === 401 || res.status === 403) {
      const err = new AppError(401, 'firefly-reauth', 'Your Firefly sign-in expired or lacks access. Connect Firefly again.');
      err.httpStatus = res.status;
      throw err;
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    return res;
  }

  async request(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    const res = await this.post({
      jsonrpc: '2.0', id, method, params,
    });
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!res.ok) throw new AppError(502, 'ffcpe-error', `Firefly Creative Production returned an error (${res.status}).`);
    const messages = type.includes('text/event-stream') ? parseSse(text) : [JSON.parse(text || '{}')].flat();
    const reply = messages.find((m) => m && m.id === id);
    if (!reply) throw new AppError(502, 'ffcpe-error', 'Firefly Creative Production sent no reply.');
    if (reply.error) throw new AppError(502, 'ffcpe-error', `Firefly Creative Production rejected the request: ${reply.error.message || reply.error.code}`);
    return reply.result;
  }

  async notify(method, params) {
    await this.post({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO,
    });
    this.protocolVersion = result?.protocolVersion || PROTOCOL_VERSION;
    await this.notify('notifications/initialized');
    return result;
  }

  /** Resolves a tool by exact name or by suffix (servers may prefix tool names). */
  async resolveTool(name) {
    if (!this.tools) {
      const result = await this.request('tools/list', {});
      this.tools = (result?.tools || []).map((t) => t.name);
    }
    const found = this.tools.find((t) => t === name)
      || this.tools.find((t) => t.endsWith(`-${name}`) || t.endsWith(`_${name}`) || t.endsWith(name));
    if (!found) throw new AppError(502, 'ffcpe-tool-missing', `The Firefly MCP does not offer the ${name} tool.`);
    return found;
  }

  /** Calls a tool and returns its structured payload (structuredContent or parsed text). */
  async callTool(name, args) {
    const toolName = await this.resolveTool(name);
    const result = await this.request('tools/call', { name: toolName, arguments: args });
    const texts = (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text);
    if (result?.isError) {
      throw new AppError(502, 'ffcpe-error', `Firefly Creative Production: ${texts.join(' ').slice(0, 300) || 'tool error'}`);
    }
    if (result?.structuredContent) return result.structuredContent;
    // eslint-disable-next-line no-restricted-syntax
    for (const t of texts) {
      try { return JSON.parse(t); } catch (e) { /* try next */ }
    }
    return { text: texts.join('\n') };
  }
}

/** Runs fn(session) with the author's Firefly token; refreshes once on 401/403. */
async function withSession(params, user, fn, fetchImpl = fetch) {
  const url = fireflyAuth.mcpUrl(params);
  const run = async (token) => {
    const session = new McpSession(url, token, fetchImpl);
    await session.initialize();
    return fn(session);
  };
  const token = await fireflyAuth.accessToken(params, user, fetchImpl);
  try {
    return await run(token);
  } catch (e) {
    if (e.code !== 'firefly-reauth' || e.uncertain) throw e;
    const fresh = await fireflyAuth.accessToken(params, user, fetchImpl, { force: true });
    return run(fresh);
  }
}

module.exports = { McpSession, withSession, parseSse };
