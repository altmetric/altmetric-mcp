#!/usr/bin/env node

/**
 * Integration test for the MCP server
 * Tests full end-to-end flow: server startup, MCP protocol, and real API calls
 * Run with: npm run test:integration
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testMCPServer() {
  console.log('Starting MCP server test...\n');

  const serverProcess = spawn('node', ['--env-file=.env', 'index.js'], {
    cwd: process.cwd(),
    env: process.env,
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--env-file=.env', 'index.js'],
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log('✓ Connected to MCP server\n');

    console.log('Test 1: Listing available tools...');
    const tools = await client.listTools();
    console.log(`✓ Found ${tools.tools.length} tools:`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description.substring(0, 60)}...`);
    });
    console.log();

    // Details Page API Tests
    console.log('Test 2: get_citation_counts with DOI 10.1089/g4h.2020.0180...');
    const countsResult = await client.callTool({
      name: 'get_citation_counts',
      arguments: {
        identifier: '10.1089/g4h.2020.0180',
        identifier_type: 'doi',
      },
    });
    const countsData = JSON.parse(countsResult.content[0].text);
    console.log(`✓ Success! Altmetric ID: ${countsData.altmetric_id}, Score: ${countsData.score}`);
    console.log(`  Title: ${countsData.title.substring(0, 60)}...`);
    console.log();

    console.log('Test 3: get_citation_counts with Altmetric ID 105587727...');
    const idResult = await client.callTool({
      name: 'get_citation_counts',
      arguments: {
        identifier: '105587727',
        identifier_type: 'id',
      },
    });
    const idData = JSON.parse(idResult.content[0].text);
    console.log(`✓ Success! DOI: ${idData.doi}, Score: ${idData.score}`);
    console.log();

    console.log('Test 4: get_citation_details with DOI 10.1002/pan3.10240...');
    const detailsResult = await client.callTool({
      name: 'get_citation_details',
      arguments: {
        identifier: '10.1002/pan3.10240',
        identifier_type: 'doi',
      },
    });
    const detailsData = JSON.parse(detailsResult.content[0].text);
    console.log(`✓ Success! Retrieved ${detailsData.posts ? detailsData.posts.length : 0} posts`);
    console.log();

    console.log('Test 5: search_citations for last week...');
    const searchResult = await client.callTool({
      name: 'search_citations',
      arguments: {
        timeframe: '1w',
        num_results: 5,
      },
    });
    const searchData = JSON.parse(searchResult.content[0].text);
    console.log(`✓ Success! Found ${searchData.results ? searchData.results.length : 0} results`);
    console.log();

    // Explorer API Tests
    console.log('Test 6: explore_research_outputs...');
    const exploreResult = await client.callTool({
      name: 'explore_research_outputs',
      arguments: {
        page_size: 1,
      },
    });
    const exploreData = JSON.parse(exploreResult.content[0].text);
    console.log(`✓ Success! Returned ${exploreData.data?.length || 0} research outputs`);
    console.log();

    console.log('Test 7: explore_attention_summary...');
    const attentionResult = await client.callTool({
      name: 'explore_attention_summary',
      arguments: {
        timeframe: '1d',
      },
    });
    const attentionData = JSON.parse(attentionResult.content[0].text);
    console.log(`✓ Success! Retrieved attention data`);
    console.log();

    console.log('Test 8: explore_mentions...');
    const mentionsResult = await client.callTool({
      name: 'explore_mentions',
      arguments: {
        timeframe: '1d',
        page_size: 1,
      },
    });
    const mentionsData = JSON.parse(mentionsResult.content[0].text);
    console.log(`✓ Success! Returned ${mentionsData.data?.length || 0} mentions`);
    console.log();

    console.log('Test 9: explore_demographics...');
    const demoResult = await client.callTool({
      name: 'explore_demographics',
      arguments: {
        timeframe: '1d',
      },
    });
    const demoData = JSON.parse(demoResult.content[0].text);
    console.log(`✓ Success! Retrieved demographic data`);
    console.log();

    console.log('Test 10: explore_mention_sources...');
    const sourcesResult = await client.callTool({
      name: 'explore_mention_sources',
      arguments: {
        timeframe: '1d',
        page_size: 1,
      },
    });
    const sourcesData = JSON.parse(sourcesResult.content[0].text);
    console.log(`✓ Success! Returned ${sourcesData.data?.length || 0} sources`);
    console.log();

    console.log('Test 11: explore_journals...');
    const journalsResult = await client.callTool({
      name: 'explore_journals',
      arguments: {
        journal_id: ['4f6fa4c93cf058f610000043'],
      },
    });
    const journalsData = JSON.parse(journalsResult.content[0].text);
    console.log(`✓ Success! Returned ${journalsData.data?.length || 0} journals`);
    console.log();

    console.log('✓ All API tests completed!\n');

  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    await client.close();
    serverProcess.kill();
  }
}

testMCPServer();
