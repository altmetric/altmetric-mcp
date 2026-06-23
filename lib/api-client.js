import crypto from 'crypto';

const REQUEST_TIMEOUT_MS = 60_000;
// get_citation_details returns all mentions for a research output in one
// response with no pagination (lib/tools.js); a heavily-mentioned paper can
// easily run to several MB, so the cap has to be generous enough to not
// break that documented use case.
export const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

function assertHttps(url) {
  if (url.protocol !== 'https:') {
    throw new Error('Only https URLs are permitted for upstream requests');
  }
}

// Read an upstream JSON response with a hard size cap. We check the declared
// Content-Length first (cheap reject for misbehaving upstreams) and then
// re-verify after reading. This is not a memory-safety control against a
// fully hostile upstream — Node has already buffered the body by the time
// .text() resolves — but it bounds the JSON we hand to JSON.parse and the
// downstream MCP transport, which is the realistic threat model of
// accidentally-huge or misconfigured Altmetric responses.
async function readBoundedJson(response) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined) {
    const declaredBytes = Number.parseInt(declared, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
      throw new Error('Upstream response too large');
    }
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error('Upstream response too large');
  }
  return JSON.parse(text);
}

function logUpstreamError(label, status, body) {
  // Log a hash of the upstream body instead of the body itself: bodies can
  // echo internal hostnames, IPs, or even our API key in some error paths,
  // and MCP clients capture stderr into transcripts.
  const hash = crypto.createHash('sha256').update(body ?? '').digest('hex').slice(0, 16);
  const bytes = typeof body === 'string' ? body.length : 0;
  console.error(`${label}: status=${status} body_sha256_prefix=${hash} bytes=${bytes}`);
}

/**
 * Generates HMAC-SHA1 digest for Explorer API authentication
 * @param {Object} filters - Filter parameters to include in digest
 * @param {string} secret - API secret for HMAC generation
 * @returns {string} Hex-encoded HMAC-SHA1 digest
 */
export function generateExplorerDigest(filters, secret) {
  if (!secret || secret.length < 16) {
    throw new Error('ALTMETRIC_EXPLORER_API_SECRET must be at least 16 characters');
  }

  // Exclude these parameters from digest calculation. `include` is a
  // top-level presentation parameter (like order/pagination), not a filter,
  // and the Explorer API does not sign it - verified against production: the
  // same digest validates regardless of the `include` value sent.
  const excludeFromDigest = ['order', 'page[number]', 'page[size]', 'include'];

  // Filter out excluded params and get remaining keys, sorted alphabetically
  const filterKeys = Object.keys(filters)
    .filter(key => !excludeFromDigest.includes(key))
    .sort();

  // Build pipe-separated string: key|value|key|value
  // For arrays: key|value1|value2
  const parts = [];
  filterKeys.forEach(key => {
    const value = filters[key];
    if (Array.isArray(value)) {
      parts.push(key);
      parts.push(...value);
    } else {
      parts.push(key);
      parts.push(value);
    }
  });

  const filterString = parts.join('|');

  // Generate HMAC-SHA1 digest
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(filterString);
  return hmac.digest('hex');
}

/**
 * Generates the HMAC-SHA1 digest for the Explorer identifier_lists endpoint.
 * This endpoint signs differently from every other Explorer endpoint: the
 * digest is the HMAC-SHA1 of the raw identifiers body, keyed by the API secret
 * with hyphens stripped (NOT the alphabetical pipe-joined-filters convention
 * used by generateExplorerDigest, because this endpoint takes no filters).
 * @param {string} identifiers - Raw identifiers body (the exact string POSTed)
 * @param {string} secret - API secret for HMAC generation
 * @returns {string} Hex-encoded HMAC-SHA1 digest
 */
export function generateIdentifierListDigest(identifiers, secret) {
  if (!secret || secret.length < 16) {
    throw new Error('ALTMETRIC_EXPLORER_API_SECRET must be at least 16 characters');
  }

  const hmac = crypto.createHmac('sha1', secret.replace(/-/g, ''));
  hmac.update(identifiers);
  return hmac.digest('hex');
}

/**
 * Makes a request to the Details Page API
 * @param {string} endpoint - API endpoint path
 * @param {Object} params - Query parameters
 * @param {string} apiKey - API key for authentication
 * @param {string} baseUrl - Base URL for the API
 * @param {Object} [fetchOptions] - Additional fetch options (method, headers, body)
 * @returns {Promise<Object>} API response data
 */
export async function makeDetailsApiRequest(endpoint, params = {}, apiKey, baseUrl, fetchOptions = {}) {
  if (!apiKey) {
    throw new Error('ALTMETRIC_DETAILS_API_KEY is required for Details Page API calls');
  }

  const url = new URL(endpoint, baseUrl);
  url.searchParams.append('key', apiKey);

  // Add additional query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  assertHttps(url);

  // Follow redirects by default: Altmetric's POST endpoints are routed
  // through Cloudflare and respond with a 307 to api-prod-post-cache
  // before reaching the origin, so disabling redirects breaks those tools.
  // URL pinning still holds via the hardcoded base URL plus TLS verification.
  const response = await fetch(url.toString(), {
    ...fetchOptions,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logUpstreamError('Details API error', response.status, errorText);
    throw new Error(httpErrorMessage(response.status));
  }

  return readBoundedJson(response);
}

/**
 * Makes a request to the Explorer API
 * @param {string} endpoint - API endpoint path
 * @param {Object} filters - Filter parameters
 * @param {string} apiKey - API key for authentication
 * @param {string} apiSecret - API secret for digest generation
 * @param {string} baseUrl - Base URL for the API
 * @returns {Promise<Object>} API response data
 */
export async function makeExplorerApiRequest(endpoint, filters = {}, apiKey, apiSecret, baseUrl) {
  if (!apiKey) {
    throw new Error('ALTMETRIC_EXPLORER_API_KEY is required for Explorer API calls');
  }

  const url = new URL(endpoint, baseUrl);

  // Add API key
  url.searchParams.append('key', apiKey);

  // Add filters as query parameters
  // Special handling for pagination, order, and include parameters - don't
  // wrap with filter[]. `include` controls which related objects the API
  // embeds in the JSON:API `included` block; an empty value suppresses it.
  const nonFilterParams = ['page[number]', 'page[size]', 'order', 'include'];

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (nonFilterParams.includes(key)) {
        // Pagination and order params go directly without filter[] wrapper
        url.searchParams.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(`filter[${key}][]`, v));
      } else {
        url.searchParams.append(`filter[${key}]`, value);
      }
    }
  });

  // Generate and add digest (always required, even with no filters)
  const digest = generateExplorerDigest(filters, apiSecret);
  url.searchParams.append('digest', digest);

  assertHttps(url);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logUpstreamError('Explorer API error', response.status, errorText);
    throw new Error(httpErrorMessage(response.status));
  }

  return readBoundedJson(response);
}

/**
 * Creates (or finds) an identifier list via the Explorer API and returns it.
 * Unlike the other Explorer endpoints this is a POST with an
 * x-www-form-urlencoded body, and the digest is signed over the raw
 * identifiers string (see generateIdentifierListDigest). The endpoint is
 * idempotent: the same identifiers content always yields the same id.
 * @param {string} identifiers - Whitespace-separated identifiers (the exact body string)
 * @param {string} apiKey - API key for authentication
 * @param {string} apiSecret - API secret for digest generation
 * @param {string} baseUrl - Base URL for the API
 * @returns {Promise<Object>} API response data ({ data: { id, counts, content } })
 */
export async function makeExplorerIdentifierListRequest(identifiers, apiKey, apiSecret, baseUrl) {
  if (!apiKey) {
    throw new Error('ALTMETRIC_EXPLORER_API_KEY is required for Explorer API calls');
  }

  const url = new URL('/explorer/api/identifier_lists', baseUrl);
  assertHttps(url);

  const digest = generateIdentifierListDigest(identifiers, apiSecret);

  // The digest is computed over the pre-encoding identifiers string;
  // URLSearchParams encodes it for transport (newline -> %0A) and the server
  // HMACs the decoded value, so the two match. Pass identifiers in the body
  // only - the API rejects it in the query string (identifiers_must_be_in_body).
  const body = new URLSearchParams({ key: apiKey, digest, identifiers }).toString();

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logUpstreamError('Explorer identifier_lists error', response.status, errorText);
    throw new Error(httpErrorMessage(response.status));
  }

  return readBoundedJson(response);
}

function httpErrorMessage(status) {
  switch (status) {
    case 401: return 'Unauthorized: invalid API key';
    case 403: return 'Forbidden: this endpoint requires a commercial/paid API key';
    case 404: return 'Not found: no research output matches that identifier or query';
    case 429: return 'Rate limited: too many requests, try again later';
    default:  return `API request failed (HTTP ${status})`;
  }
}
