import { UnauthorizedError } from '../credentials/explorer-broker.js';

/**
 * Extract a bearer token from an `Authorization: Bearer <token>` header.
 * @param {string|undefined} header
 * @returns {string|null}
 */
export function extractBearer(header) {
  if (!header || typeof header !== 'string') {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function sendUnauthorized(res, resourceMetadataUrl, error, description) {
  // RFC 9728 §5.1: point the client at the protected-resource metadata so it can
  // discover the authorization server and run the OAuth flow. Per RFC 6750 §3.1 an
  // error code is included only when a token was supplied and rejected, never for a
  // request that simply lacks credentials.
  const params = [`resource_metadata="${resourceMetadataUrl}"`];
  if (error) {
    params.push(`error="${error}"`);
    if (description) {
      params.push(`error_description="${description}"`);
    }
  }
  res.set('WWW-Authenticate', `Bearer ${params.join(', ')}`);
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: description || 'Unauthorized' },
    id: null,
  });
}

/**
 * Express middleware that validates the inbound OAuth bearer.
 *
 * `validate(token)` resolves to a principal when the token is good and throws
 * `UnauthorizedError` when it is not. On success the token + principal are attached
 * to `req` for the route handler to bind into the async context; on failure the
 * caller gets `401` + a `WWW-Authenticate` header advertising the resource metadata.
 *
 * @param {Object} opts
 * @param {(token: string) => Promise<object>} opts.validate
 * @param {string} opts.resourceMetadataUrl - absolute URL of /.well-known/oauth-protected-resource
 */
export function bearerAuth({ validate, resourceMetadataUrl }) {
  return async function authenticate(req, res, next) {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      return sendUnauthorized(res, resourceMetadataUrl, null, 'Authentication required');
    }

    try {
      req.principal = await validate(token);
      req.bearerToken = token;
      next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return sendUnauthorized(res, resourceMetadataUrl, 'invalid_token', 'Invalid or expired token');
      }
      next(error);
    }
  };
}
