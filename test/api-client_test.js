import assert from 'assert';
import sinon from 'sinon';
import crypto from 'crypto';
import {
  generateExplorerDigest,
  generateIdentifierListDigest,
  makeDetailsApiRequest,
  makeExplorerApiRequest,
  makeExplorerIdentifierListRequest,
  MAX_RESPONSE_BYTES,
} from '../lib/api-client.js';

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

    it('strips dashes from the secret before signing (Explorer verifies with dashes removed)', function () {
      const uuidSecret = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const dashFree = uuidSecret.replace(/-/g, '');
      const filters = { q: 'climate' };
      // Explorer signs with the dash-stripped secret; the MCP must produce the same digest.
      const expected = crypto.createHmac('sha1', dashFree).update('q|climate').digest('hex');

      assert.strictEqual(generateExplorerDigest(filters, uuidSecret), expected);
      // A UUID secret and its dash-free form must sign identically.
      assert.strictEqual(generateExplorerDigest(filters, uuidSecret), generateExplorerDigest(filters, dashFree));
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
        /Not found: no research output matches that identifier or query/,
        'Error message should include status code'
      );
    });

    it('skips undefined and null parameters', async function () {
      fetchStub.resolves({
        ok: true,
        text: async () => JSON.stringify({ test: 'data' }),
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
        /Unauthorized: invalid API key/,
        'Error message should include status code'
      );
    });

    it('surfaces a structured JSON:API error (title/detail/code) instead of a bare status', async function () {
      fetchStub.resolves({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          meta: { response: { status: 'error' } },
          errors: [{ status: '400', code: 'no_api_access', title: 'API access not allowed', detail: 'Your organisation does not have API access' }],
        }),
      });

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, baseUrl),
        /API access not allowed: Your organisation does not have API access \(no_api_access\) \[HTTP 400\]/,
      );
    });

    it('falls back to the generic message and does not leak a non-structured error body', async function () {
      fetchStub.resolves({
        ok: false,
        status: 500,
        text: async () => 'internal-host-10.0.0.5 leaked-key=supersecret',
      });

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, baseUrl),
        (err) => {
          assert.ok(!err.message.includes('supersecret'), 'raw error body must not be surfaced');
          assert.match(err.message, /API request failed \(HTTP 500\)/);
          return true;
        },
      );
    });

    it('skips undefined and null filter values', async function () {
      fetchStub.resolves({
        ok: true,
        text: async () => JSON.stringify({ data: [] }),
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
        text: async () => JSON.stringify({ data: [] }),
      });

      // With filters
      await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, baseUrl);
      let url = new URL(fetchStub.firstCall.args[0]);
      assert(url.searchParams.has('digest'), 'Should include digest when filters exist');

      fetchStub.resetHistory();
      fetchStub.resolves({
        ok: true,
        text: async () => JSON.stringify({ data: [] }),
      });

      // Without filters
      await makeExplorerApiRequest('/explorer/api/research_outputs', {}, apiKey, apiSecret, baseUrl);
      url = new URL(fetchStub.firstCall.args[0]);
      assert(url.searchParams.has('digest'), 'Should include digest even when no filters');
    });

  });

  describe('generateIdentifierListDigest', function () {
    const secret = 'this-is-a-valid-secret-key';
    const identifiers = '10.1038/nplants.2015.3\naltmetric:12345';

    it('HMAC-SHA1s the raw identifiers string with the hyphen-stripped secret', function () {
      const expected = crypto
        .createHmac('sha1', secret.replace(/-/g, ''))
        .update(identifiers)
        .digest('hex');
      assert.strictEqual(generateIdentifierListDigest(identifiers, secret), expected);
    });

    it('strips hyphens from the secret (hyphenated and de-hyphenated secrets match)', function () {
      assert.strictEqual(
        generateIdentifierListDigest(identifiers, 'abc-def-ghij-klmno-pqrs'),
        generateIdentifierListDigest(identifiers, 'abcdefghijklmnopqrs'),
      );
    });

    it('differs from the raw-secret HMAC (proves hyphens are stripped)', function () {
      const withHyphens = crypto.createHmac('sha1', secret).update(identifiers).digest('hex');
      assert.notStrictEqual(generateIdentifierListDigest(identifiers, secret), withHyphens);
    });

    it('does not collide with the standard Explorer digest convention', function () {
      assert.notStrictEqual(
        generateIdentifierListDigest(identifiers, secret),
        generateExplorerDigest({ q: identifiers }, secret),
      );
    });

    it('validates secret is at least 16 characters', function () {
      assert.throws(
        () => generateIdentifierListDigest(identifiers, 'short'),
        /ALTMETRIC_EXPLORER_API_SECRET must be at least 16 characters/,
      );
    });
  });

  describe('makeExplorerIdentifierListRequest', function () {
    const apiKey = 'test_explorer_key';
    const apiSecret = 'test_explorer_secret_key_12345';
    const baseUrl = 'https://www.altmetric.com';
    const identifiers = '10.1038/nplants.2015.3\naltmetric:12345';

    it('validates API key exists', async function () {
      await assert.rejects(
        async () => await makeExplorerIdentifierListRequest(identifiers, null, apiSecret, baseUrl),
        /ALTMETRIC_EXPLORER_API_KEY is required/,
      );
    });

    it('POSTs a form-encoded body and signs the raw identifiers string', async function () {
      fetchStub.resolves({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'abc', counts: { dois: 1, altmetric_ids: 1 } } }),
      });

      await makeExplorerIdentifierListRequest(identifiers, apiKey, apiSecret, baseUrl);

      const [calledUrl, options] = fetchStub.firstCall.args;
      const url = new URL(calledUrl);
      assert.strictEqual(url.pathname, '/explorer/api/identifier_lists');
      assert.strictEqual(url.searchParams.has('identifiers'), false, 'identifiers must not be in the query string');
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.ok(options.signal, 'must pass an AbortSignal');

      const body = new URLSearchParams(options.body);
      assert.strictEqual(body.get('key'), apiKey);
      assert.strictEqual(body.get('identifiers'), identifiers, 'newline-separated identifiers survive the body round-trip');
      assert.strictEqual(body.get('digest'), generateIdentifierListDigest(identifiers, apiSecret));
    });

    it('throws error with status code on API failure', async function () {
      fetchStub.resolves({ ok: false, status: 401, text: async () => 'Unauthorized' });
      await assert.rejects(
        async () => await makeExplorerIdentifierListRequest(identifiers, apiKey, apiSecret, baseUrl),
        /Unauthorized: invalid API key/,
      );
    });

    it('rejects non-https baseUrl', async function () {
      await assert.rejects(
        async () => await makeExplorerIdentifierListRequest(identifiers, apiKey, apiSecret, 'http://www.altmetric.com'),
        /Only https URLs are permitted/,
      );
      assert.strictEqual(fetchStub.callCount, 0, 'must not issue an http request');
    });
  });

  describe('outbound HTTP hardening', function () {
    const apiKey = 'test_api_key';
    const apiSecret = 'test_explorer_secret_key_12345';

    it('passes an AbortSignal to fetch (Details API)', async function () {
      fetchStub.resolves({ ok: true, text: async () => '{}' });
      await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'https://api.altmetric.com');
      const [, options] = fetchStub.firstCall.args;
      assert.ok(options.signal, 'fetch must be invoked with a signal');
      assert.ok(typeof options.signal.aborted === 'boolean', 'signal must be an AbortSignal');
    });

    it('passes an AbortSignal to fetch (Explorer API)', async function () {
      fetchStub.resolves({ ok: true, text: async () => '{}' });
      await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, 'https://www.altmetric.com');
      const [, options] = fetchStub.firstCall.args;
      assert.ok(options.signal, 'fetch must be invoked with a signal');
    });

    it('does not pass redirect: "error" so Altmetric POST 307s can be followed', async function () {
      // Altmetric routes POSTs via Cloudflare with a 307 redirect to a
      // different subdomain; refusing redirects breaks translate_identifiers
      // and get_batch_attention_data. URL pinning is still enforced by the
      // hardcoded base URL plus TLS verification of the responding host.
      fetchStub.resolves({ ok: true, text: async () => '{}' });
      await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'https://api.altmetric.com');
      const [, options] = fetchStub.firstCall.args;
      assert.notStrictEqual(options.redirect, 'error',
        'must allow upstream redirects so /v1/translate-style 307s work');
    });

    it('rejects non-https baseUrl (Details API)', async function () {
      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'http://api.altmetric.com'),
        /Only https URLs are permitted/
      );
      assert.strictEqual(fetchStub.callCount, 0, 'must not issue an http request');
    });

    it('rejects non-https baseUrl (Explorer API)', async function () {
      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, 'http://www.altmetric.com'),
        /Only https URLs are permitted/
      );
      assert.strictEqual(fetchStub.callCount, 0, 'must not issue an http request');
    });
  });

  describe('response size cap', function () {
    const apiKey = 'test_api_key';
    const apiSecret = 'test_explorer_secret_key_12345';

    function mockHeaders(headers = {}) {
      return { get: (k) => headers[k.toLowerCase()] ?? null };
    }

    it('rejects when Content-Length header exceeds the cap (Details API)', async function () {
      fetchStub.resolves({
        ok: true,
        headers: mockHeaders({ 'content-length': String(MAX_RESPONSE_BYTES + 1) }),
        text: async () => { throw new Error('text() should not be called when content-length already exceeds cap'); },
      });

      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'https://api.altmetric.com'),
        /Upstream response too large/
      );
    });

    it('rejects when actual body length exceeds the cap (Details API)', async function () {
      // Upstream lies about (or omits) Content-Length but the body is oversized.
      fetchStub.resolves({
        ok: true,
        headers: mockHeaders(),
        text: async () => 'x'.repeat(MAX_RESPONSE_BYTES + 1),
      });

      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'https://api.altmetric.com'),
        /Upstream response too large/
      );
    });

    it('rejects oversized Explorer responses', async function () {
      fetchStub.resolves({
        ok: true,
        headers: mockHeaders(),
        text: async () => 'x'.repeat(MAX_RESPONSE_BYTES + 1),
      });

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, 'https://www.altmetric.com'),
        /Upstream response too large/
      );
    });

    it('accepts responses at or below the cap', async function () {
      const payload = JSON.stringify({ ok: true, padding: 'x'.repeat(1024) });
      fetchStub.resolves({
        ok: true,
        headers: mockHeaders({ 'content-length': String(payload.length) }),
        text: async () => payload,
      });

      const result = await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'https://api.altmetric.com');
      assert.strictEqual(result.ok, true);
    });
  });

  describe('stderr scrubbing', function () {
    const apiKey = 'test_api_key';
    const apiSecret = 'test_explorer_secret_key_12345';
    let consoleErrorStub;

    beforeEach(function () {
      consoleErrorStub = sinon.stub(console, 'error');
    });

    afterEach(function () {
      consoleErrorStub.restore();
    });

    it('does not log raw upstream error body for Details API', async function () {
      const sentinel = 'sk_live_FAKE_LEAKED_TOKEN_xyz';
      fetchStub.resolves({
        ok: false,
        status: 500,
        text: async () => `internal error: token=${sentinel} host=10.0.0.5`,
      });

      await assert.rejects(
        async () => await makeDetailsApiRequest('/v1/doi/test', {}, apiKey, 'https://api.altmetric.com'),
      );

      const allLogs = consoleErrorStub.getCalls().map(c => c.args.join(' ')).join('\n');
      assert.ok(!allLogs.includes(sentinel), 'leaked sentinel string must not appear in stderr');
      assert.ok(!allLogs.includes('10.0.0.5'), 'internal IP must not appear in stderr');
      assert.match(allLogs, /body_sha256_prefix=[a-f0-9]{16}/, 'must log a body hash prefix');
      assert.match(allLogs, /status=500/, 'must log the status');
    });

    it('does not log raw upstream error body for Explorer API', async function () {
      const sentinel = 'sk_live_EXPLORER_FAKE_TOKEN_xyz';
      fetchStub.resolves({
        ok: false,
        status: 502,
        text: async () => `backend error: ${sentinel}`,
      });

      await assert.rejects(
        async () => await makeExplorerApiRequest('/explorer/api/research_outputs', { q: 'test' }, apiKey, apiSecret, 'https://www.altmetric.com'),
      );

      const allLogs = consoleErrorStub.getCalls().map(c => c.args.join(' ')).join('\n');
      assert.ok(!allLogs.includes(sentinel), 'leaked sentinel string must not appear in stderr');
      assert.match(allLogs, /body_sha256_prefix=[a-f0-9]{16}/, 'must log a body hash prefix');
    });
  });
});
