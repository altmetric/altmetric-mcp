import assert from 'assert';
import { createExplorerBroker, UnauthorizedError } from '../lib/credentials/explorer-broker.js';

const baseUrl = 'https://explorer.example.com';

function okResponse(body) {
  return { status: 200, ok: true, json: async () => body };
}

function status(code) {
  return { status: code, ok: code >= 200 && code < 300, json: async () => ({ error: 'x' }) };
}

describe('explorer-broker', function () {
  it('returns api_key/api_secret from the broker response', async function () {
    const broker = createExplorerBroker({
      baseUrl,
      fetchImpl: async () => okResponse({ api_key: 'k', api_secret: 's-1234567890' }),
    });
    assert.deepStrictEqual(await broker.get('tok'), { apiKey: 'k', apiSecret: 's-1234567890' });
  });

  it('sends the bearer to the broker credentials endpoint', async function () {
    let seen;
    const broker = createExplorerBroker({
      baseUrl,
      fetchImpl: async (url, opts) => { seen = { url, opts }; return okResponse({ api_key: 'k', api_secret: 's' }); },
    });
    await broker.get('tok');
    assert.strictEqual(seen.url, 'https://explorer.example.com/explorer/oauth/credentials/explorer');
    assert.strictEqual(seen.opts.headers.Authorization, 'Bearer tok');
  });

  it('caches by token: one network call within TTL', async function () {
    let calls = 0;
    const broker = createExplorerBroker({ baseUrl, fetchImpl: async () => { calls++; return okResponse({ api_key: 'k', api_secret: 's' }); } });
    await broker.get('tok');
    await broker.get('tok');
    assert.strictEqual(calls, 1);
    assert.strictEqual(broker.cacheSize(), 1);
  });

  it('caches distinct tokens independently', async function () {
    let calls = 0;
    const broker = createExplorerBroker({ baseUrl, fetchImpl: async () => { calls++; return okResponse({ api_key: 'k', api_secret: 's' }); } });
    await broker.get('a');
    await broker.get('b');
    assert.strictEqual(calls, 2);
    assert.strictEqual(broker.cacheSize(), 2);
  });

  it('re-fetches after the TTL expires', async function () {
    let calls = 0;
    let clock = 1000;
    const broker = createExplorerBroker({ baseUrl, ttlMs: 100, now: () => clock, fetchImpl: async () => { calls++; return okResponse({ api_key: 'k', api_secret: 's' }); } });
    await broker.get('tok'); // network call 1, expires at 1100
    clock = 1050;
    await broker.get('tok'); // cache hit
    assert.strictEqual(calls, 1);
    clock = 1200; // past expiry
    await broker.get('tok'); // network call 2
    assert.strictEqual(calls, 2);
  });

  it('throws UnauthorizedError on 401 and caches nothing', async function () {
    const broker = createExplorerBroker({ baseUrl, fetchImpl: async () => status(401) });
    await assert.rejects(() => broker.get('tok'), UnauthorizedError);
    assert.strictEqual(broker.cacheSize(), 0);
  });

  it('throws UnauthorizedError on 403', async function () {
    const broker = createExplorerBroker({ baseUrl, fetchImpl: async () => status(403) });
    await assert.rejects(() => broker.get('tok'), UnauthorizedError);
  });

  it('evicts a previously-cached token once it starts being rejected', async function () {
    let revoked = false;
    const broker = createExplorerBroker({
      baseUrl,
      ttlMs: 0, // force a re-fetch each call
      fetchImpl: async () => (revoked ? status(401) : okResponse({ api_key: 'k', api_secret: 's' })),
    });
    await broker.get('tok');
    revoked = true;
    await assert.rejects(() => broker.get('tok'), UnauthorizedError);
    assert.strictEqual(broker.cacheSize(), 0);
  });

  it('throws on a missing token', async function () {
    const broker = createExplorerBroker({ baseUrl, fetchImpl: async () => okResponse({}) });
    await assert.rejects(() => broker.get(''), UnauthorizedError);
  });

  it('throws when the broker response omits credentials', async function () {
    const broker = createExplorerBroker({ baseUrl, fetchImpl: async () => okResponse({ api_key: 'k' }) });
    await assert.rejects(() => broker.get('tok'), /missing api_key\/api_secret/);
  });
});
