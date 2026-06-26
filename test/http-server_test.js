import assert from 'assert';
import http from 'node:http';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

/**
 * Integration tests for the HTTP transport entry (bin/altmetric-mcp-serve.js).
 *
 * Spawns the real server against a stub Explorer (aggregate credentials broker + Explorer
 * API + Detail Pages API) and drives it over HTTP. Verifies: RFC 9728 discovery, 401 +
 * WWW-Authenticate for unauthenticated / rejected callers, that the advertised toolset
 * reflects the caller's entitlements (Explorer-only, Detail-Pages-only, both), the signed
 * API calls, the spec token-passthrough prohibition (the client bearer never reaches the
 * Altmetric APIs), broker-credential caching, and the stateless transport contract.
 */

const PORT = 34571;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const GOOD = 'good-token';                 // entitled to both products
const EXPLORER_ONLY = 'explorer-only-token';
const DETAILS_ONLY = 'details-only-token';

// Bearer -> entitlement map returned by the aggregate credentials endpoint. Anything not
// listed is rejected (401) by the broker stub.
const TOKEN_CREDENTIALS = {
  [GOOD]: {
    explorer: { api_key: 'brokered-key', api_secret: 'brokered-secret-1234567890' },
    detail_pages_api: { api_key: 'brokered-details-key' },
  },
  [EXPLORER_ONLY]: {
    explorer: { api_key: 'brokered-key', api_secret: 'brokered-secret-1234567890' },
  },
  [DETAILS_ONLY]: {
    detail_pages_api: { api_key: 'dp-only-key' },
  },
};

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

let serverProcess;
let serverStderr = '';

// --- stub Explorer ---------------------------------------------------------
let explorer;
let explorerOrigin;
const credsHits = {};
let lastExplorerApiRequest = null;
let lastDetailsApiRequest = null;

function startExplorerStub() {
  return new Promise((resolve) => {
    explorer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/explorer/oauth/credentials/mcp') {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        credsHits[token] = (credsHits[token] || 0) + 1;
        const creds = TOKEN_CREDENTIALS[token];
        if (creds) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(creds));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_token' }));
        }
        return;
      }

      if (url.pathname === '/explorer/api/research_outputs') {
        lastExplorerApiRequest = { rawUrl: req.url, authorization: req.headers.authorization || null };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [], meta: { response: { 'total-results': 0, 'total-pages': 1 } } }));
        return;
      }

      // Detail Pages API (a separate host in prod; pointed back at this stub in the test).
      if (url.pathname.startsWith('/v1/')) {
        lastDetailsApiRequest = { rawUrl: req.url, authorization: req.headers.authorization || null };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title: 'Stub output', score: 1, cited_by_accounts_count: 0, cited_by_posts_count: 0 }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    explorer.listen(0, '127.0.0.1', () => {
      explorerOrigin = `http://127.0.0.1:${explorer.address().port}`;
      resolve();
    });
  });
}

// --- MCP HTTP helpers -------------------------------------------------------
function parseSSE(body) {
  const results = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6).trim();
      if (jsonStr) results.push(JSON.parse(jsonStr));
    }
  }
  return results.length === 1 ? results[0] : results;
}

// Stateless transport: every request stands alone — no initialize handshake, no session id.
async function mcpPost(method, params, { token } = {}) {
  const headers = { ...MCP_HEADERS };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      data = parseSSE(text);
    } else {
      try { data = JSON.parse(text); } catch { data = text; }
    }
  }

  return {
    status: response.status,
    sessionId: response.headers.get('mcp-session-id'),
    wwwAuthenticate: response.headers.get('www-authenticate'),
    data,
  };
}

async function toolNames(token) {
  const { data } = await mcpPost('tools/list', {}, { token });
  return data.result.tools.map((t) => t.name);
}

describe('HTTP transport (OAuth resource server)', function () {
  this.timeout(15000);

  before(async function () {
    await startExplorerStub();

    serverProcess = spawn('node', ['bin/altmetric-mcp-serve.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: '127.0.0.1',
        EXPLORER_BASE_URL: explorerOrigin,
        DETAILS_API_BASE_URL: explorerOrigin,
        MCP_PUBLIC_URL: BASE_URL,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    serverProcess.stderr.on('data', (chunk) => { serverStderr += chunk.toString(); });

    // Wait for readiness via the health endpoint.
    let up = false;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      try {
        const res = await fetch(`${BASE_URL}/health`);
        if (res.ok) { up = true; break; }
      } catch { /* not up yet */ }
    }
    if (!up) throw new Error(`Server did not start. stderr:\n${serverStderr}`);
  });

  after(async function () {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await sleep(300);
    }
    if (explorer) await new Promise((r) => explorer.close(r));
  });

  describe('Discovery (RFC 9728)', function () {
    it('serves protected-resource metadata without auth', async function () {
      const res = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`);
      assert.strictEqual(res.status, 200);
      const doc = await res.json();
      assert.strictEqual(doc.resource, BASE_URL);
      // Must match the authorization server's host-only RFC 8414 issuer — RFC 8414 §3.3.
      assert.deepStrictEqual(doc.authorization_servers, [explorerOrigin]);
      assert.deepStrictEqual(doc.scopes_supported, ['mcp']);
    });
  });

  describe('Authentication', function () {
    it('401s an unauthenticated call with a discovery WWW-Authenticate header', async function () {
      const { status, wwwAuthenticate } = await mcpPost('tools/list', {});
      assert.strictEqual(status, 401);
      assert.ok(wwwAuthenticate, 'should send WWW-Authenticate');
      assert.match(wwwAuthenticate, /resource_metadata="http:\/\/127\.0\.0\.1:34571\/\.well-known\/oauth-protected-resource"/);
    });

    it('401s a token the broker rejects', async function () {
      const { status } = await mcpPost('tools/list', {}, { token: 'bad-token' });
      assert.strictEqual(status, 401);
      assert.ok(credsHits['bad-token'] >= 1, 'broker should have been consulted for the bad token');
    });
  });

  describe('Toolset reflects entitlements', function () {
    it('exposes both toolsets to a user entitled to both products', async function () {
      const names = await toolNames(GOOD);
      assert.ok(names.includes('explore_research_outputs'), 'should expose Explorer tools');
      assert.ok(names.includes('get_citation_counts'), 'should expose Detail Pages tools');
    });

    it('exposes only Explorer tools to an Explorer-only user', async function () {
      const names = await toolNames(EXPLORER_ONLY);
      assert.ok(names.includes('explore_research_outputs'), 'should expose Explorer tools');
      assert.ok(!names.includes('get_citation_counts'), 'should not expose Detail Pages tools');
    });

    it('exposes only Detail Pages tools to a Detail-Pages-only user', async function () {
      const names = await toolNames(DETAILS_ONLY);
      assert.ok(names.includes('get_citation_counts'), 'should expose Detail Pages tools');
      assert.ok(!names.includes('explore_research_outputs'), 'should not expose Explorer tools');
    });
  });

  describe('Tool calls', function () {
    it('signs the Explorer call with the brokered key without leaking the bearer', async function () {
      lastExplorerApiRequest = null;

      const { status, data } = await mcpPost('tools/call', {
        name: 'explore_research_outputs',
        arguments: { q: 'test' },
      }, { token: GOOD });

      assert.strictEqual(status, 200);
      assert.ok(!data.result.isError, `tool call should succeed: ${JSON.stringify(data.result)}`);
      assert.ok(lastExplorerApiRequest, 'Explorer API should have been called');
      assert.match(lastExplorerApiRequest.rawUrl, /key=brokered-key/);
      assert.match(lastExplorerApiRequest.rawUrl, /digest=[a-f0-9]+/);
      assert.strictEqual(lastExplorerApiRequest.authorization, null);
    });

    it('signs the Detail Pages call with the brokered key without leaking the bearer', async function () {
      lastDetailsApiRequest = null;

      const { status, data } = await mcpPost('tools/call', {
        name: 'get_citation_counts',
        arguments: { identifier: '10.1038/nature12373', identifier_type: 'doi' },
      }, { token: DETAILS_ONLY });

      assert.strictEqual(status, 200);
      assert.ok(!data.result.isError, `tool call should succeed: ${JSON.stringify(data.result)}`);
      assert.ok(lastDetailsApiRequest, 'Details API should have been called');
      assert.match(lastDetailsApiRequest.rawUrl, /key=dp-only-key/);
      assert.strictEqual(lastDetailsApiRequest.authorization, null);
    });

    it('caches the brokered credentials (one broker hit reused across requests)', async function () {
      // GOOD made several requests above; each validates and builds its toolset, but the
      // entitlement map is brokered once and cached by token hash.
      assert.strictEqual(credsHits[GOOD], 1, `expected a single broker network hit, saw ${credsHits[GOOD]}`);
    });
  });

  describe('Stateless transport', function () {
    it('never issues a session id (each request stands alone)', async function () {
      const { status, sessionId } = await mcpPost('tools/list', {}, { token: GOOD });
      assert.strictEqual(status, 200);
      assert.strictEqual(sessionId, null, 'a stateless server must not set Mcp-Session-Id');
    });

    it('rejects GET and DELETE on /mcp (no stream to open, no session to close)', async function () {
      for (const method of ['GET', 'DELETE']) {
        const res = await fetch(`${BASE_URL}/mcp`, { method });
        assert.strictEqual(res.status, 405, `${method} /mcp should be 405`);
        assert.strictEqual(res.headers.get('allow'), 'POST', `${method} should advertise Allow: POST`);
      }
    });
  });
});
