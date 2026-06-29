#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createTools } from '../lib/tools.js';
import { assertArgsWithinLimits } from '../lib/args-limits.js';
import { enforceResultSizeLimit } from '../lib/output-limits.js';
import { createCredentialsBroker } from '../lib/credentials/broker.js';
import { bearerAuth } from '../lib/middleware/bearer.js';
import { protectedResourceMetadata } from '../lib/http/well-known.js';

// Advertise the package version (single source of truth: package.json) to MCP clients.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Explorer is both the OAuth authorization server and the API host; the broker and
// /explorer/api live here. Host-only: the /explorer prefix is baked into the broker +
// API paths. HTTP transport is OAuth-only: no static env credentials.
const EXPLORER_BASE_URL = process.env.EXPLORER_BASE_URL || 'https://www.altmetric.com';

// OAuth issuer advertised to clients in the RFC 9728 protected-resource document. MUST exactly
// equal the authorization server's RFC 8414 `issuer` (RFC 8414 §3.3 — the metadata's issuer must
// equal the one the client used to find it). The authorization server uses a host-only issuer,
// so we advertise the host only: MCP clients derive the metadata URL from the issuer and fetch
// it at the host apex (<host>/.well-known/oauth-authorization-server), so a path-qualified issuer
// would not be discoverable. Zero-config discovery therefore requires the AS to serve its
// metadata at that apex. Configurable via EXPLORER_ISSUER for non-standard hosts.
const EXPLORER_ISSUER = (process.env.EXPLORER_ISSUER || EXPLORER_BASE_URL).replace(/\/$/, '');

// The Detail Pages API is a separate host from Explorer (which hosts the broker + the
// Explorer API). Its per-user key is brokered from Explorer, but the API calls go here.
const DETAILS_API_BASE_URL = process.env.DETAILS_API_BASE_URL || 'https://api.altmetric.com';

// HTTP server configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
// This server's public URL, used in the protected-resource metadata + WWW-Authenticate.
const MCP_PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '');
const RESOURCE_METADATA_URL = `${MCP_PUBLIC_URL}/.well-known/oauth-protected-resource`;

// Exchange the caller's OAuth bearer for the resource owner's entitlement map —
// { explorer?: { api_key, api_secret }, detail_pages_api?: { api_key } } — listing only
// the products they can use. The same call validates the token (200 = valid, 401/403 =
// reject) and is cached by token hash. Explorer decides entitlements; the MCP just renders
// them, so the transport stays purely an authentication layer.
const broker = createCredentialsBroker({
  baseUrl: EXPLORER_BASE_URL,
  path: '/explorer/oauth/credentials/mcp',
  extract: (body) => {
    if (!body || typeof body !== 'object') {
      throw new Error('MCP credentials response was not an object');
    }
    return body;
  },
});

// Build the toolset for a request from its entitlement map, mirroring the stdio entry's
// presence-gating: a product's tools are exposed only when its credentials are present.
// The resolvers close over this request's credentials, so the tools sign their own API
// calls without the client's bearer ever reaching the Altmetric APIs.
function buildTools(credentials) {
  return createTools({
    explorer: credentials.explorer
      ? async () => ({
        apiKey: credentials.explorer.api_key,
        apiSecret: credentials.explorer.api_secret,
        baseUrl: EXPLORER_BASE_URL,
      })
      : undefined,
    details: credentials.detail_pages_api
      ? async () => ({ apiKey: credentials.detail_pages_api.api_key, baseUrl: DETAILS_API_BASE_URL })
      : undefined,
  });
}

// Create a new MCP server instance for a request, exposing the given toolset. The transport
// is stateless, so this is built fresh per request (see the POST handler) and torn down when
// the response closes.
function createServer(tools) {
  const server = new Server(
    {
      name: 'altmetric-mcp-server',
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.values(tools).map((tool) => tool.definition),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      assertArgsWithinLimits(args);
      // Trim oversized results to the client cap, matching the stdio entry (index.js).
      return enforceResultSizeLimit(await tool.handler(args));
    } catch (error) {
      console.error(`Tool ${name} error:`, error);

      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool: ${error.message || 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// Validate the bearer by brokering its entitlement map (broker-only validation: 200 =
// valid, 401/403 = reject). The map is attached to the request as the principal and reused
// to build the toolset, and the lookup is cached by token hash, so the whole request costs
// one broker call.
const authenticate = bearerAuth({
  validate: async (token) => broker.get(token),
  resourceMetadataUrl: RESOURCE_METADATA_URL,
});

// Create Express app with MCP configuration
const app = createMcpExpressApp({ host: HOST });

// RFC 9728 protected resource metadata (unauthenticated: it is the discovery entry point).
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(protectedResourceMetadata({
    resource: MCP_PUBLIC_URL,
    authorizationServers: [EXPLORER_ISSUER],
    scopes: ['mcp'],
  }));
});

// MCP Registry domain-ownership proof (HTTP verification). The registry verifies the
// mcp.altmetric.com domain (the `com.altmetric.mcp` namespace) by fetching this path and
// matching the Ed25519 public key. Unauthenticated; the proof line comes from the
// MCP_REGISTRY_AUTH env var so the key can be rotated via config (the value is public).
// See https://modelcontextprotocol.io/registry/authentication
app.get('/.well-known/mcp-registry-auth', (req, res) => {
  const proof = process.env.MCP_REGISTRY_AUTH;
  if (!proof) {
    res.status(404).end();
    return;
  }
  res.type('text/plain').send(proof);
});

// Health check endpoint (unauthenticated)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', transport: 'http' });
});

// Stateless MCP: a fresh transport + server per request, torn down when the response
// closes. There is no session id and no in-memory session map, so any instance serves
// any request and a redeploy is invisible to clients. The tools are request/response
// only (no server-initiated streaming/notifications), so dropping sessions costs nothing.
app.post('/mcp', authenticate, async (req, res) => {
  // req.principal is this caller's entitlement map (from authenticate); the toolset
  // reflects exactly the products they can use.
  const server = createServer(buildTools(req.principal));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Stateless transport: no server->client stream to open (GET) and no session to close
// (DELETE), so neither method is supported.
function methodNotAllowed(req, res) {
  res.set('Allow', 'POST').status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method Not Allowed: this server is stateless; use POST /mcp.',
    },
    id: null,
  });
}
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

// Body-parse / middleware errors (e.g. a too-large POST body) otherwise reach Express's
// default handler, which outside production returns an HTML stack trace leaking absolute
// file paths. Return a clean JSON-RPC error instead; the detail stays in the server log.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error('Request error:', err.message);
  if (!res.headersSent) {
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: status === 413 ? 'Request body too large' : 'Bad request' },
      id: null,
    });
  }
});

// Start the server
const httpServer = app.listen(PORT, HOST, (error) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`Altmetric MCP HTTP Server running at http://${HOST}:${PORT}/mcp`);
  console.log('Transport: Streamable HTTP (stateless, OAuth-only)');
  console.log(`Explorer (broker + API): ${EXPLORER_BASE_URL}`);
  console.log(`Detail Pages API: ${DETAILS_API_BASE_URL}`);
  console.log(`Authorization server issuer (advertised): ${EXPLORER_ISSUER}`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  POST   http://${HOST}:${PORT}/mcp                                    - MCP messages (bearer required)`);
  console.log(`  GET    http://${HOST}:${PORT}/.well-known/oauth-protected-resource  - RFC 9728 metadata`);
  console.log(`  GET    http://${HOST}:${PORT}/health                                - Health check`);
});

// Handle server shutdown: stop accepting connections and let in-flight /mcp requests
// finish before exiting, with a safety net in case a connection refuses to drain.
function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
