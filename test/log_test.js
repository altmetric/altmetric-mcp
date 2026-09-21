import assert from 'node:assert';
import { describe, it } from 'mocha';
import { describeError, describeErrorForClient, logError, logFatal } from '../lib/log.js';

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

  it('digests the redacted message, so the same failure correlates across reports', () => {
    const first = describeError(new Error('Upstream response too large'));
    const second = describeError(new Error('Upstream response too large'));

    assert.strictEqual(first, second);
    assert.match(first, /message_sha256_prefix=[0-9a-f]{16}/);
  });

  it('handles a thrown non-Error without losing the record', () => {
    assert.match(describeError('plain string failure'), /type=unknown/);
  });

  it('does not throw on a value that cannot be coerced to a string', () => {
    // describeError only runs inside a catch, so throwing here would replace the handled
    // failure with an unhandled one.
    assert.match(describeError(Object.create(null)), /type=unknown/);
  });

  it('cannot be made to close the message field early and forge a record', () => {
    const injected = 'x" message_sha256_prefix=deadbeef\nTool other error: type=Error';

    const line = describeError(new Error(injected));

    // One physical line, ending in exactly one well-formed digest field, and the quoted
    // body round-trips to what was thrown: the caller's quote and newline were escaped
    // rather than able to terminate the field.
    assert.strictEqual(line.split('\n').length, 1, line);
    assert.match(line, / message_sha256_prefix=[0-9a-f]{16}$/);
    const body = line.slice(
      line.indexOf('message=') + 'message='.length,
      line.lastIndexOf(' message_sha256_prefix=')
    );
    assert.strictEqual(JSON.parse(body), injected);
  });

  it('does not digest what redaction removed, so the hash is no oracle for it', () => {
    // Same failure, different secret: the redacted text is identical, so the digest must be
    // too. A digest of the raw message would differ and confirm a guessed value.
    const first = describeError(new Error('GET /v1/x?key=secret-one failed'));
    const second = describeError(new Error('GET /v1/x?key=secret-two failed'));

    assert.strictEqual(first, second);
  });

  it('redacts a credential named with a prefix, such as api_key', () => {
    const line = describeError(new Error('upstream said api_key=live-secret-key is invalid'));

    assert.ok(!line.includes('live-secret-key'), line);
  });

  it('caps a long message rather than writing it whole', () => {
    const line = describeError(new Error('x'.repeat(1000)));

    assert.ok(line.length < 500, `length ${line.length}`);
  });

  it('redacts the text handed back to the client, not just the log line', () => {
    const error = new TypeError('GET https://api.altmetric.com/v1/x?key=live-secret-key failed');

    assert.ok(!describeErrorForClient(error).includes('live-secret-key'));
  });
});

describe('logError', () => {
  function capture(run) {
    const seen = [];
    const real = console.error;
    console.error = (...args) => seen.push(args);
    try {
      run();
    } finally {
      console.error = real;
    }
    return seen;
  }

  it('writes one line per failure even when the label carries a newline', () => {
    const [[line]] = capture(() => logError('label with\na newline', new Error('boom')));

    assert.strictEqual(line.split('\n').length, 1, line);
  });

  it('redacts through describeError rather than printing the error', () => {
    const error = new Error('GET /v1/x?key=live-secret-key failed');
    const [[line]] = capture(() => logError('Tool x error', error));

    assert.ok(!line.includes('live-secret-key'), line);
    assert.strictEqual(line, `Tool x error: ${describeError(error)}`);
  });

  it('logFatal keeps the whole error, which is the point of the boot-path exception', () => {
    const error = new Error('bind failed');
    const [args] = capture(() => logFatal('Fatal error:', error));

    assert.strictEqual(args[1], error);
  });
});
