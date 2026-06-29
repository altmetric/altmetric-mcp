# Altmetric MCP Server

Model Context Protocol (MCP) server that enables AI agents to access Altmetric APIs for tracking the attention and reach of research outputs across news outlets, policy documents, social media, and other online platforms.

Altmetric monitors where research is being discussed beyond traditional academic citations - from mainstream media coverage to policy citations, patent references, and social media engagement - providing a comprehensive view of real-world research impact.

There are two ways to connect:

- **Hosted server (recommended)** - point your AI client at `https://mcp.altmetric.com/mcp` and sign in with your Altmetric account. No API keys to copy or store, and you automatically get the tools for whatever you have access to (Explorer, Detail Pages, or both). Start here.
- **Run locally** - run the server on your own machine with your own API keys, over stdio. For offline use or when you'd rather manage keys directly. See *Run locally with your own API keys* below.

## Connect to the hosted server (recommended)

The easiest way to use Altmetric in your AI client is the hosted server at `https://mcp.altmetric.com/mcp`. Point your client at that URL and sign in with your Altmetric account when prompted - the client runs a standard OAuth flow in your browser, so there are no API keys to copy or store. You get exactly the tools your account has access to.

### Claude Desktop

1. Open **Settings → Connectors** and click **Add custom connector**.
2. Name it `Altmetric` and enter the URL `https://mcp.altmetric.com/mcp`.
3. Click **Add**, then **Connect**, and sign in when the browser window opens.

Verify by asking Claude: *"Use the Altmetric tools to look up the attention score for DOI 10.1038/nature12373"*

### Claude Code

```bash
claude mcp add --transport http altmetric https://mcp.altmetric.com/mcp
```

Then run `/mcp` inside Claude Code, select **altmetric**, and authenticate - a browser window opens for sign-in.

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project):

```json
{
  "mcpServers": {
    "Altmetric": {
      "url": "https://mcp.altmetric.com/mcp"
    }
  }
}
```

Cursor runs a browser sign-in the first time the server is used.

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` (VS Code 1.101 or later):

```json
{
  "servers": {
    "Altmetric": {
      "type": "http",
      "url": "https://mcp.altmetric.com/mcp"
    }
  }
}
```

Open the Command Palette, run **MCP: List Servers**, select **Altmetric**, and start it; sign in when prompted.

### ChatGPT

Open **Settings → Connectors → Advanced** and turn on **Developer mode**, then **Settings → Connectors → Add custom connector**, enter `https://mcp.altmetric.com/mcp`, and complete the OAuth sign-in. Requires a paid plan (Plus, Pro, Business, Enterprise, or Edu); custom connectors aren't available on the free tier. All Altmetric tools are read-only, so the read-only restriction on Plus/Pro plans doesn't limit them.

### Other MCP clients

Any client that supports the **Streamable HTTP** transport with OAuth can connect. Point it at `https://mcp.altmetric.com/mcp`. On the first request the server returns `401` with a `WWW-Authenticate` header pointing at its discovery document (`/.well-known/oauth-protected-resource`), which the client uses to run the OAuth flow against Altmetric Explorer automatically.

### How sign-in works

The hosted server is an OAuth 2.1 **resource server**. Your client obtains a bearer token from Altmetric Explorer (the authorization server) for the `mcp` scope. The server exchanges that token for your account's entitlements and calls the Altmetric APIs on your behalf - your bearer token is **never** forwarded to those APIs. The advertised toolset reflects your entitlements, so you only ever see the tools for the products you can use.

## Run locally with your own API keys

Prefer to run the server yourself - offline, or managing API keys directly? Run it over stdio with `npx`.

### Prerequisites

- **Node.js 20.6.0 or later** - an actively-supported [LTS release](https://nodejs.org/en/about/previous-releases) is recommended ([download](https://nodejs.org/))
- **Altmetric API credentials** (at least one):
  - **Details Page API key** - Free tier or commercial access
  - **Explorer API key + secret** - Institutional access

Don't have keys yet? [Request API access](https://www.altmetric.com/solutions/altmetric-api/)

### Quick install (Claude Desktop on macOS)

Run the guided installer in Terminal - it checks Node.js, prompts for your API keys, and configures Claude Desktop automatically:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/altmetric/altmetric-mcp/main/install.sh)
```

Or if you've cloned the repo:

```bash
bash install.sh
```

Prefer to set things up manually? See the per-client instructions below.

### Manual configuration

Configure your MCP client to run the server using `npx`. Include only the API credentials you have access to.

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

<details>
<summary><strong>Claude Desktop</strong></summary>

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

</details>

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

Any MCP-compatible client that supports stdio transport can use this server. Use the generic configuration above, adapting it to your client's config format. The command is always `npx` with args `["-y", "altmetric-mcp"]` plus the environment variables for your API keys.

</details>

### Deploying the local server safely

The local server runs as a child process of the MCP host (Claude Desktop, Claude Code, etc.). A few things are worth knowing before you wire it into a sensitive workflow.

**What the server does**
- Read-only proxy to two Altmetric HTTP APIs over outbound HTTPS. The one exception is an idempotent `POST` to the Explorer identifier_lists endpoint (create-or-find), used internally to scope an Explorer query to a supplied set of identifiers; it creates no user-visible state and is not destructive.
- No inbound network surface; no destructive operations.
- Treats upstream text as untrusted: scans for prompt-injection markers, redacts suspicious matches in the LLM-facing summary, and surfaces raw values only via `structuredContent`.

**What you should do**
- **Set API keys via your MCP host's `env` block**, not via a committed `.env` file. Keys appear in URL query strings; treat them as bearer-equivalent credentials.
- **Run with reduced privileges if your host allows it.** The server only needs outbound HTTPS to `api.altmetric.com` and `www.altmetric.com`. If your host or container runtime supports it, deny filesystem writes outside `$TMPDIR` and deny other network egress.
- **Consider an egress allowlist (forward proxy / DLP).** If you're using the server inside an environment that processes sensitive data, route outbound traffic through a proxy that only allows the two Altmetric hosts. The server doesn't need to talk to anyone else.
- **Respect your data-classification zone.** This server forwards tool arguments verbatim to a third party. If your prompt contains restricted or regulated data, it leaves your boundary.

**What's enforced for you**
- Outbound URLs are asserted to use `https:`.
- Upstream responses are capped at 20 MB and 60 s.
- Inbound tool arguments are capped at 8 MB total / 64 KB per string.
- Filter values are validated client-side (date format, length, pagination ranges) before any upstream call.
- Upstream error bodies are logged to stderr by SHA-256 prefix only, not verbatim.

For vulnerability reports and supported versions see [SECURITY.md](https://github.com/altmetric/altmetric-mcp/blob/main/SECURITY.md).

## Troubleshooting

| Problem | Solution |
|---|---|
| Sign-in window doesn't open / "authentication required" (hosted) | Your client must support remote MCP over HTTP with OAuth. In Claude Code run `/mcp` and authenticate; in Claude Desktop use the connector's **Connect** button. Make sure browser launches aren't blocked. |
| Signed in but some tools are missing (hosted) | You only see tools for the products your Altmetric account can access (Explorer, Detail Pages, or both). If you expect more, contact your Altmetric account admin. |
| `command not found: node` (local) | Node.js is not installed. [Download it here](https://nodejs.org/) (version 20.6.0 or later). |
| Claude Desktop won't start after editing config (local) | The JSON file has a syntax error. Check for missing commas, unmatched brackets, or trailing commas. Paste it into [jsonlint.com](https://jsonlint.com) to validate. |
| "MCP server failed to start" (local) | Run `npx -y altmetric-mcp` in Terminal to see the actual error. Usually a missing/invalid API key or Node.js version too old. |
| Tools appear but return 403 errors | You're using a free-tier key with a commercial-tier tool (`get_citation_details`). Use `get_citation_counts` or `search_citations` instead. |
| First query is slow (local) | Normal. `npx` downloads the package on first run. Subsequent uses are faster. |
| Explorer tools fail (local) | Explorer tools need **both** `ALTMETRIC_EXPLORER_API_KEY` and `ALTMETRIC_EXPLORER_API_SECRET`. Make sure both are set. |

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

This server provides eleven tools across two APIs:

| Tool | API | Tier | Description |
|---|---|---|---|
| `get_citation_counts` | Details Page | Free | Attention metrics by identifier (DOI, PubMed ID, etc.) |
| `get_citation_details` | Details Page | Commercial | Full mention text, author details (incl. Dimensions Researcher IDs), metadata |
| `search_citations` | Details Page | Free | Search attention data across all outputs by timeframe |
| `get_batch_attention_data` | Details Page | Commercial | Attention metrics for many DOIs at once, ranked |
| `translate_identifiers` | Details Page | Commercial | Translate identifiers (DOI, PMID, etc.) to Altmetric IDs |
| `explore_research_outputs` | Explorer | Institutional | Search and filter research outputs |
| `explore_attention_summary` | Explorer | Institutional | Aggregated attention metrics by source and date |
| `explore_mentions` | Explorer | Institutional | Individual mention details with filtering |
| `explore_demographics` | Explorer | Institutional | Audience geographic and demographic data |
| `explore_mention_sources` | Explorer | Institutional | Source/outlet analysis for mentions |
| `explore_journals` | Explorer | Institutional | Journal metrics, rankings, and search |

All Explorer tools additionally accept `researcher_id` and `grant_id` filters (Dimensions IDs), and an `identifiers` parameter that scopes a query to a raw list of scholarly identifiers - the server builds the corresponding identifier list for you. Explorer responses also include sentiment data (`sentiment-analysis-totals` on research outputs, `sentiment-analysis` on X/Bluesky mentions).

For detailed parameters and examples, see [TOOLS.md](TOOLS.md).

## API Documentation

- **Details Page API:** https://docs.altmetric.com/details-page-api/
- **Explorer API:** https://docs.altmetric.com/explorer-api/

## License

MIT
