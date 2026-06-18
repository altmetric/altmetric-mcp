import assert from 'assert';
import {
  validateFilterValue,
  MAX_STRING_LEN,
  MAX_ARRAY_LEN,
  MAX_ARRAY_ELEMENT_LEN,
  MAX_PAGE_SIZE,
  MAX_PAGE_NUMBER,
} from '../lib/filter-validators.js';

const NUL = String.fromCharCode(0x00);
const DEL = String.fromCharCode(0x7f);

describe('validateFilterValue', function () {
  describe('null / undefined / valid normal inputs', function () {
    it('accepts null and undefined as no-ops', function () {
      assert.doesNotThrow(() => validateFilterValue('q', null));
      assert.doesNotThrow(() => validateFilterValue('q', undefined));
    });

    it('accepts typical search queries', function () {
      assert.doesNotThrow(() => validateFilterValue('q', 'climate change'));
      assert.doesNotThrow(() => validateFilterValue('title', 'A Title with Unicode é 中文'));
    });

    it('accepts typical arrays', function () {
      assert.doesNotThrow(() => validateFilterValue('type', ['article', 'dataset']));
      assert.doesNotThrow(() => validateFilterValue('countries', ['US', 'GB', 'IT']));
      assert.doesNotThrow(() => validateFilterValue('researcher_id', ['ur.015071462574.28']));
      assert.doesNotThrow(() => validateFilterValue('grant_id', ['grant.13864430']));
    });

    it('accepts typical pagination', function () {
      assert.doesNotThrow(() => validateFilterValue('page_size', 25));
      assert.doesNotThrow(() => validateFilterValue('page_number', 1));
    });
  });

  describe('dates', function () {
    it('accepts YYYY-MM-DD', function () {
      assert.doesNotThrow(() => validateFilterValue('published_after', '2024-01-15'));
      assert.doesNotThrow(() => validateFilterValue('mentioned_before', '2026-05-25'));
    });

    it('rejects non-string date', function () {
      assert.throws(
        () => validateFilterValue('published_after', 20240115),
        /Invalid published_after: expected YYYY-MM-DD/
      );
    });

    it('rejects wrong format', function () {
      assert.throws(
        () => validateFilterValue('published_before', '2024/01/15'),
        /Invalid published_before: expected YYYY-MM-DD/
      );
      assert.throws(
        () => validateFilterValue('mentioned_after', 'Jan 1, 2024'),
        /Invalid mentioned_after: expected YYYY-MM-DD/
      );
    });

    it('rejects impossible calendar dates', function () {
      assert.throws(
        () => validateFilterValue('published_after', '2024-13-45'),
        /not a valid calendar date/
      );
    });
  });

  describe('integers (page_size, page_number)', function () {
    it('rejects non-integer page_size', function () {
      assert.throws(
        () => validateFilterValue('page_size', '25'),
        /expected an integer/
      );
      assert.throws(
        () => validateFilterValue('page_size', 25.5),
        /expected an integer/
      );
    });

    it('rejects page_size out of range', function () {
      assert.throws(
        () => validateFilterValue('page_size', 0),
        /must be between 1 and 100/
      );
      assert.throws(
        () => validateFilterValue('page_size', MAX_PAGE_SIZE + 1),
        /must be between 1 and 100/
      );
    });

    it('rejects page_number out of range', function () {
      assert.throws(
        () => validateFilterValue('page_number', 0),
        /must be between 1 and 100000/
      );
      assert.throws(
        () => validateFilterValue('page_number', MAX_PAGE_NUMBER + 1),
        /must be between 1 and 100000/
      );
    });
  });

  describe('arrays', function () {
    it('rejects non-arrays for array keys', function () {
      assert.throws(
        () => validateFilterValue('type', 'article'),
        /expected an array/
      );
      assert.throws(
        () => validateFilterValue('researcher_id', 'ur.015071462574.28'),
        /expected an array/
      );
      assert.throws(
        () => validateFilterValue('grant_id', 'grant.13864430'),
        /expected an array/
      );
    });

    it('rejects arrays that are too long', function () {
      const tooMany = new Array(MAX_ARRAY_LEN + 1).fill('x');
      assert.throws(
        () => validateFilterValue('type', tooMany),
        /array exceeds maximum length/
      );
    });

    it('rejects non-string array elements', function () {
      assert.throws(
        () => validateFilterValue('type', ['article', 42]),
        /array elements must be strings/
      );
    });

    it('rejects oversized array elements', function () {
      assert.throws(
        () => validateFilterValue('journal_id', ['ok', 'x'.repeat(MAX_ARRAY_ELEMENT_LEN + 1)]),
        /array element exceeds maximum length/
      );
    });

    it('rejects array elements containing control characters', function () {
      assert.throws(
        () => validateFilterValue('type', ['article', 'a' + NUL + 'b']),
        /contains control characters/
      );
    });
  });

  describe('strings', function () {
    it('rejects oversized strings', function () {
      assert.throws(
        () => validateFilterValue('q', 'x'.repeat(MAX_STRING_LEN + 1)),
        /string exceeds maximum length/
      );
    });

    it('rejects strings with control characters (NUL)', function () {
      assert.throws(
        () => validateFilterValue('q', 'climate' + NUL + 'change'),
        /contains control characters/
      );
    });

    it('rejects strings with control characters (DEL)', function () {
      assert.throws(
        () => validateFilterValue('title', 'something' + DEL + 'else'),
        /contains control characters/
      );
    });

    it('coerces numeric IDs to strings and validates length', function () {
      // identifier_list_id passed as a number - coerced and accepted
      assert.doesNotThrow(() => validateFilterValue('identifier_list_id', 12345));
    });
  });
});
