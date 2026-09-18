import assert from 'node:assert';
import { describe, it } from 'mocha';
import { describeError } from '../lib/log-redact.js';

describe('describeError', () => {
  it('keeps the API key out of a message that quotes the request URL', () => {
    // Not the shape Node's own fetch rejection takes - that is a bare 'fetch failed', with
    // the detail on error.cause. This covers any error that does quote the URL, since the
    // Details Page key travels as ?key=...
    const error = new TypeError(
      'request to https://api.altmetric.com/v1/fetch/doi/10.1038/x?key=live-secret-key failed'
    );

    const line = describeError(error);

    assert.ok(!line.includes('live-secret-key'), line);
    assert.match(line, /type=TypeError/);
  });

  it('redacts an inline credential that is not in a query string', () => {
    const line = describeError(new Error('Authorization: Bearer abc.def.ghi rejected'));

    assert.ok(!line.includes('abc.def.ghi'), line);
  });

  it('digests the original message, so the same failure correlates across reports', () => {
    const first = describeError(new Error('Upstream response too large'));
    const second = describeError(new Error('Upstream response too large'));

    assert.strictEqual(first, second);
    assert.match(first, /message_sha256_prefix=[0-9a-f]{16}/);
  });

  it('handles a thrown non-Error without losing the record', () => {
    assert.match(describeError('plain string failure'), /type=unknown/);
  });

  it('caps a long message rather than writing it whole', () => {
    const line = describeError(new Error('x'.repeat(1000)));

    assert.ok(line.length < 500, `length ${line.length}`);
  });
});
