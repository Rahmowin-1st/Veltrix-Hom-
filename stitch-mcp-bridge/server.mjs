import http from 'node:http';
import { Readable } from 'node:stream';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const UPSTREAM = 'https://stitch.googleapis.com/mcp';
const CAPABILITY_TOKEN = process.env.MCP_CAPABILITY_TOKEN || '';
const MCP_PATH = CAPABILITY_TOKEN ? `/mcp/${CAPABILITY_TOKEN}` : null;

const REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
  'mcp-session-id',
  'last-event-id',
  'user-agent',
]);

const RESPONSE_HEADERS = new Set([
  'content-type',
  'mcp-session-id',
  'cache-control',
  'retry-after',
  'vary',
]);

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  const max = 2 * 1024 * 1024;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > max) throw Object.assign(new Error('request_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyMcp(req, res) {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey || !CAPABILITY_TOKEN) {
    return sendJson(res, 503, { error: 'service_not_configured' });
  }

  if (!['GET', 'POST', 'DELETE', 'OPTIONS'].includes(req.method || '')) {
    res.setHeader('allow', 'GET, POST, DELETE, OPTIONS');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers': 'Accept, Content-Type, Mcp-Session-Id, Last-Event-ID',
      'cache-control': 'no-store',
    });
    return res.end();
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (!REQUEST_HEADERS.has(lower) || value == null) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('X-Goog-Api-Key', apiKey);
  headers.set('Accept-Encoding', 'identity');

  const controller = new AbortController();
  req.on('aborted', () => controller.abort());
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  let body;
  try {
    body = req.method === 'POST' ? await readBody(req) : undefined;
  } catch (err) {
    return sendJson(res, err.statusCode || 400, { error: err.message || 'invalid_request' });
  }

  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
  } catch {
    if (controller.signal.aborted) return;
    return sendJson(res, 502, { error: 'upstream_unavailable' });
  }

  res.statusCode = upstream.status;
  for (const [name, value] of upstream.headers) {
    if (RESPONSE_HEADERS.has(name.toLowerCase())) res.setHeader(name, value);
  }
  res.setHeader('x-content-type-options', 'nosniff');

  if (!upstream.body) return res.end();

  try {
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    if (!res.headersSent) sendJson(res, 502, { error: 'stream_error' });
    else res.destroy();
  }
}

function extractJsonRpc(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }

  for (const block of trimmed.split(/\r?\n\r?\n+/)) {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload.startsWith('{')) continue;
      try { return JSON.parse(payload); } catch {}
    }
  }
  return null;
}

async function localMcpPost(localUrl, payload, sessionId) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'accept-encoding': 'identity',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const response = await fetch(localUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return {
    response,
    json: extractJsonRpc(text),
    sessionId: response.headers.get('mcp-session-id') || sessionId || '',
  };
}

async function runSelfTest() {
  if (!process.env.STITCH_API_KEY || !MCP_PATH) {
    console.warn('MCP self-test: NOT_CONFIGURED');
    return;
  }

  const localUrl = `http://127.0.0.1:${PORT}${MCP_PATH}`;

  try {
    const init = await localMcpPost(localUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stitch-mcp-bridge-selftest', version: '1.0.0' },
      },
    });

    if (!init.response.ok || !init.json?.result) {
      console.warn(`MCP self-test: INIT_FAIL status=${init.response.status}`);
      return;
    }

    await localMcpPost(localUrl, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }, init.sessionId);

    const list = await localMcpPost(localUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }, init.sessionId);

    const toolCount = Array.isArray(list.json?.result?.tools) ? list.json.result.tools.length : -1;
    if (!list.response.ok || toolCount < 0) {
      console.warn(`MCP self-test: TOOLS_FAIL status=${list.response.status}`);
      return;
    }

    console.log(`MCP self-test: PASS tools=${toolCount} session=${init.sessionId ? 'yes' : 'no'}`);
  } catch (error) {
    console.warn(`MCP self-test: ERROR name=${error?.name || 'Error'}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/') {
    return sendText(res, 200, 'Stitch MCP bridge is running.');
  }

  if (url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      configured: Boolean(process.env.STITCH_API_KEY && CAPABILITY_TOKEN),
    });
  }

  if (MCP_PATH && url.pathname === MCP_PATH) {
    return proxyMcp(req, res);
  }

  return sendJson(res, 404, { error: 'not_found' });
});

server.requestTimeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 60_000;

server.listen(PORT, HOST, () => {
  console.log(`Stitch MCP bridge listening on port ${PORT}`);
  if (process.env.BRIDGE_SELF_TEST === '1') setTimeout(runSelfTest, 1200).unref();
});
