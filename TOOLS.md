# Altmetric MCP - Tools Reference

This MCP server provides nine tools for accessing Altmetric data across two APIs. Your AI agent discovers these tools and their parameters automatically via the MCP protocol - this document is for human reference.

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
Retrieve detailed mention information including full text of posts, author details, and complete metadata for how research is being discussed online.

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

### `explore_research_outputs`
Search and filter research outputs within your institutional Altmetric Explorer instance. Supports filtering by author, department, journal, publication date, research type, and more.

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
Retrieve individual mentions of research outputs with detailed information about each mention including author, URL, timestamp, and platform.

**Key Parameters:**
- `q`: Search query
- `mentioned_after`/`mentioned_before`: Date range filters
- `countries`: Filter by country codes
- `page_number`, `page_size`: Pagination controls

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

### `explore_journals`
Get journal-related data and metrics. Search and filter by publication venue, analyze journal impact, and retrieve journal rankings.

**Key Parameters:**
- `q`: Search query for journal name or ISSN
- `journal_id`, `issn`: Filter by journal identifiers
- `subject`: Filter by subject area
- `publisher`: Filter by publisher name
- `page_number`, `page_size`: Pagination controls

## API Documentation

- **Details Page API:** https://details-page-api-docs.altmetric.com/
- **Explorer API:** https://explorer-api-docs.altmetric.com/
