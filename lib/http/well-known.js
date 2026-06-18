/**
 * Build the RFC 9728 OAuth 2.0 Protected Resource Metadata document.
 *
 * MCP clients fetch this after a 401 to discover which authorization server
 * (Explorer) issues tokens for this resource server, then run the OAuth flow there.
 *
 * @param {Object} opts
 * @param {string} opts.resource - this resource server's canonical URL
 * @param {string[]} opts.authorizationServers - AS issuer URLs (Explorer)
 * @param {string[]} [opts.scopes] - scopes this resource accepts
 * @returns {object} the metadata document
 */
export function protectedResourceMetadata({ resource, authorizationServers, scopes = ['explorer'] }) {
  return {
    resource,
    authorization_servers: authorizationServers,
    scopes_supported: scopes,
    bearer_methods_supported: ['header'],
  };
}
