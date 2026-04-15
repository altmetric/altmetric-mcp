# Altmetric MCP Server

Model Context Protocol (MCP) server that enables AI agents to access Altmetric APIs for tracking the attention and reach of research outputs across news outlets, policy documents, social media, and other online platforms.

Altmetric monitors where research is being discussed beyond traditional academic citations - from mainstream media coverage to policy citations, patent references, and social media engagement - providing a comprehensive view of real-world research impact.

## Prerequisites

- **Node.js >= 20.6.0** - [Download from nodejs.org](https://nodejs.org/) (LTS recommended)
- **Altmetric API credentials** (at least one):
  - **Details Page API key** - Free tier or commercial access
  - **Explorer API key + secret** - Institutional access

Don't have keys yet? [Request API access](https://www.altmetric.com/solutions/altmetric-api/)

## Quick Install (Claude Desktop on macOS)

Run the guided installer in Terminal - it checks Node.js, prompts for your API keys, and configures Claude Desktop automatically:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/altmetric/altmetric-mcp/main/install.sh)
```

Or if you've cloned the repo:

```bash
bash install.sh
```

Prefer to set things up manually? See [Claude Desktop](#claude-desktop) below.

## Installation

Configure your MCP client to run the Altmetric MCP server using `npx`. Include only the API credentials you have access to.

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "altmetric-mcp"],
  "env": {
    "ALTMETRIC_DETAILS_API_KEY": "your_details_api_key_here",
    "ALTMETRIC_EXPLORER_API_KEY": "your_explorer_api_key_here",
    "ALTMETRIC_EXPLORER_API_SECRET": "your_explorer_api_secret_here"
  }
}
```

Below are specific instructions for popular AI tools and editors.

### Claude Desktop

1. Open the configuration file at:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

   On macOS you can open it from Terminal:
   ```bash
   mkdir -p ~/Library/Application\ Support/Claude && open -a TextEdit ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Add the Altmetric MCP server. If the file is empty, paste this (replacing the placeholder keys with your own, and removing any you don't have):

   ```json
   {
     "mcpServers": {
       "Altmetric": {
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

   If the file already has content, add `"Altmetric": { ... }` inside the existing `"mcpServers"` block, separated by a comma from the other entries.

3. Save the file and **restart Claude Desktop** (Cmd+Q then reopen).

4. Verify by asking Claude: *"Use the Altmetric tools to look up the attention score for DOI 10.1038/nature12373"*

<details>
<summary><strong>Claude Code</strong></summary>

Install directly from the command line:

```bash
claude mcp add --transport stdio altmetric-mcp \
  --env ALTMETRIC_DETAILS_API_KEY=your_details_api_key_here \
  --env ALTMETRIC_EXPLORER_API_KEY=your_explorer_api_key_here \
  --env ALTMETRIC_EXPLORER_API_SECRET=your_explorer_api_secret_here \
  -- npx -y altmetric-mcp
```

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Add to your project `.vscode/mcp.json`:

```json
{
  "servers": {
    "Altmetric": {
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
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Altmetric": {
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

</details>

<details>
<summary><strong>Other MCP clients</strong></summary>

Any MCP-compatible client that supports stdio transport can use this server. Use the generic configuration at the top of this section, adapting it to your client's config format. The command is always `npx` with args `["-y", "altmetric-mcp"]` plus the environment variables for your API keys.

</details>

## Troubleshooting

| Problem | Solution |
|---|---|
| `command not found: node` | Node.js is not installed. [Download it here](https://nodejs.org/) (version 20.6.0 or later). |
| Claude Desktop won't start after editing config | The JSON file has a syntax error. Check for missing commas, unmatched brackets, or trailing commas. Paste it into [jsonlint.com](https://jsonlint.com) to validate. |
| "MCP server failed to start" | Run `npx -y altmetric-mcp` in Terminal to see the actual error. Usually a missing/invalid API key or Node.js version too old. |
| Tools appear but return 403 errors | You're using a free-tier key with a commercial-tier tool (`get_citation_details`). Use `get_citation_counts` or `search_citations` instead. |
| First query is slow | Normal. `npx` downloads the package on first run. Subsequent uses are faster. |
| Explorer tools fail | Explorer tools need **both** `ALTMETRIC_EXPLORER_API_KEY` and `ALTMETRIC_EXPLORER_API_SECRET`. Make sure both are set. |

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

## Tools

This server provides nine tools across two APIs:

| Tool | API | Tier | Description |
|---|---|---|---|
| `get_citation_counts` | Details Page | Free | Attention metrics by identifier (DOI, PubMed ID, etc.) |
| `get_citation_details` | Details Page | Commercial | Full mention text, author details, metadata |
| `search_citations` | Details Page | Free | Search attention data across all outputs by timeframe |
| `explore_research_outputs` | Explorer | Institutional | Search and filter research outputs |
| `explore_attention_summary` | Explorer | Institutional | Aggregated attention metrics by source and date |
| `explore_mentions` | Explorer | Institutional | Individual mention details with filtering |
| `explore_demographics` | Explorer | Institutional | Audience geographic and demographic data |
| `explore_mention_sources` | Explorer | Institutional | Source/outlet analysis for mentions |
| `explore_journals` | Explorer | Institutional | Journal metrics, rankings, and search |

For detailed parameters and examples, see [TOOLS.md](TOOLS.md).

## API Documentation

- **Details Page API:** https://details-page-api-docs.altmetric.com/
- **Explorer API:** https://explorer-api-docs.altmetric.com/

## License

MIT
