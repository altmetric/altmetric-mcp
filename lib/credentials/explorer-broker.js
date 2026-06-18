import { createHash } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min: bounds the revocation window under broker-only validation

/** Raised when Explorer rejects the bearer (401/403); the HTTP layer maps it to a 401. */
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
 * Server-to-server client for Explorer's credential broker
 * (`GET /explorer/oauth/credentials/explorer`). Exchanges the caller's OAuth bearer for the
 * resource owner's `{ apiKey, apiSecret }`, which the MCP then uses to sign Explorer
 * API calls itself. The bearer is sent ONLY here, never to Explorer's `/api`
 * (MCP spec token-passthrough prohibition).
 *
 * A successful call doubles as token validation under broker-only auth: 200 = valid,
 * 401/403 = reject. Results are cached by a hash of the token so a token is brokered
 * once and reused for both validation and signing.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl - Explorer base URL (broker + API live here)
 * @param {number} [opts.ttlMs] - cache TTL in ms
 * @param {typeof fetch} [opts.fetchImpl] - injectable fetch (tests)
 * @param {() => number} [opts.now] - injectable clock (tests)
 */
export function createExplorerBroker({ baseUrl, ttlMs = DEFAULT_TTL_MS, fetchImpl = fetch, now = () => Date.now() }) {
  if (!baseUrl) {
    throw new Error('createExplorerBroker requires a baseUrl');
  }

  // Explorer is mounted under a /explorer path prefix (same as the Explorer API
  // endpoints in tools.js, e.g. /explorer/api/...), so the broker lives at
  // /explorer/oauth/credentials/explorer, not at the host root.
  const url = new URL('/explorer/oauth/credentials/explorer', baseUrl).toString();
  // tokenHash -> { value: { apiKey, apiSecret }, expiresAt }
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
      throw new Error(`Explorer broker request failed: ${error.message}`);
    }

    if (response.status === 401 || response.status === 403) {
      cache.delete(key);
      throw new UnauthorizedError(`Explorer broker rejected token (${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`Explorer broker error (${response.status})`);
    }

    const body = await response.json();
    if (!body || !body.api_key || !body.api_secret) {
      throw new Error('Explorer broker response missing api_key/api_secret');
    }

    const value = { apiKey: body.api_key, apiSecret: body.api_secret };
    cache.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  }

  return {
    get,
    /** test/introspection helper: current number of cached tokens */
    cacheSize: () => cache.size,
  };
}
