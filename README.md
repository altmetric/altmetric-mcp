# Altmetric MCP Server

Model Context Protocol (MCP) server that enables AI agents to access Altmetric APIs for tracking the attention and reach of research outputs across news outlets, policy documents, social media, and other online platforms.

Altmetric monitors where research is being discussed beyond traditional academic citations - from mainstream media coverage to policy citations, patent references, and social media engagement - providing a comprehensive view of real-world research impact.

## Installation

### Prerequisites
- Node.js >= 18.0.0
- Altmetric API credentials:
  - **Details Page API**: Free tier or commercial access - [Request API access](https://www.altmetric.com/solutions/altmetric-api/)
  - **Explorer API**: Institutional access - [Request API access](https://www.altmetric.com/solutions/altmetric-api/)

**Note:** At least one API configuration (Details Page or Explorer) is required.

### Getting Started

Configure your MCP client (check its own docs) to run the Altmetric MCP server using `npx`:

```json
{
  "command": "npx",
  "args": ["-y", "altmetric-mcp"],
  "env": {
    "ALTMETRIC_DETAILS_API_KEY": "your_details_api_key_here",
    "ALTMETRIC_EXPLORER_API_KEY": "your_explorer_api_key_here",
    "ALTMETRIC_EXPLORER_API_SECRET": "your_explorer_api_secret_here"
  }
}
```

**Tips:**
- Include only the API credentials you have access to

Below are specific instructions for popular AI tools and editors.

<details>
<summary>GitHub Copilot for VS Code</summary>

Add to your project `.vscode/mcp.json`:

```json
{
  "servers": {
    "altmetric-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "altmetric-mcp"],
      "env": {
        "ALTMETRIC_DETAILS_API_KEY": "your_details_api_key_here",
        "ALTMETRIC_EXPLORER_API_KEY": "your_explorer_api_key_here",
        "ALTMETRIC_EXPLORER_API_SECRET": "your_explorer_api_secret_here"
      }
    }
  }
}
```

Reload VS Code to apply the changes. [More information](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

</details>

<details>
<summary>GitHub Copilot CLI</summary>

Write `/mcp add`:

name: altmetric-mcp
Server type: local
Command: npx -y altmetric-mcp
Environment Variables:

```json
{
  "ALTMETRIC_DETAILS_API_KEY": "your_details_api_key_here",
  "ALTMETRIC_EXPLORER_API_KEY": "your_explorer_api_key_here",
  "ALTMETRIC_EXPLORER_API_SECRET": "your_explorer_api_secret_here"
}
```

</details>

<details>
<summary>Claude Code</summary>

Install directly from the command line:

```bash
claude mcp add --transport stdio altmetric-mcp --env ALTMETRIC_DETAILS_API_KEY=your_details_api_key_here --env ALTMETRIC_EXPLORER_API_KEY=your_explorer_api_key_here --env ALTMETRIC_EXPLORER_API_SECRET=your_explorer_api_secret_here -- npx -y altmetric-mcp
```

</details>

<details>
<summary>Claude Desktop</summary>

Open your Claude Desktop configuration file:

- **macOS:** `~/Library/Application\ Support/Claude/claude_desktop_config.json`

Add the Altmetric MCP server configuration:

```json
{
  "mcpServers": {
    "altmetric-mcp": {
      "command": "npx",
      "args": ["-y", "altmetric-mcp"],
      "env": {
        "ALTMETRIC_DETAILS_API_KEY": "your_details_api_key_here",
        "ALTMETRIC_EXPLORER_API_KEY": "your_explorer_api_key_here",
        "ALTMETRIC_EXPLORER_API_SECRET": "your_explorer_api_secret_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving the configuration.

</details>

<details>
<summary>Cursor</summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "altmetric": {
      "command": "npx",
      "args": ["-y", "altmetric-mcp"],
      "env": {
        "ALTMETRIC_DETAILS_API_KEY": "your_details_api_key_here",
        "ALTMETRIC_EXPLORER_API_KEY": "your_explorer_api_key_here",
        "ALTMETRIC_EXPLORER_API_SECRET": "your_explorer_api_secret_here"
      }
    }
  }
}
```

</details>

## API Tiers

### Details Page API
- **Free Tier:** Access to `get_citation_counts` and `search_citations`
- **Commercial Tier:** Access to all Details Page tools including `get_citation_details`

If you attempt to use `get_citation_details` with a free API key, you'll receive a 403 error.

### Explorer API
- **Institutional Access Only:** All Explorer API tools require institutional credentials
- Provides access to research outputs and attention data across the entire Altmetric database
- Organizations with data integrations can also access their own institutional research outputs in isolation
- Includes advanced filtering by author, department, journal, and custom organizational metadata

## Features

This MCP server provides nine tools for accessing Altmetric data across two APIs:

### Details Page API Tools

#### 1. `get_citation_counts` (Free Tier)
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

#### 2. `get_citation_details` (Commercial Tier)
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

#### 3. `search_citations` (Free Tier)
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

### Explorer API Tools (Institutional)

#### 4. `explore_research_outputs`
Search and filter research outputs within your institutional Altmetric Explorer instance. Supports filtering by author, department, journal, publication date, research type, and more.

**Key Parameters:**
- `q`: Search query for title, author, or journal
- `scope`: "all" or "institution"
- `type`: Filter by research output type (e.g., ["article", "dataset"])
- `timeframe`: Filter by attention timeframe
- `page_number`, `page_size`: Pagination controls

#### 5. `explore_attention_summary`
Get aggregated attention metrics for research outputs matching your query, broken down by source (news, Twitter, policy documents, etc.) and date.

**Key Parameters:**
- `q`: Search query
- `timeframe`: Attention timeframe
- `type`: Filter by research output type

#### 6. `explore_mentions`
Retrieve individual mentions of research outputs with detailed information about each mention including author, URL, timestamp, and platform.

**Key Parameters:**
- `q`: Search query
- `mentioned_after`/`mentioned_before`: Date range filters
- `countries`: Filter by country codes
- `page_number`, `page_size`: Pagination controls

#### 7. `explore_demographics`
Get demographic information about the audiences engaging with research outputs. Analyze geographic distribution, demographic patterns, and audience characteristics.

**Key Parameters:**
- `q`: Search query
- `scope`: "all" or "institution"
- `timeframe`: Attention timeframe
- `type`, `journal_id`, `author_id`: Filter by research attributes

#### 8. `explore_mention_sources`
Get information about the sources of mentions for research outputs. Analyze which platforms, channels, and outlets are mentioning research with source credibility and reach data.

**Key Parameters:**
- `q`: Search query
- `mentioned_after`/`mentioned_before`: Date range filters
- `source_type`: Filter by source type (news, twitter, policy, etc.)
- `countries`: Filter by country codes
- `page_number`, `page_size`: Pagination controls

#### 9. `explore_journals`
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

## License

MIT
