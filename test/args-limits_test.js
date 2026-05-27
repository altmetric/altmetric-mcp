import assert from 'assert';
import { assertArgsWithinLimits, MAX_ARGS_BYTES, MAX_ARG_STRING_BYTES } from '../lib/args-limits.js';

describe('assertArgsWithinLimits', function () {
  it('accepts undefined or null args', function () {
    assert.doesNotThrow(() => assertArgsWithinLimits(undefined));
    assert.doesNotThrow(() => assertArgsWithinLimits(null));
  });

  it('accepts normal-sized args', function () {
    assert.doesNotThrow(() => assertArgsWithinLimits({ q: 'climate change', type: ['article'] }));
  });

  it('rejects args whose serialized form exceeds the total cap', function () {
    // Build many fields just under the per-string cap that together exceed
    // the 8 MB total cap. Each field is 60 KB × 200 fields ~= 12 MB.
    const bigArgs = {};
    for (let i = 0; i < 200; i++) {
      bigArgs[`field_${i}`] = 'x'.repeat(60 * 1024);
    }
    assert.throws(
      () => assertArgsWithinLimits(bigArgs),
      /Tool arguments exceed maximum allowed size/
    );
  });

  it('accepts a 100,000-element identifier array (translate_identifiers documented limit)', function () {
    const args = { identifiers: new Array(100_000).fill('10.1234/example.identifier') };
    assert.doesNotThrow(() => assertArgsWithinLimits(args));
  });

  it('rejects a single string field that exceeds the per-string cap', function () {
    const args = { q: 'x'.repeat(MAX_ARG_STRING_BYTES + 1) };
    assert.throws(
      () => assertArgsWithinLimits(args),
      /Tool argument string exceeds maximum allowed size/
    );
  });

  it('rejects oversized strings nested inside arrays', function () {
    const args = { type: ['article', 'x'.repeat(MAX_ARG_STRING_BYTES + 1)] };
    assert.throws(
      () => assertArgsWithinLimits(args),
      /Tool argument string exceeds maximum allowed size/
    );
  });

  it('rejects oversized strings nested inside nested objects', function () {
    const args = { meta: { description: 'x'.repeat(MAX_ARG_STRING_BYTES + 1) } };
    assert.throws(
      () => assertArgsWithinLimits(args),
      /Tool argument string exceeds maximum allowed size/
    );
  });

  it('accepts strings exactly at the per-string cap', function () {
    const args = { q: 'x'.repeat(MAX_ARG_STRING_BYTES) };
    assert.doesNotThrow(() => assertArgsWithinLimits(args));
  });

  it('exposes sensible default limits', function () {
    assert.strictEqual(MAX_ARGS_BYTES, 8 * 1024 * 1024);
    assert.strictEqual(MAX_ARG_STRING_BYTES, 64 * 1024);
  });
});
