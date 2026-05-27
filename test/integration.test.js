#!/usr/bin/env node

/**
 * Integration test for the MCP server.
 * Tests the full end-to-end flow: server startup, MCP protocol, real API calls,
 * and the assertions that matter (structuredContent shape + UNTRUSTED_MARKER
 * in the human-readable summary).
 *
 * Run with: npm run test:integration
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'assert';

const UNTRUSTED_MARKER_FRAGMENT = 'untrusted text from the Altmetric API';

function summaryOf(result) {
  // Returns the natural-language summary that gets shown to the LLM.
  return result?.content?.[0]?.text ?? '';
}

function structuredOf(result) {
  // Returns the structured payload alongside the summary.
  return result?.structuredContent;
}

async function run() {
  console.log('Starting MCP server integration test…\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--env-file=.env', 'index.js'],
  });

  const client = new Client(
    { name: 'integration-test-client', version: '0.1.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    console.log('✓ Connected to MCP server\n');

    // ---- 1. listTools -------------------------------------------------
    const { tools } = await client.listTools();
    assert.strictEqual(tools.length, 11, `expected 11 tools, got ${tools.length}`);
    console.log(`✓ listTools returned ${tools.length} tools\n`);

    // ---- 2. get_citation_counts (DOI) --------------------------------
    {
      const r = await client.callTool({
        name: 'get_citation_counts',
        arguments: { identifier: '10.1089/g4h.2020.0180', identifier_type: 'doi' },
      });
      const data = structuredOf(r);
      assert.ok(data, 'structuredContent must be present');
      assert.ok(data.altmetric_id, 'structuredContent.altmetric_id must be set');
      assert.ok(data.title, 'structuredContent.title must be set');
      assert.ok(
        summaryOf(r).includes(UNTRUSTED_MARKER_FRAGMENT),
        'summary text must carry the UNTRUSTED_MARKER',
      );
      console.log(`✓ get_citation_counts(DOI): id=${data.altmetric_id} score=${data.score}`);
    }

    // ---- 3. get_citation_counts (Altmetric ID) -----------------------
    {
      const r = await client.callTool({
        name: 'get_citation_counts',
        arguments: { identifier: '105587727', identifier_type: 'id' },
      });
      const data = structuredOf(r);
      assert.ok(data?.doi, 'structuredContent.doi must be set');
      console.log(`✓ get_citation_counts(id): doi=${data.doi}`);
    }

    // ---- 4. get_citation_details (commercial; may 403 on free tier) --
    {
      const r = await client.callTool({
        name: 'get_citation_details',
        arguments: { identifier: '10.1002/pan3.10240', identifier_type: 'doi' },
      });
      if (r.isError) {
        console.log(`⚠ get_citation_details returned isError: ${summaryOf(r).slice(0, 80)}`);
      } else {
        const data = structuredOf(r);
        assert.ok(data, 'structuredContent must be present on success');
        assert.ok(
          summaryOf(r).includes(UNTRUSTED_MARKER_FRAGMENT),
          'summary text must carry the UNTRUSTED_MARKER',
        );
        const postCount = data.posts?.length ?? 0;
        console.log(`✓ get_citation_details: ${postCount} posts in structuredContent`);
      }
    }

    // ---- 5. search_citations -----------------------------------------
    {
      const r = await client.callTool({
        name: 'search_citations',
        arguments: { timeframe: '1w', num_results: 5 },
      });
      const data = structuredOf(r);
      const count = data?.results?.length ?? 0;
      console.log(`✓ search_citations(1w): ${count} results`);
    }

    // ---- 6. translate_identifiers (was uncovered before) -------------
    {
      const r = await client.callTool({
        name: 'translate_identifiers',
        arguments: { identifiers: ['10.1038/news.2011.490', '21148220'] },
      });
      assert.ok(!r.isError, `translate_identifiers must succeed: ${summaryOf(r)}`);
      const data = structuredOf(r);
      assert.ok(data, 'structuredContent must be present');
      console.log(`✓ translate_identifiers: ${Object.keys(data).length} translations`);
    }

    // ---- 7. get_batch_attention_data (was uncovered before) ----------
    {
      const r = await client.callTool({
        name: 'get_batch_attention_data',
        arguments: {
          dois: ['10.1089/g4h.2020.0180', '10.1002/pan3.10240'],
          sort_by: 'score',
        },
      });
      assert.ok(!r.isError, `get_batch_attention_data must succeed: ${summaryOf(r)}`);
      const data = structuredOf(r);
      assert.ok(data, 'structuredContent must be present');
      assert.ok(
        summaryOf(r).includes(UNTRUSTED_MARKER_FRAGMENT),
        'summary text must carry the UNTRUSTED_MARKER',
      );
      console.log(`✓ get_batch_attention_data: queried=${data.total_queried} found=${data.found}`);
    }

    // ---- 8. explore_research_outputs ---------------------------------
    {
      const r = await client.callTool({
        name: 'explore_research_outputs',
        arguments: { page_size: 1 },
      });
      assert.ok(structuredOf(r), 'structuredContent must be present');
      const data = structuredOf(r);
      console.log(`✓ explore_research_outputs: ${data?.data?.length ?? 0} outputs`);
    }

    // ---- 9. explore_attention_summary --------------------------------
    {
      const r = await client.callTool({
        name: 'explore_attention_summary',
        arguments: { timeframe: '1d' },
      });
      assert.ok(structuredOf(r), 'structuredContent must be present');
      console.log('✓ explore_attention_summary');
    }

    // ---- 10. explore_mentions ----------------------------------------
    {
      const r = await client.callTool({
        name: 'explore_mentions',
        arguments: { timeframe: '1d', page_size: 1 },
      });
      assert.ok(structuredOf(r), 'structuredContent must be present');
      const data = structuredOf(r);
      console.log(`✓ explore_mentions: ${data?.data?.length ?? 0} mentions`);
    }

    // ---- 11. explore_demographics ------------------------------------
    {
      const r = await client.callTool({
        name: 'explore_demographics',
        arguments: { timeframe: '1d' },
      });
      assert.ok(structuredOf(r), 'structuredContent must be present');
      console.log('✓ explore_demographics');
    }

    // ---- 12. explore_mention_sources ---------------------------------
    {
      const r = await client.callTool({
        name: 'explore_mention_sources',
        arguments: { timeframe: '1d', page_size: 1 },
      });
      assert.ok(structuredOf(r), 'structuredContent must be present');
      const data = structuredOf(r);
      console.log(`✓ explore_mention_sources: ${data?.data?.length ?? 0} sources`);
    }

    // ---- 13. explore_journals ----------------------------------------
    {
      const r = await client.callTool({
        name: 'explore_journals',
        arguments: { journal_id: ['4f6fa4c93cf058f610000043'] },
      });
      assert.ok(structuredOf(r), 'structuredContent must be present');
      const data = structuredOf(r);
      console.log(`✓ explore_journals: ${data?.data?.length ?? 0} journals`);
    }

    // ---- 14. Filter validation rejects bad inputs (no upstream call) -
    {
      const r = await client.callTool({
        name: 'explore_research_outputs',
        arguments: { published_after: '2024-13-45' },
      });
      assert.ok(r.isError, 'invalid date must produce an isError result');
      assert.ok(
        summaryOf(r).includes('Invalid published_after'),
        'error message must mention the invalid field',
      );
      console.log('✓ filter validation rejects bad date before upstream call');
    }

    console.log('\n✓ All integration tests passed.\n');
  } catch (error) {
    console.error('\n✗ Integration test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
