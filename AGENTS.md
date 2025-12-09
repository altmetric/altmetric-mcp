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
   - `server.json` - `packages[0].version` field (line 14)

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

All tests are in `/test/tools_test.js`. Tests stub HTTP requests to avoid calling the real APIs and test both Details Page and Explorer API tools.

## Architecture

### Core Structure

**index.js** - Main server file containing:
- MCP server initialization using `@modelcontextprotocol/sdk`
- Nine tool definitions with handlers:
  - **Details Page API tools**: `get_citation_counts`, `get_citation_details`, `search_citations`
  - **Explorer API tools**: `explore_research_outputs`, `explore_attention_summary`, `explore_mentions`, `explore_demographics`, `explore_mention_sources`, `explore_journals`
- Helper functions for API authentication:
  - `makeDetailsApiRequest()` - Simple API key authentication for Details Page API
  - `makeExplorerApiRequest()` - HMAC-SHA1 signature authentication for Explorer API
  - `generateExplorerDigest()` - Creates HMAC-SHA1 digest from filters

### Authentication

**Details Page API** (simple key-based):
- API key appended as `?key=xxx` query parameter
- Configured via `ALTMETRIC_DETAILS_API_KEY`

**Explorer API** (HMAC-SHA1 signature-based):
- Requires both API key and secret
- Generates HMAC-SHA1 digest from alphabetically sorted filters
- Digest construction (index.js:31-64):
  1. Exclude `order`, `page[number]`, `page[size]` from digest
  2. Sort remaining filter keys alphabetically
  3. Build pipe-separated string: `key|value|key|value` (NOT `filter[key]=value`)
  4. For arrays: `key|value1|value2` (values follow key immediately)
  5. Generate HMAC-SHA1 digest using secret
  6. Append digest and key to URL
- Example: `{q: 'climate', type: ['article', 'dataset']}` → `q|climate|type|article|dataset`
  (Note: Only filter keys and values are used in digest, NOT the `filter[...]` query parameter format)
- Configured via `ALTMETRIC_EXPLORER_API_KEY` and `ALTMETRIC_EXPLORER_API_SECRET`

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

**Parameter Mapping:**
- `search_citations` maps `subject` parameter to API's `scopus_subjects` query param (index.js:253)
- `get_citation_details` maps `citation_type` parameter to API's `citations` query param (index.js:189)

**Security Notes:**
- API credentials must never be committed to repositories (Details Page API key, Explorer API key/secret)
- HMAC digest ensures requests cannot be forged without the secret
- Digest is generated from filter parameters only (excludes `key`, `digest`, `order`, `page[number]`, `page[size]`)

**Pagination:**
- Explorer API uses `page[number]` and `page[size]` (not `page` and `per_page`)
- Details Page API uses simple `page` parameter

## API Documentation

- **Details Page API**: https://details-page-api-docs.altmetric.com/
- **Explorer API**: https://explorer-api-docs.altmetric.com/
