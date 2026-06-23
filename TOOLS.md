# Altmetric MCP - Tools Reference

This MCP server provides tools for accessing Altmetric data across two APIs. Your AI agent discovers these tools and their parameters automatically via the MCP protocol - this document is for human reference.

## Details Page API Tools

### `get_citation_counts` (Free Tier)
Retrieve attention metrics and mention counts across various platforms for research outputs using DOI, PubMed ID, arXiv ID, or other identifiers.

**Parameters:**
- `identifier` (required): The research output identifier (e.g., "10.1038/nature12373")
- `identifier_type` (optional): Type of identifier - "doi", "pmid", "arxiv", "id", "ads", "urn", "uri", or "isbn" (default: "doi")

**Example:**
```json
{
  "identifier": "10.1038/nature12373",
  "identifier_type": "doi"
}
```

### `get_citation_details` (Commercial Tier)
Retrieve detailed mention information including full text of posts, author details, and complete metadata for how research is being discussed online. The returned `citation` block includes `authors_details`, pairing each author name with its Dimensions Researcher ID where available.

**Parameters:**
- `identifier` (required): The research output identifier
- `identifier_type` (optional): "doi" or "id" (default: "doi")
- `citation_type` (optional): Filter by type - "twitter", "news", "blog", "policy", "patent", etc.
- `page` (optional): Page number for pagination (default: 1)

**Example:**
```json
{
  "identifier": "10.1038/nature12373",
  "identifier_type": "doi",
  "citation_type": "news"
}
```

### `search_citations` (Free Tier)
Search aggregated attention data across all tracked research outputs for a specific timeframe.

**Parameters:**
- `timeframe` (required): "1d", "2d", "3d", "4d", "5d", "6d", "1w", "1m", "3m", "6m", "1y", or "at" (all-time)
- `citation_type` (optional): Filter by citation source type
- `nlmid` (optional): Filter by journal NLM ID
- `issns` (optional): Filter by journal ISSN(s), comma-separated
- `subject` (optional): Filter by Scopus subject area
- `num_results` (optional): Number of results to return
- `page` (optional): Page number for pagination

**Example:**
```json
{
  "timeframe": "1w",
  "citation_type": "news",
  "num_results": 50
}
```

## Explorer API Tools (Institutional)

All Explorer tools require institutional credentials (both `ALTMETRIC_EXPLORER_API_KEY` and `ALTMETRIC_EXPLORER_API_SECRET`).

All six Explorer tools share a common set of filters. In addition to the per-tool parameters below, every Explorer tool accepts:

- `researcher_id`: Filter by Dimensions Researcher ID(s), e.g. `["ur.015071462574.28"]`
- `grant_id`: Filter by Dimensions grant ID(s), e.g. `["grant.13864430"]`
- `identifier_list_id`: Scope the query to an existing identifier list (created in the Explorer UI or via the Identifier Lists API)
- `identifiers`: Scope the query to a raw list of scholarly identifiers (DOI, Handle, ISBN, URI, URN, PubMed ID, arXiv ID, ADS Bibcode, RePEc ID, NCT ID, Altmetric ID). The server creates (or finds) an identifier list from these and applies it automatically, so you don't need to obtain an `identifier_list_id` first. Prefix Altmetric IDs with `altmetric:` to disambiguate them from PubMed IDs. Up to 25,000 identifiers; mutually exclusive with `identifier_list_id`.

### `explore_research_outputs`
Search and filter research outputs within your institutional Altmetric Explorer instance. Supports filtering by author, department, journal, publication date, research type, and more. Each result includes `sentiment-analysis-totals`, a breakdown of its mentions across seven sentiment categories (computed for X and Bluesky mentions; absent if your organization has AI features restricted).

**Key Parameters:**
- `q`: Search query for title, author, or journal
- `scope`: "all" or "institution"
- `type`: Filter by research output type (e.g., ["article", "dataset"])
- `timeframe`: Filter by attention timeframe
- `page_number`, `page_size`: Pagination controls

### `explore_attention_summary`
Get aggregated attention metrics for research outputs matching your query, broken down by source (news, Twitter, policy documents, etc.) and date.

**Key Parameters:**
- `q`: Search query
- `timeframe`: Attention timeframe
- `type`: Filter by research output type

### `explore_mentions`
Retrieve individual mentions of research outputs with detailed information about each mention including author, URL, timestamp, and platform. Scored mentions also carry a `sentiment-analysis` attribute (one sentiment per research output the mention references; computed for X and Bluesky only, absent if your organization has AI features restricted).

**Key Parameters:**
- `q`: Search query
- `mentioned_after`/`mentioned_before`: Date range filters
- `countries`: Filter by country codes
- `page_number`, `page_size`: Pagination controls
- `include_related`: Embed related objects (the mention author profile, journal, and the full mentioned research-output records). Defaults to `false` to keep responses small. Setting it `true` is **heavy** — for every mention it embeds the full referenced research-output records (titles, mention-count breakdowns, scores, sentiment totals) plus author/journal objects, and can exceed client size limits on busy queries. Leave it off unless you specifically need that related data.

### `explore_demographics`
Get demographic information about the audiences engaging with research outputs. Analyze geographic distribution, demographic patterns, and audience characteristics.

**Key Parameters:**
- `q`: Search query
- `scope`: "all" or "institution"
- `timeframe`: Attention timeframe
- `type`, `journal_id`, `author_id`: Filter by research attributes

### `explore_mention_sources`
Get information about the sources of mentions for research outputs. Analyze which platforms, channels, and outlets are mentioning research with source credibility and reach data.

**Key Parameters:**
- `q`: Search query
- `mentioned_after`/`mentioned_before`: Date range filters
- `source_type`: Filter by source type (news, twitter, policy, etc.)
- `countries`: Filter by country codes
- `page_number`, `page_size`: Pagination controls
- `include_related`: Embed related objects (author profiles, journals, full mentioned research-output records). Defaults to `false` to keep responses small; setting it `true` is **heavy** and can exceed client size limits. Leave it off unless you specifically need that related data.

### `explore_journals`
Get aggregated mention data by journal — journal names, ISSNs, and mention counts broken down by source type.

**Single-page endpoint — no pagination.** It does not honor `page[size]`, so a broad query aggregates *every* matching journal into one response (e.g. `q=cancer` returns ~12,000 journals), which the server's size guard then truncates. Narrow the query to keep the result complete — there is no result-count limit, so filtering is the only control.

**Key Parameters:**
- `q`: Search query (title, author, journal)
- `journal_id`: Filter by specific journal IDs
- `type`: Filter by research output type
- `timeframe`, `published_after`/`published_before`: Time filters
- `identifiers` / `identifier_list_id`: Scope to a specific set of outputs