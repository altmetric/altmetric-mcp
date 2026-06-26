import assert from 'assert';
import { createCredentialsBroker, UnauthorizedError } from '../lib/credentials/broker.js';

const baseUrl = 'https://explorer.example.com';
const path = '/explorer/oauth/credentials/mcp';

function okResponse(body) {
  return { status: 200, ok: true, json: async () => body };
}

function status(code) {
  return { status: code, ok: code >= 200 && code < 300, json: async () => ({ error: 'x' }) };
}

function makeBroker(overrides = {}) {
  return createCredentialsBroker({ baseUrl, path, extract: (body) => body, ...overrides });
}

describe('credentials-broker', function () {
  it('returns the extracted body from a 200', async function () {
    const broker = makeBroker({ fetchImpl: async () => okResponse({ explorer: { api_key: 'k', api_secret: 's' } }) });
    assert.deepStrictEqual(await broker.get('tok'), { explorer: { api_key: 'k', api_secret: 's' } });
  });

  it('sends the bearer to the configured path', async function () {
    let seen;
    const broker = makeBroker({ fetchImpl: async (url, opts) => { seen = { url, opts }; return okResponse({}); } });
    await broker.get('tok');
    assert.strictEqual(seen.url, 'https://explorer.example.com/explorer/oauth/credentials/mcp');
    assert.strictEqual(seen.opts.headers.Authorization, 'Bearer tok');
  });

  it('caches by token: one network call within TTL', async function () {
    let calls = 0;
    const broker = makeBroker({ fetchImpl: async () => { calls++; return okResponse({}); } });
    await broker.get('tok');
    await broker.get('tok');
    assert.strictEqual(calls, 1);
    assert.strictEqual(broker.cacheSize(), 1);
  });

  it('caches distinct tokens independently', async function () {
    let calls = 0;
    const broker = makeBroker({ fetchImpl: async () => { calls++; return okResponse({}); } });
    await broker.get('a');
    await broker.get('b');
    assert.strictEqual(calls, 2);
    assert.strictEqual(broker.cacheSize(), 2);
  });

  it('re-fetches after the TTL expires', async function () {
    let calls = 0;
    let clock = 1000;
    const broker = makeBroker({ ttlMs: 100, now: () => clock, fetchImpl: async () => { calls++; return okResponse({}); } });
    await broker.get('tok'); // network call 1, expires at 1100
    clock = 1050;
    await broker.get('tok'); // cache hit
    assert.strictEqual(calls, 1);
    clock = 1200; // past expiry
    await broker.get('tok'); // network call 2
    assert.strictEqual(calls, 2);
  });

  it('throws UnauthorizedError on 401 and caches nothing', async function () {
    const broker = makeBroker({ fetchImpl: async () => status(401) });
    await assert.rejects(() => broker.get('tok'), UnauthorizedError);
    assert.strictEqual(broker.cacheSize(), 0);
  });

  it('throws UnauthorizedError on 403', async function () {
    const broker = makeBroker({ fetchImpl: async () => status(403) });
    await assert.rejects(() => broker.get('tok'), UnauthorizedError);
  });

  it('honours a custom unauthorizedStatuses set', async function () {
    const broker = makeBroker({ unauthorizedStatuses: [401, 403, 404], fetchImpl: async () => status(404) });
    await assert.rejects(() => broker.get('tok'), UnauthorizedError);
  });

  it('throws a non-UnauthorizedError on other non-2xx', async function () {
    const broker = makeBroker({ fetchImpl: async () => status(500) });
    await assert.rejects(() => broker.get('tok'), (err) => !(err instanceof UnauthorizedError) && /500/.test(err.message));
  });

  it('throws on a missing token', async function () {
    const broker = makeBroker({ fetchImpl: async () => okResponse({}) });
    await assert.rejects(() => broker.get(''), UnauthorizedError);
  });

  it('propagates an extract failure (contract drift)', async function () {
    const broker = makeBroker({ extract: () => { throw new Error('bad shape'); }, fetchImpl: async () => okResponse({}) });
    await assert.rejects(() => broker.get('tok'), /bad shape/);
  });
});
