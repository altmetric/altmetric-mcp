#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createTools } from './lib/tools.js';

// Details Page API configuration
const DETAILS_API_KEY = process.env.ALTMETRIC_DETAILS_API_KEY;
const DETAILS_API_BASE_URL = 'https://api.altmetric.com';

// Explorer API configuration
const EXPLORER_API_KEY = process.env.ALTMETRIC_EXPLORER_API_KEY;
const EXPLORER_API_SECRET = process.env.ALTMETRIC_EXPLORER_API_SECRET;
const EXPLORER_API_BASE_URL = 'https://www.altmetric.com';

// Validate required environment variables - at least one API must be configured
const hasDetailsApi = !!DETAILS_API_KEY;
const hasExplorerApi = !!(EXPLORER_API_KEY && EXPLORER_API_SECRET);

if (!hasDetailsApi && !hasExplorerApi) {
  console.error('Error: At least one API configuration is required');
  console.error('Please configure either:');
  console.error('  1. Details Page API: ALTMETRIC_DETAILS_API_KEY');
  console.error('  2. Explorer API: ALTMETRIC_EXPLORER_API_KEY and ALTMETRIC_EXPLORER_API_SECRET');
  console.error('');
  console.error('Set these in:');
  console.error('  - A .env file in the project root, or');
  console.error('  - Environment variables');
  console.error('');
  console.error('Get API credentials at: https://www.altmetric.com/solutions/altmetric-api/');
  process.exit(1);
}

// Create tools with API configuration
const tools = createTools({
  detailsApiKey: DETAILS_API_KEY,
  detailsApiBaseUrl: DETAILS_API_BASE_URL,
  explorerApiKey: EXPLORER_API_KEY,
  explorerApiSecret: EXPLORER_API_SECRET,
  explorerApiBaseUrl: EXPLORER_API_BASE_URL,
});

// Create and configure the server
const server = new Server(
  {
    name: 'altmetric-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.values(tools).map((tool) => tool.definition),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    return await tool.handler(args);
  } catch (error) {
    // Log full error for debugging
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr to avoid interfering with stdio transport
  console.error('Altmetric MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});