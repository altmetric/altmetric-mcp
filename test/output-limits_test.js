import assert from 'assert';
import { enforceResultSizeLimit, MAX_RESULT_BYTES } from '../lib/output-limits.js';

const sizeOf = (r) => Buffer.byteLength(JSON.stringify(r), 'utf8');

describe('enforceResultSizeLimit', function () {
  it('returns a small result unchanged, with no truncation note', function () {
    const result = { content: [{ type: 'text', text: 'ok' }], structuredContent: { data: [1, 2, 3] } };
    const out = enforceResultSizeLimit(result);
    assert.deepStrictEqual(out.structuredContent.data, [1, 2, 3]);
    assert.ok(!out.content[0].text.includes('[truncated]'));
  });

  it('drops the included block first when over budget (cheapest to recover)', function () {
    const blob = 'x'.repeat(2000);
    const included = Array.from({ length: 500 }, (_, i) => ({ id: i, blob }));
    const result = { content: [{ type: 'text', text: 'summary' }], structuredContent: { data: [{ id: 1 }], included } };

    const out = enforceResultSizeLimit(result);

    assert.strictEqual(out.structuredContent.included, undefined, 'included should be dropped');
    assert.deepStrictEqual(out.structuredContent.data, [{ id: 1 }], 'data is untouched once included alone gets it under budget');
    assert.ok(out.content[0].text.includes('[truncated]'));
    assert.ok(out.content[0].text.includes('included'));
    assert.ok(sizeOf(out) <= MAX_RESULT_BYTES);
  });

  it('trims the data array from the end when dropping included is not enough', function () {
    const blob = 'y'.repeat(5000);
    const data = Array.from({ length: 400 }, (_, i) => ({ id: i, blob }));
    const result = { content: [{ type: 'text', text: 'summary' }], structuredContent: { data } };

    const out = enforceResultSizeLimit(result);

    assert.ok(out.structuredContent.data.length < 400 && out.structuredContent.data.length >= 1);
    assert.strictEqual(out.structuredContent.data[0].id, 0, 'keeps the earliest items, trims from the end');
    assert.strictEqual(out.structuredContent.meta.truncated, true);
    assert.strictEqual(out.structuredContent.meta.available, 400);
    assert.strictEqual(out.structuredContent.meta.returned, out.structuredContent.data.length);
    assert.ok(sizeOf(out) <= MAX_RESULT_BYTES);
  });

  it('does not discard a successful trim when the appended note/meta lands at the boundary', function () {
    // Fine-grained items so the largest fitting prefix lands within a few bytes
    // of the cap. The meta/note appended after trimming must not flip a good
    // trimmed result into result_too_large (regression: it was being nuked).
    const maxBytes = 8 * 1024;
    const data = Array.from({ length: 1000 }, (_, i) => ({ i, v: 'aaaa' }));
    const result = { content: [{ type: 'text', text: 's' }], structuredContent: { data } };

    const out = enforceResultSizeLimit(result, maxBytes);

    assert.notStrictEqual(out.structuredContent.error, 'result_too_large', 'must keep the trim, not nuke it');
    assert.strictEqual(out.structuredContent.meta.truncated, true);
    assert.ok(out.structuredContent.data.length >= 1);
    assert.ok(sizeOf(out) <= maxBytes);
  });

  it('replaces the payload with an error when a single item still exceeds budget', function () {
    const huge = 'z'.repeat(MAX_RESULT_BYTES + 1000);
    const result = { content: [{ type: 'text', text: 'summary' }], structuredContent: { data: [{ id: 1, blob: huge }] } };

    const out = enforceResultSizeLimit(result);

    assert.strictEqual(out.structuredContent.error, 'result_too_large');
    assert.ok(out.content[0].text.includes('[truncated]'));
    assert.ok(sizeOf(out) <= MAX_RESULT_BYTES);
  });
});
