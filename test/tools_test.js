import assert from 'assert';
import sinon from 'sinon';
import { createTools } from '../lib/tools.js';

/**
 * Tests for MCP Tools
 *
 * These tests verify business logic (parameter transformations, error handling)
 */

// Mock fetch globally
let fetchStub;

// Test API credentials
const DETAILS_API_KEY = 'test_details_api_key';
const DETAILS_API_BASE_URL = 'https://api.altmetric.com';
const EXPLORER_API_KEY = 'test_explorer_api_key';
const EXPLORER_API_SECRET = 'test_explorer_api_secret';
const EXPLORER_API_BASE_URL = 'https://www.altmetric.com';

// Create tools with test configuration
const tools = createTools({
  detailsApiKey: DETAILS_API_KEY,
  detailsApiBaseUrl: DETAILS_API_BASE_URL,
  explorerApiKey: EXPLORER_API_KEY,
  explorerApiSecret: EXPLORER_API_SECRET,
  explorerApiBaseUrl: EXPLORER_API_BASE_URL,
});

// Extract handlers for easier testing
const toolHandlers = Object.keys(tools).reduce((acc, key) => {
  acc[key] = tools[key].handler;
  return acc;
}, {});

describe('MCP Tools', function () {
  beforeEach(function () {
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(function () {
    fetchStub.restore();
  });

  describe('Parameter Transformation', function () {
    it('maps subject parameter to scopus_subjects in search_citations', async function () {
      const mockResponse = {
        query: { timeframe: '3m', subject: 'medicine' },
        results: [],
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await toolHandlers.search_citations({
        timeframe: '3m',
        subject: 'medicine',
      });

      // Verify the API receives scopus_subjects, not subject
      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.get('scopus_subjects'), 'medicine',
        'subject parameter should be transformed to scopus_subjects');
      assert.strictEqual(url.searchParams.has('subject'), false,
        'subject parameter should not be passed directly to API');
    });

    it('sends order parameter without filter[] wrapper (Explorer API)', async function () {
      const mockResponse = { meta: { total: 0 }, data: [] };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await toolHandlers.explore_research_outputs({
        q: 'test',
        order: 'score_desc',
      });

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.get('order'), 'score_desc',
        'order param should not have filter[] wrapper');
      assert.strictEqual(url.searchParams.has('filter[order]'), false,
        'order should not be wrapped with filter[]');
    });

    it('sends page[number] parameter without filter[] wrapper (Explorer API)', async function () {
      const mockResponse = { meta: { total: 0 }, data: [] };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await toolHandlers.explore_research_outputs({
        q: 'test',
        page_number: 2,
      });

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.get('page[number]'), '2',
        'page[number] param should not have filter[] wrapper');
      assert.strictEqual(url.searchParams.has('filter[page[number]]'), false,
        'page[number] should not be wrapped with filter[]');
    });

    it('sends page[size] parameter without filter[] wrapper (Explorer API)', async function () {
      const mockResponse = { meta: { total: 0 }, data: [] };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await toolHandlers.explore_research_outputs({
        q: 'test',
        page_size: 50,
      });

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.get('page[size]'), '50',
        'page[size] param should not have filter[] wrapper');
      assert.strictEqual(url.searchParams.has('filter[page[size]]'), false,
        'page[size] should not be wrapped with filter[]');
    });

    it('wraps regular filter parameters with filter[] (Explorer API)', async function () {
      const mockResponse = { meta: { total: 0 }, data: [] };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await toolHandlers.explore_research_outputs({
        q: 'climate',
        scope: 'institution',
      });

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.get('filter[q]'), 'climate',
        'regular params should be wrapped with filter[]');
      assert.strictEqual(url.searchParams.get('filter[scope]'), 'institution',
        'regular params should be wrapped with filter[]');
    });

    it('formats array parameters as filter[key][] (Explorer API)', async function () {
      const mockResponse = { meta: { total: 0 }, data: [] };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      await toolHandlers.explore_research_outputs({
        type: ['article', 'dataset'],
      });

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.deepStrictEqual(url.searchParams.getAll('filter[type][]'), ['article', 'dataset'],
        'array params should be formatted as filter[key][]');
    });
  });

  describe('Error Handling Business Logic', function () {
    it('returns 403 error for unauthorized access to commercial features', async function () {
      fetchStub.resolves({
        ok: false,
        status: 403,
        text: async () => 'Forbidden - Commercial feature',
      });

      try {
        await toolHandlers.get_citation_details({
          identifier: '10.1234/test',
          identifier_type: 'doi',
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.match(error.message, /403/, 'Error message should include status code');
      }
    });

    it('returns 404 error for non-existent identifiers', async function () {
      fetchStub.resolves({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      try {
        await toolHandlers.get_citation_counts({
          identifier: '10.1234/nonexistent',
          identifier_type: 'doi',
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.match(error.message, /404/, 'Error message should include status code');
      }
    });
  });
});
