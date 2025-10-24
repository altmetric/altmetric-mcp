import assert from 'assert';
import { validateIdentifier } from '../lib/validators.js';

describe('Identifier Validation', function () {
  describe('Altmetric ID validation (our implementation)', function () {
    it('accepts valid numeric IDs', function () {
      assert.doesNotThrow(() => {
        validateIdentifier('123456', 'id');
        validateIdentifier('1', 'id');
        validateIdentifier('116132730', 'id');
      });
    });

    it('rejects non-numeric IDs', function () {
      assert.throws(
        () => validateIdentifier('abc123', 'id'),
        /Invalid Altmetric ID format.*Must be numeric/
      );
    });

    it('rejects IDs with special characters', function () {
      assert.throws(
        () => validateIdentifier('123-456', 'id'),
        /Invalid Altmetric ID format.*Must be numeric/
      );
    });

    it('rejects empty IDs', function () {
      assert.throws(
        () => validateIdentifier('', 'id'),
        /Invalid Altmetric ID format.*Must be numeric/
      );
    });

    it('includes identifier in error message', function () {
      try {
        validateIdentifier('invalid-id', 'id');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.match(error.message, /invalid-id/);
      }
    });
  });

  describe('Library-validated identifier types (integration smoke tests)', function () {
    // These tests verify we correctly integrate with validation libraries
    // We test one valid and one invalid case per type to ensure proper integration

    it('DOI: integrates with identifiers-doi library', function () {
      assert.doesNotThrow(() => validateIdentifier('10.3390/jpm14090896', 'doi'));
      assert.throws(() => validateIdentifier('invalid-doi', 'doi'), /Invalid DOI format/);
    });

    it('PubMed ID: integrates with identifiers-pubmed library', function () {
      assert.doesNotThrow(() => validateIdentifier('23903748', 'pmid'));
      assert.throws(() => validateIdentifier('invalid-pmid', 'pmid'), /Invalid PubMed ID format/);
    });

    it('arXiv ID: integrates with identifiers-arxiv library', function () {
      assert.doesNotThrow(() => validateIdentifier('1234.5678', 'arxiv'));
      assert.throws(() => validateIdentifier('invalid-arxiv', 'arxiv'), /Invalid arXiv ID format/);
    });

    it('ADS Bibcode: integrates with identifiers-bibcode library', function () {
      assert.doesNotThrow(() => validateIdentifier('2013Natur.500...54K', 'ads'));
      assert.throws(() => validateIdentifier('invalid-bibcode', 'ads'), /Invalid ADS Bibcode format/);
    });

    it('Handle: integrates with identifiers-handle library', function () {
      assert.doesNotThrow(() => validateIdentifier('10012/12345', 'handle'));
      assert.throws(() => validateIdentifier('invalid-handle', 'handle'), /Invalid Handle format/);
    });

    it('NCT ID: integrates with identifiers-nct library', function () {
      assert.doesNotThrow(() => validateIdentifier('NCT01234567', 'nct_id'));
      assert.throws(() => validateIdentifier('invalid-nct', 'nct_id'), /Invalid NCT ID format/);
    });

    it('RePEc: integrates with identifiers-repec library', function () {
      assert.doesNotThrow(() => validateIdentifier('RePEc:wpa:wuwpma:0406001', 'repec'));
      assert.throws(() => validateIdentifier('invalid-repec', 'repec'), /Invalid RePEc ID format/);
    });

    it('URN: integrates with identifiers-urn library', function () {
      assert.doesNotThrow(() => validateIdentifier('urn:isbn:0451450523', 'urn'));
      assert.throws(() => validateIdentifier('invalid-urn', 'urn'), /Invalid URN format/);
    });

    it('includes identifier in error messages from libraries', function () {
      try {
        validateIdentifier('invalid-doi-12345', 'doi');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.match(error.message, /invalid-doi-12345/);
      }
    });
  });

  describe('Error message format (our implementation)', function () {
    it('includes identifier type in error message', function () {
      try {
        validateIdentifier('', 'id');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.match(error.message, /Altmetric ID/);
      }
    });

    it('includes format hint for NCT IDs', function () {
      try {
        validateIdentifier('invalid', 'nct_id');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.match(error.message, /Expected format: NCT########/);
      }
    });
  });
});
