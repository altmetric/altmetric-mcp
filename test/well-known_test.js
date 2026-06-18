import assert from 'assert';
import { protectedResourceMetadata } from '../lib/http/well-known.js';

describe('protectedResourceMetadata (RFC 9728)', function () {
  it('advertises the resource and its authorization server', function () {
    const doc = protectedResourceMetadata({
      resource: 'https://mcp.example.com',
      authorizationServers: ['https://explorer.example.com'],
    });

    assert.strictEqual(doc.resource, 'https://mcp.example.com');
    assert.deepStrictEqual(doc.authorization_servers, ['https://explorer.example.com']);
    assert.deepStrictEqual(doc.scopes_supported, ['explorer']);
    assert.deepStrictEqual(doc.bearer_methods_supported, ['header']);
  });

  it('allows overriding the advertised scopes', function () {
    const doc = protectedResourceMetadata({
      resource: 'https://m',
      authorizationServers: ['https://a'],
      scopes: ['explorer', 'details-page'],
    });

    assert.deepStrictEqual(doc.scopes_supported, ['explorer', 'details-page']);
  });
});
