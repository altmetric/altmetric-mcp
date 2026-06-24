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
import { createExplorerBroker } from '../lib/credentials/explorer-broker.js';
import { bearerAuth } from '../lib/middleware/bearer.js';
import { runWithContext, currentContext } from '../lib/http/context.js';
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

// HTTP server configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
// This server's public URL, used in the protected-resource metadata + WWW-Authenticate.
const MCP_PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '');
const RESOURCE_METADATA_URL = `${MCP_PUBLIC_URL}/.well-known/oauth-protected-resource`;

// Broker the per-user (api_key, api_secret) from the caller's OAuth bearer. The same
// call validates the token (200 = valid, 401/403 = reject), cached by token hash.
const broker = createExplorerBroker({ baseUrl: EXPLORER_BASE_URL });

// Explorer tools only: the broker delivers Explorer credentials. Details Page user
// keys are a later ticket (SOI-731). The resolver reads the current request's bearer
// from the async context, so the once-built tools serve every request's user.
const tools = createTools({
  explorer: async () => {
    const ctx = currentContext();
    if (!ctx || !ctx.token) {
      throw new Error('No authenticated request context for Explorer credentials');
    }
    const { apiKey, apiSecret } = await broker.get(ctx.token);
    return { apiKey, apiSecret, baseUrl: EXPLORER_BASE_URL };
  },
});

// Create a new MCP server instance. The transport is stateless, so this is built fresh
// per request (see the POST handler) and torn down when the response closes.
function createServer() {
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
      return await tool.handler(args);
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

// Validate the bearer by brokering its credentials (broker-only validation: 200 = valid,
// 401/403 = reject). The lookup is cached by token hash, so the tool call later in the
// same request reuses it. The principal is unused downstream (stateless: no session to
// own), so validation only needs to succeed or throw.
const authenticate = bearerAuth({
  validate: async (token) => {
    await broker.get(token);
    return {};
  },
  resourceMetadataUrl: RESOURCE_METADATA_URL,
});

// Run the MCP request inside the per-request async context so a tool's credential
// resolver can read this request's bearer.
function handleWithContext(req, res, transport, body) {
  return runWithContext(
    { token: req.bearerToken, principal: req.principal },
    () => transport.handleRequest(req, res, body)
  );
}

// Create Express app with MCP configuration
const app = createMcpExpressApp({ host: HOST });

// RFC 9728 protected resource metadata (unauthenticated: it is the discovery entry point).
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(protectedResourceMetadata({
    resource: MCP_PUBLIC_URL,
    authorizationServers: [EXPLORER_ISSUER],
  }));
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
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await handleWithContext(req, res, transport, req.body);
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

// Start the server
app.listen(PORT, HOST, (error) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`Altmetric MCP HTTP Server running at http://${HOST}:${PORT}/mcp`);
  console.log('Transport: Streamable HTTP (stateless, OAuth-only)');
  console.log(`Explorer (broker + API): ${EXPLORER_BASE_URL}`);
  console.log(`Authorization server issuer (advertised): ${EXPLORER_ISSUER}`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  POST   http://${HOST}:${PORT}/mcp                                    - MCP messages (bearer required)`);
  console.log(`  GET    http://${HOST}:${PORT}/.well-known/oauth-protected-resource  - RFC 9728 metadata`);
  console.log(`  GET    http://${HOST}:${PORT}/health                                - Health check`);
});

// Handle server shutdown. Per-request transports are torn down on response close, so
// there is no session state to drain here.
function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
