# Security

## Reporting a vulnerability

If you've found a security issue in `altmetric-mcp`, please **don't open a public GitHub issue**. Open a private advisory via [GitHub Security Advisories](https://github.com/altmetric/altmetric-mcp/security/advisories/new) instead.

We'll acknowledge within a few business days and coordinate a fix and disclosure timeline with you.

## Supported versions

Security fixes are released in the latest version. Please upgrade to the latest release before reporting an issue.

## Trust model

`altmetric-mcp` is a thin, **read-only** Model Context Protocol server that proxies to two Altmetric HTTP APIs (the public Details Page API and the institutional Explorer API). All tools are idempotent reads; there are no mutating or destructive operations. It is built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/sdk).

It runs in one of two modes:

- **Hosted (HTTP, OAuth).** A long-lived service that authenticates callers as an OAuth 2.1 resource server. Each request carries a bearer token issued by Altmetric Explorer; the server exchanges it for the caller's per-product credentials and signs the API calls itself. The bearer is **never forwarded** to the Altmetric APIs, the advertised toolset is limited to the caller's entitlements, and the transport holds no session state.
- **Local (stdio).** A child process of the MCP host (e.g. Claude Desktop, Claude Code). There is no inbound network surface; the trust boundary is inherited from the parent process, and credentials come from the host's `env`.

In both modes the server treats upstream API responses as untrusted and applies the same input-validation and output-scrubbing protections. For the full list of enforced limits and built-in protections, see the deployment guidance in [README.md](README.md#deploying-the-local-server-safely).

## Operator responsibilities

A few things we can't enforce from inside the server:

- **Never commit `.env`** (stdio mode). The supplied `.gitignore` excludes it; keep it that way.
- **Treat API keys as secrets** (stdio mode). They appear in URL query strings; downstream logs (CDN, proxy, the MCP host's debug output) may capture them. The HTTP transport brokers credentials per request, so no static keys are stored.
- **Respect your data-classification zone.** This server forwards tool arguments verbatim to a third party (Altmetric / Digital Science). Don't pipe restricted or regulated data through it unless the upstream relationship covers that data class.

## Credits

Coordinated disclosure participants are credited in the GitHub Security Advisory unless they request otherwise.
