import { createHash } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min: bounds the revocation window under broker-only validation

/** Raised when the broker rejects the bearer (e.g. 401/403); the HTTP layer maps it to a 401. */
export class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Server-to-server client for one of Explorer's credential broker endpoints. Exchanges the
 * caller's OAuth bearer for the resource owner's per-product credentials, which the MCP then
 * uses to call that product's API itself. The bearer is sent ONLY here, never to the product
 * API (MCP spec token-passthrough prohibition).
 *
 * A successful call doubles as token validation under broker-only auth: 200 = valid, a status
 * in `unauthorizedStatuses` = reject. Results are cached by a hash of the token so a token is
 * brokered once and reused for both validation and the API call.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl - Explorer base URL (the brokers live here)
 * @param {string} opts.path - broker endpoint path under baseUrl
 * @param {(body: object) => object} opts.extract - maps the JSON response to the creds object (and validates it)
 * @param {number[]} [opts.unauthorizedStatuses] - response statuses that mean "reject this token"
 * @param {number} [opts.ttlMs] - cache TTL in ms
 * @param {typeof fetch} [opts.fetchImpl] - injectable fetch (tests)
 * @param {() => number} [opts.now] - injectable clock (tests)
 */
export function createCredentialsBroker({
  baseUrl,
  path,
  extract,
  unauthorizedStatuses = [401, 403],
  ttlMs = DEFAULT_TTL_MS,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  if (!baseUrl) {
    throw new Error('createCredentialsBroker requires a baseUrl');
  }

  const url = new URL(path, baseUrl).toString();
  const unauthorized = new Set(unauthorizedStatuses);
  // tokenHash -> { value, expiresAt }
  const cache = new Map();

  async function get(token) {
    if (!token) {
      throw new UnauthorizedError('Missing bearer token');
    }

    const key = hashToken(token);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) {
      return cached.value;
    }
    cache.delete(key);

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Credentials broker request failed: ${error.message}`);
    }

    if (unauthorized.has(response.status)) {
      cache.delete(key);
      throw new UnauthorizedError(`Credentials broker rejected token (${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`Credentials broker error (${response.status})`);
    }

    const value = extract(await response.json());
    cache.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  }

  return {
    get,
    /** test/introspection helper: current number of cached tokens */
    cacheSize: () => cache.size,
  };
}
