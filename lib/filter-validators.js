// Runtime validation of Explorer API filter values. The MCP `inputSchema`
// declared on each tool is descriptive only — the framework does not enforce
// it at runtime — so handlers receive whatever the LLM produced. These
// validators check for malformed inputs, missing fields, and excessive
// sizes before any value reaches the outbound URL.

export const MAX_STRING_LEN = 1024;
export const MAX_ARRAY_LEN = 200;
export const MAX_ARRAY_ELEMENT_LEN = 256;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE_NUMBER = 100_000;

const DATE_KEYS = new Set([
  'published_after', 'published_before',
  'mentioned_after', 'mentioned_before',
]);

const ARRAY_KEYS = new Set([
  'type', 'open_access_types', 'journal_id', 'doi_prefix',
  'author_id', 'department_id', 'publisher_id', 'funders',
  'handle_prefix', 'affiliations', 'field_of_research_codes',
  'sustainable_development_goals', 'countries',
]);

const INT_KEYS = new Set(['page_size', 'page_number']);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function hasControlChar(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function rejectControlChars(key, value) {
  if (hasControlChar(value)) {
    throw new Error(`Invalid ${key}: contains control characters`);
  }
}

function validateDate(key, value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new Error(`Invalid ${key}: expected YYYY-MM-DD`);
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${key}: not a valid calendar date`);
  }
}

function validateInt(key, value) {
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${key}: expected an integer`);
  }
  if (key === 'page_size' && (value < 1 || value > MAX_PAGE_SIZE)) {
    throw new Error(`Invalid page_size: must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (key === 'page_number' && (value < 1 || value > MAX_PAGE_NUMBER)) {
    throw new Error(`Invalid page_number: must be between 1 and ${MAX_PAGE_NUMBER}`);
  }
}

function validateArray(key, value) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${key}: expected an array`);
  }
  if (value.length > MAX_ARRAY_LEN) {
    throw new Error(`Invalid ${key}: array exceeds maximum length of ${MAX_ARRAY_LEN}`);
  }
  for (const el of value) {
    if (typeof el !== 'string') {
      throw new Error(`Invalid ${key}: array elements must be strings`);
    }
    if (el.length > MAX_ARRAY_ELEMENT_LEN) {
      throw new Error(`Invalid ${key}: array element exceeds maximum length of ${MAX_ARRAY_ELEMENT_LEN}`);
    }
    rejectControlChars(key, el);
  }
}

function validateString(key, value) {
  // Numeric IDs are sometimes passed as numbers; coerce so downstream URL
  // building still works, but apply the same length and control-char checks.
  const str = typeof value === 'string' ? value : String(value);
  if (str.length > MAX_STRING_LEN) {
    throw new Error(`Invalid ${key}: string exceeds maximum length of ${MAX_STRING_LEN}`);
  }
  rejectControlChars(key, str);
}

export function validateFilterValue(key, value) {
  if (value === null || value === undefined) return;
  if (DATE_KEYS.has(key)) return validateDate(key, value);
  if (INT_KEYS.has(key)) return validateInt(key, value);
  if (ARRAY_KEYS.has(key)) return validateArray(key, value);
  return validateString(key, value);
}
