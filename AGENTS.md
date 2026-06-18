# Project Instructions

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides AI agents with access to both the Altmetric Details Page API and Explorer API for retrieving citation metrics and research output data. Built using the [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk), it uses stdio transport for communication with MCP clients like Claude Desktop.

The server integrates two different Altmetric APIs:
1. **Details Page API** - Public API for citation counts and details by identifier (DOI, PubMed ID, etc.)
2. **Explorer API** - Institutional API for searching and analyzing research outputs in your organization

## Commands

### Development
- `npm run dev` - Run server in development mode with auto-reload (using `node --watch`)
- `npm start` - Run server in production mode
- `npm test` - Run all tests using Mocha

### Publishing New Versions

To release a new version:

1. **Update version numbers in 3 places:**
   - `package.json` - `version` field
   - `server.json` - `version` field (line 9)
   - `server.json` - `packages[0].version` field (line 21)

2. **Commit the version bump:**
   ```bash
   git add package.json server.json
   git commit -m "Bump version to X.Y.Z"
   ```

3. **Push to remote:**
   ```bash
   git push origin main
   ```

4. **Run the publish script:**
   ```bash
   ./publish.sh
   ```

   The script will:
   - ✅ Verify you're on main and synced with remote
   - ✅ Check version consistency across files
   - ✅ Run all tests
   - ✅ Create git tag (e.g., v0.2.0)
   - ✅ Prompt to push tag to GitHub
   - ✅ Prompt to publish to npm
   - ✅ Prompt to publish to MCP Registry

### Testing
The test suite uses:
- **Mocha** (configured via `.mocharc.json`) - test framework
- **Sinon** - for stubbing `fetch` calls
- **Node assert** - for assertions
- **crypto** - for HMAC-SHA1 digest generation (Explorer API authentication)

Tests live under `/test/` (one `*_test.js` file per `lib/` module, plus `integration.test.js`). They stub HTTP requests via Sinon to avoid calling the real APIs and cover both Details Page and Explorer API tools.

## Architecture

### Core Structure

**index.js** - Thin server bootstrap: reads credentials from the environment, calls `createTools(...)`, registers the MCP `ListTools`/`CallTool` handlers, and enforces inbound argument limits (`assertArgsWithinLimits`) before dispatching. It contains no tool definitions or HTTP logic itself.

**lib/tools.js** - The eleven tool definitions and handlers, gated by which credentials are configured:
- **Details Page API tools**: `get_citation_counts`, `get_citation_details`, `search_citations`, `get_batch_attention_data`, `translate_identifiers`
- **Explorer API tools**: `explore_research_outputs`, `explore_attention_summary`, `explore_mentions`, `explore_demographics`, `explore_mention_sources`, `explore_journals`
- Shared Explorer helpers: `SHARED_FILTER_KEYS` + `buildFilters()` (all six Explorer tools route through these), and `resolveIdentifierList()` (turns a raw `identifiers` array into an `identifier_list_id` via an internal POST - see below).

**lib/api-client.js** - HTTP helpers and authentication:
- `makeDetailsApiRequest()` - Simple API key authentication for Details Page API
- `makeExplorerApiRequest()` - HMAC-SHA1 signature authentication for Explorer API (GET)
- `makeExplorerIdentifierListRequest()` - POST to the Explorer `identifier_lists` endpoint
- `generateExplorerDigest()` - HMAC-SHA1 digest from sorted filters
- `generateIdentifierListDigest()` - HMAC-SHA1 digest for the identifier_lists endpoint (different convention - see below)

**Other lib/ modules**: `filter-validators.js` (runtime filter validation), `validators.js` (identifier-format validation), `args-limits.js` (inbound arg caps), `output-guard.js` (prompt-injection scrubbing of upstream text).

### Authentication

**Details Page API** (simple key-based):
- API key appended as `?key=xxx` query parameter
- Configured via `ALTMETRIC_DETAILS_API_KEY`

**Explorer API** (HMAC-SHA1 signature-based):
- Requires both API key and secret
- Generates HMAC-SHA1 digest from alphabetically sorted filters
- Digest construction (`generateExplorerDigest` in `lib/api-client.js`):
  1. Exclude `order`, `page[number]`, `page[size]` from digest
  2. Sort remaining filter keys alphabetically
  3. Build pipe-separated string: `key|value|key|value` (NOT `filter[key]=value`)
  4. For arrays: `key|value1|value2` (values follow key immediately)
  5. Generate HMAC-SHA1 digest using secret
  6. Append digest and key to URL
- Example: `{q: 'climate', type: ['article', 'dataset']}` → `q|climate|type|article|dataset`
  (Note: Only filter keys and values are used in digest, NOT the `filter[...]` query parameter format)
- Configured via `ALTMETRIC_EXPLORER_API_KEY` and `ALTMETRIC_EXPLORER_API_SECRET`

**Explorer `identifier_lists` endpoint** (`POST /explorer/api/identifier_lists`) signs **differently** from every other Explorer endpoint - a maintainer trap. Its digest (`generateIdentifierListDigest` in `lib/api-client.js`) is `HMAC-SHA1(secret_with_hyphens_stripped, raw_identifiers_body)`, NOT the alphabetical pipe-joined-filters convention above. The identifiers are POSTed in an `x-www-form-urlencoded` body (never the query string), and the digest is computed over the pre-encoding identifiers string (newline-joined). The endpoint is idempotent (same content → same id).

### Tool Implementations

**Details Page API tools** follow this pattern:
1. Extract arguments with defaults (e.g., `identifier_type = 'doi'`)
2. Build API endpoint path (`/v1/...`)
3. Construct query parameters object (only include non-null/undefined values)
4. Call `makeDetailsApiRequest(endpoint, params)`
5. Return formatted response with JSON stringified data

**Explorer API tools** follow this pattern:
1. Extract arguments from function parameters
2. Build API endpoint path (`/explorer/api/...`)
3. Construct filters object from non-null/undefined arguments
4. Call `makeExplorerApiRequest(endpoint, filters)` which:
   - Adds filters as `filter[key]=value` query params
   - Handles arrays as multiple `filter[key][]=value` params
   - Automatically generates and appends HMAC digest
5. Return formatted response with JSON stringified data

**Tool tiers:**
- Free tier (Details Page): `get_citation_counts`, `search_citations`
- Commercial tier (Details Page): `get_citation_details` (returns 403 with free API key)
- Institutional (Explorer): All Explorer tools require institutional credentials

### Environment Configuration

**API Credentials (at least one set required):**

The server requires at least one of the following API credential sets:

1. **Details Page API credentials:**
   - `ALTMETRIC_DETAILS_API_KEY` - Details Page API key

2. **Explorer API credentials (both required together):**
   - `ALTMETRIC_EXPLORER_API_KEY` - Explorer API key
   - `ALTMETRIC_EXPLORER_API_SECRET` - Explorer API secret (keep this secure!)

**Valid configurations:**
- ✅ Only Details Page API key
- ✅ Only Explorer API keys (both key and secret)
- ✅ Both Details Page and Explorer API keys
- ❌ Neither (server will not function)

Tools will fail at runtime if their required API credentials are not configured (e.g., Explorer tools will fail without Explorer credentials, Details Page tools will fail without Details Page credentials).

### Important Implementation Details

**Parameter Mapping** (all in `lib/tools.js`):
- `search_citations` maps the `subject` argument to the API's `scopus_subjects` query param.
- Explorer pagination args `page_number`/`page_size` map to `page[number]`/`page[size]` via `PAGINATION_KEY_MAP`; they are excluded from the digest.
- Explorer `researcher_id` and `grant_id` are array filters (Dimensions IDs) in `SHARED_FILTER_KEYS`, emitted as `filter[key][]`.
- Explorer `identifiers` (a raw identifier list) is consumed by `resolveIdentifierList()` and converted into an `identifier_list_id` via an internal POST; it is never forwarded to the read endpoint as a filter, and is mutually exclusive with `identifier_list_id`.

**Response fields (passthrough):** new upstream fields surface automatically via `structuredContent` with no client changes - `authors_details` (name + Dimensions Researcher ID) on the Details `get_citation_details` citation block, and Explorer sentiment data (`sentiment-analysis-totals` on research outputs, `sentiment-analysis` on X/Bluesky mentions). Tool descriptions advertise these for discoverability.

**Security Notes:**
- API credentials must never be committed to repositories (Details Page API key, Explorer API key/secret)
- HMAC digest ensures requests cannot be forged without the secret
- Digest is generated from filter parameters only (excludes `key`, `digest`, `order`, `page[number]`, `page[size]`)

**Pagination:**
- Explorer API uses `page[number]` and `page[size]` (not `page` and `per_page`)
- Details Page API uses simple `page` parameter

## API Documentation

- **Details Page API**: https://docs.altmetric.com/details-page-api/
- **Explorer API**: https://docs.altmetric.com/explorer-api/
