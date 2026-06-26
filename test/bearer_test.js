import assert from 'assert';
import { extractBearer, bearerAuth } from '../lib/middleware/bearer.js';
import { UnauthorizedError } from '../lib/credentials/broker.js';

const resourceMetadataUrl = 'https://mcp.example.com/.well-known/oauth-protected-resource';

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('extractBearer', function () {
  it('extracts the token from a Bearer header', function () {
    assert.strictEqual(extractBearer('Bearer abc123'), 'abc123');
  });

  it('is case-insensitive on the scheme', function () {
    assert.strictEqual(extractBearer('bearer abc'), 'abc');
  });

  it('returns null for missing or non-Bearer headers', function () {
    assert.strictEqual(extractBearer(undefined), null);
    assert.strictEqual(extractBearer(''), null);
    assert.strictEqual(extractBearer('Basic xyz'), null);
  });
});

describe('bearerAuth middleware', function () {
  it('401s with a discovery WWW-Authenticate header when no token is present', async function () {
    const mw = bearerAuth({ validate: async () => ({}), resourceMetadataUrl });
    const res = fakeRes();
    let nexted = false;
    await mw({ headers: {} }, res, () => { nexted = true; });

    assert.strictEqual(nexted, false);
    assert.strictEqual(res.statusCode, 401);
    assert.match(res.headers['WWW-Authenticate'], /resource_metadata="https:\/\/mcp\.example\.com/);
    // RFC 6750 §3.1: no error code when the request simply lacks credentials.
    assert.ok(!/error=/.test(res.headers['WWW-Authenticate']));
  });

  it('401s with invalid_token when validation rejects the token', async function () {
    const mw = bearerAuth({ validate: async () => { throw new UnauthorizedError('nope'); }, resourceMetadataUrl });
    const res = fakeRes();
    let nexted = false;
    await mw({ headers: { authorization: 'Bearer bad' } }, res, () => { nexted = true; });

    assert.strictEqual(nexted, false);
    assert.strictEqual(res.statusCode, 401);
    assert.match(res.headers['WWW-Authenticate'], /error="invalid_token"/);
  });

  it('attaches token + principal and calls next on success', async function () {
    const mw = bearerAuth({ validate: async (token) => ({ sub: 'u1', token }), resourceMetadataUrl });
    const req = { headers: { authorization: 'Bearer good' } };
    const res = fakeRes();
    let nexted = false;
    await mw(req, res, () => { nexted = true; });

    assert.strictEqual(nexted, true);
    assert.strictEqual(req.bearerToken, 'good');
    assert.deepStrictEqual(req.principal, { sub: 'u1', token: 'good' });
    assert.strictEqual(res.statusCode, null);
  });

  it('forwards unexpected (non-Unauthorized) errors to next', async function () {
    const boom = new Error('boom');
    const mw = bearerAuth({ validate: async () => { throw boom; }, resourceMetadataUrl });
    const res = fakeRes();
    let forwarded = null;
    await mw({ headers: { authorization: 'Bearer x' } }, res, (err) => { forwarded = err; });

    assert.strictEqual(forwarded, boom);
    assert.strictEqual(res.statusCode, null);
  });
});
