import { extract as extractDoi } from 'identifiers-doi';
import { extract as extractPubmed } from 'identifiers-pubmed';
import { extract as extractArxiv } from 'identifiers-arxiv';
import { extract as extractBibcode } from 'identifiers-bibcode';
import { extract as extractHandle } from 'identifiers-handle';
import { extract as extractNct } from 'identifiers-nct';
import { extract as extractRepec } from 'identifiers-repec';
import { extract as extractUrn } from 'identifiers-urn';

/**
 * Validates an identifier based on its type
 * @param {string} identifier - The identifier to validate
 * @param {string} identifier_type - The type of identifier (doi, pmid, arxiv, etc.)
 * @throws {Error} If the identifier format is invalid
 */
export function validateIdentifier(identifier, identifier_type) {
  // ID type (Altmetric internal ID) should be numeric
  if (identifier_type === 'id' && !/^\d+$/.test(identifier)) {
    throw new Error(`Invalid Altmetric ID format: ${identifier}. Must be numeric.`);
  }

  // DOI validation
  if (identifier_type === 'doi') {
    const extracted = extractDoi(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid DOI format: ${identifier}`);
    }
  }

  // PubMed ID validation
  if (identifier_type === 'pmid') {
    const extracted = extractPubmed(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid PubMed ID format: ${identifier}`);
    }
  }

  // arXiv ID validation
  if (identifier_type === 'arxiv') {
    const extracted = extractArxiv(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid arXiv ID format: ${identifier}`);
    }
  }

  // ADS Bibcode validation
  if (identifier_type === 'ads') {
    const extracted = extractBibcode(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid ADS Bibcode format: ${identifier}`);
    }
  }

  // Handle validation
  if (identifier_type === 'handle') {
    const extracted = extractHandle(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid Handle format: ${identifier}`);
    }
  }

  // NCT ID validation (ClinicalTrials.gov)
  if (identifier_type === 'nct_id') {
    const extracted = extractNct(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid NCT ID format: ${identifier}. Expected format: NCT########`);
    }
  }

  // RePEc validation
  if (identifier_type === 'repec') {
    const extracted = extractRepec(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid RePEc ID format: ${identifier}`);
    }
  }

  // URN validation
  if (identifier_type === 'urn') {
    const extracted = extractUrn(identifier);
    if (!extracted || extracted.length === 0) {
      throw new Error(`Invalid URN format: ${identifier}`);
    }
  }

  // For identifier types without validation libraries (isbn, uri, ssrn, dimensions_publication_id)
  // we skip validation and let the API handle them
}
