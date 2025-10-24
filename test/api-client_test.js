import assert from 'assert';
import sinon from 'sinon';
import { generateExplorerDigest, makeDetailsApiRequest, makeExplorerApiRequest } from '../lib/api-client.js';

describe('API Client', function () {
  let fetchStub;

  beforeEach(function () {
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(function () {
    fetchStub.restore();
  });

  describe('generateExplorerDigest', function () {
    const validSecret = 'this-is-a-valid-secret-key';

    it('excludes "order" parameter from digest calculation', function () {
      const filters1 = { q: 'test', order: 'score_desc' };
      const filters2 = { q: 'test', order: 'date_desc' };
      const digest1 = generateExplorerDigest(filters1, validSecret);
      const digest2 = generateExplorerDigest(filters2, validSecret);

      assert.strictEqual(digest1, digest2, 'Different order values should produce same digest');
    });

    it('excludes "page[number]" parameter from digest calculation', function () {
      const filters1 = { q: 'test', 'page[number]': 1 };
      const filters2 = { q: 'test', 'page[number]': 2 };
      const digest1 = generateExplorerDigest(filters1, validSecret);
      const digest2 = generateExplorerDigest(filters2, validSecret);

      assert.strictEqual(digest1, digest2, 'Different page numbers should produce same digest');
    });

    it('excludes "page[size]" parameter from digest calculation', function () {
      const filters1 = { q: 'test', 'page[size]': 25 };
      const filters2 = { q: 'test', 'page[size]': 100 };
      const digest1 = generateExplorerDigest(filters1, validSecret);
      const digest2 = generateExplorerDigest(filters2, validSecret);

      assert.strictEqual(digest1, digest2, 'Different page sizes should produce same digest');
    });

    it('sorts filter keys alphabetically before generating digest', function () {
      const filters1 = { q: 'test', scope: 'all', timeframe: '1w' };
      const filters2 = { timeframe: '1w', q: 'test', scope: 'all' }; // different order
      const digest1 = generateExplorerDigest(filters1, validSecret);
      const digest2 = generateExplorerDigest(filters2, validSecret);

      assert.strictEqual(digest1, digest2, 'Key order should not affect digest');
    });

    it('validates secret is at least 16 characters', function () {
      assert.throws(
        () => generateExplorerDigest({ q: 'test' }, 'short'),
        /ALTMETRIC_EXPLORER_API_SECRET must be at least 16 characters/
      );
    });

    it('validates secret exists (not undefined or empty)', function () {
      assert.throws(
        () => generateExplorerDigest({ q: 'test' }, undefined),
        /ALTMETRIC_EXPLORER_API_SECRET must be at least 16 characters/
      );

      assert.throws(
        () => generateExplorerDigest({ q: 'test' }, ''),
        /ALTMETRIC_EXPLORER_API_SECRET must be at least 16 characters/
      );
    });

    it('handles empty filters object', function () {
      const digest = generateExplorerDigest({}, validSecret);
      assert.match(digest, /^[a-f0-9]{40}$/, 'Should handle empty filters');
    });
  });

  describe('makeDetailsApiRequest (our error handling logic)', function () {
    const apiKey = 'test_api_key';
    const baseUrl = 'https://api.altmetric.com';

    it('validates API key exists', async function () {
      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, null, baseUrl),
        /ALTMETRIC_DETAILS_API_KEY is required/,
        'Should reject null API key'
      );

      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, undefined, baseUrl),
        /ALTMETRIC_DETAILS_API_KEY is required/,
        'Should reject undefined API key'
      );

      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, '', baseUrl),
        /ALTMETRIC_DETAILS_API_KEY is required/,
        'Should reject empty string API key'
      );
    });

    it('throws error with status code on API failure', async function () {
      fetchStub.resolves({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/invalid', {}, apiKey, baseUrl),
        /API request failed with status 404/,
        'Error message should include status code'
      );
    });

    it('skips undefined and null parameters', async function () {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ test: 'data' }),
      });

      await makeDetailsApiRequest('/v1/doi/test', {
        param1: undefined,
        param2: null,
        param3: 'valid',
      }, apiKey, baseUrl);

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.has('param1'), false, 'Should skip undefined param');
      assert.strictEqual(url.searchParams.has('param2'), false, 'Should skip null param');
      assert.strictEqual(url.searchParams.get('param3'), 'valid', 'Should include valid param');
    });
  });

  describe('makeExplorerApiRequest', function () {
    const apiKey = 'test_explorer_key';
    const apiSecret = 'test_explorer_secret_key_12345';
    const baseUrl = 'https://www.altmetric.com';

    it('validates API key exists', async function () {
      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', {}, null, apiSecret, baseUrl),
        /ALTMETRIC_EXPLORER_API_KEY is required/,
        'Should reject null API key'
      );

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', {}, undefined, apiSecret, baseUrl),
        /ALTMETRIC_EXPLORER_API_KEY is required/,
        'Should reject undefined API key'
      );

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', {}, '', apiSecret, baseUrl),
        /ALTMETRIC_EXPLORER_API_KEY is required/,
        'Should reject empty string API key'
      );
    });

    it('throws error with status code on API failure', async function () {
      fetchStub.resolves({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, baseUrl),
        /API request failed with status 401/,
        'Error message should include status code'
      );
    });

    it('skips undefined and null filter values', async function () {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await makeExplorerApiRequest('/explorer/api/research_outputs', {
        q: 'test',
        scope: undefined,
        timeframe: null,
        type: ['article'],
      }, apiKey, apiSecret, baseUrl);

      const url = new URL(fetchStub.firstCall.args[0]);
      assert.strictEqual(url.searchParams.has('filter[scope]'), false, 'Should skip undefined filter');
      assert.strictEqual(url.searchParams.has('filter[timeframe]'), false, 'Should skip null filter');
      assert.strictEqual(url.searchParams.get('filter[q]'), 'test', 'Should include valid filter');
    });

    it('always generates digest even with empty filters', async function () {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // With filters
      await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, baseUrl);
      let url = new URL(fetchStub.firstCall.args[0]);
      assert(url.searchParams.has('digest'), 'Should include digest when filters exist');

      fetchStub.resetHistory();
      fetchStub.resolves({
        ok: true,
        json: async () => ({ data: [] }),
      });

      // Without filters
      await makeExplorerApiRequest('/explorer/api/research_outputs', {}, apiKey, apiSecret, baseUrl);
      url = new URL(fetchStub.firstCall.args[0]);
      assert(url.searchParams.has('digest'), 'Should include digest even when no filters');
    });

  });
});
