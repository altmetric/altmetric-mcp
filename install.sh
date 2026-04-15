#!/bin/bash
# ---------------------------------------------------------------
# Altmetric MCP Installer for Claude Desktop (macOS)
#
# This script:
#   1. Checks for (and optionally installs) Node.js >= 20.6.0
#   2. Prompts for Altmetric API keys
#   3. Configures Claude Desktop to use the Altmetric MCP server
#   4. Offers to restart Claude Desktop
#
# Requirements: bash, python3 (included with Xcode Command Line Tools)
#
# Usage:
#   bash install.sh
#
# Or one-liner:
#   bash <(curl -fsSL https://raw.githubusercontent.com/altmetric/altmetric-mcp/main/install.sh)
# ---------------------------------------------------------------

set -euo pipefail

# -- Colours & helpers -----------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { printf '%b  %s\n' "${BLUE}i${NC}" "$1"; }
success() { printf '%b  %s\n' "${GREEN}+${NC}" "$1"; }
warn()    { printf '%b  %s\n' "${YELLOW}!${NC}" "$1"; }
fail()    { printf '%b  %s\n' "${RED}x${NC}" "$1" >&2; exit 1; }

# Trim leading/trailing whitespace without xargs
trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }

REQUIRED_NODE_MAJOR=20
REQUIRED_NODE_MINOR=6
CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# -- Step 0: Platform & dependency checks ----------------------
if [[ "$(uname)" != "Darwin" ]]; then
  fail "This installer is for macOS only. See the README for manual setup on other platforms."
fi

if ! command -v python3 &>/dev/null; then
  fail "python3 is required but not found. Install Xcode Command Line Tools: xcode-select --install"
fi

printf '\n%b\n\n' "${BOLD}Altmetric MCP - Installer for Claude Desktop${NC}"

# -- Step 1: Check / Install Node.js --------------------------
check_node_version() {
  if ! command -v node &>/dev/null; then
    return 1
  fi
  local ver major minor
  ver=$(node --version 2>/dev/null | sed 's/^v//')
  major=$(echo "$ver" | cut -d. -f1)
  minor=$(echo "$ver" | cut -d. -f2)
  if (( major > REQUIRED_NODE_MAJOR )) || { (( major == REQUIRED_NODE_MAJOR )) && (( minor >= REQUIRED_NODE_MINOR )); }; then
    return 0
  fi
  return 1
}

info "Checking for Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}..."

if check_node_version; then
  success "Node.js $(node --version) is installed and meets the requirement."
else
  if command -v node &>/dev/null; then
    warn "Node.js $(node --version) is installed but too old (need >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}.0)."
  else
    warn "Node.js is not installed."
  fi

  printf '\n'
  info "Node.js is required to run the Altmetric MCP server."
  info "Choose an option:"
  printf '\n'
  printf '  %b Download the official installer from nodejs.org (opens your browser)\n' "${BOLD}1)${NC}"
  printf '  %b Install via Homebrew (if you have it)\n' "${BOLD}2)${NC}"
  printf '  %b Skip - I'\''ll install it myself later\n' "${BOLD}3)${NC}"
  printf '\n'

  read -rp "Your choice [1/2/3]: " node_choice

  case "$node_choice" in
    1)
      info "Opening the Node.js download page..."
      open "https://nodejs.org/en/download/"
      printf '\n'
      warn "After installing Node.js, close and reopen Terminal, then run this script again."
      printf '  %b\n' "${BOLD}Press Enter once you've installed Node.js to continue, or Ctrl+C to exit.${NC}"
      read -r

      export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
      if check_node_version; then
        success "Node.js $(node --version) detected. Continuing..."
      else
        fail "Node.js still not found or too old. Please install Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}.0, then run this script again."
      fi
      ;;
    2)
      if ! command -v brew &>/dev/null; then
        fail "Homebrew is not installed. Choose option 1 instead, or install Homebrew first: https://brew.sh"
      fi
      info "Installing Node.js via Homebrew..."
      brew install node
      if check_node_version; then
        success "Node.js $(node --version) installed successfully."
      else
        fail "Homebrew installed Node.js but the version is too old. Run: brew upgrade node"
      fi
      ;;
    3)
      warn "Skipping Node.js installation."
      warn "The Altmetric MCP server will NOT work until Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}.0 is installed."
      printf '\n'
      ;;
    *)
      fail "Invalid choice. Run the script again."
      ;;
  esac
fi

# -- Step 2: Collect API keys ---------------------------------
printf '\n%b\n\n' "${BOLD}API Keys${NC}"
info "You need at least ONE of the following:"
info "  - Details Page API key (free tier available)"
info "  - Explorer API key + secret (institutional access)"
printf '\n'
info "Leave a field blank if you don't have that key. Just press Enter to skip."
printf '\n'

read -rp "Details Page API key: " details_key
read -rp "Explorer API key:     " explorer_key
read -rp "Explorer API secret:  " explorer_secret

details_key=$(trim "$details_key")
explorer_key=$(trim "$explorer_key")
explorer_secret=$(trim "$explorer_secret")

if [[ -z "$details_key" && -z "$explorer_key" ]]; then
  fail "You need at least one API key. Request access at https://www.altmetric.com/solutions/altmetric-api/"
fi

if [[ -n "$explorer_key" && -z "$explorer_secret" ]]; then
  warn "You entered an Explorer API key but no secret. The Explorer tools will not work without both."
  read -rp "Continue anyway? [y/N]: " continue_choice
  if [[ "$continue_choice" != [yY] ]]; then
    fail "Exiting. Re-run the script when you have both Explorer credentials."
  fi
fi

success "API keys collected."

# -- Step 3: Build the config ----------------------------------
build_config() {
  ALTMETRIC_DETAILS_KEY="$details_key" \
  ALTMETRIC_EXPLORER_KEY="$explorer_key" \
  ALTMETRIC_EXPLORER_SECRET="$explorer_secret" \
  CLAUDE_CONFIG_FILE="$CONFIG_FILE" \
  python3 <<'PYEOF'
import json, os, sys, shutil
from datetime import datetime

config_file = os.environ["CLAUDE_CONFIG_FILE"]

env = {}
dk = os.environ.get("ALTMETRIC_DETAILS_KEY", "")
ek = os.environ.get("ALTMETRIC_EXPLORER_KEY", "")
es = os.environ.get("ALTMETRIC_EXPLORER_SECRET", "")
if dk:
    env["ALTMETRIC_DETAILS_API_KEY"] = dk
if ek:
    env["ALTMETRIC_EXPLORER_API_KEY"] = ek
if es:
    env["ALTMETRIC_EXPLORER_API_SECRET"] = es

altmetric_server = {
    "command": "npx",
    "args": ["-y", "altmetric-mcp"],
    "env": env
}

config = {}
if os.path.isfile(config_file):
    try:
        with open(config_file, "r") as f:
            content = f.read().strip()
            if content:
                config = json.loads(content)
    except json.JSONDecodeError:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        backup = config_file + ".invalid." + timestamp
        shutil.copy2(config_file, backup)
        print(f"WARNING: Existing config was invalid JSON. Backed up to {backup}", file=sys.stderr)
        config = {}

if not isinstance(config, dict):
    config = {}

if "mcpServers" not in config:
    config["mcpServers"] = {}

for old_key in ("Altmetric", "altmetric", "altmetric-mcp"):
    if old_key in config["mcpServers"]:
        print(f"NOTE: Replacing existing '{old_key}' MCP server config.", file=sys.stderr)
        del config["mcpServers"][old_key]

config["mcpServers"]["Altmetric"] = altmetric_server

os.makedirs(os.path.dirname(config_file), exist_ok=True)
with open(config_file, "w") as f:
    json.dump(config, f, indent=2)
    f.write("\n")

print("OK")
PYEOF
}

printf '\n%b\n\n' "${BOLD}Configuring Claude Desktop${NC}"

if [[ -f "$CONFIG_FILE" ]]; then
  info "Found existing config at: $CONFIG_FILE"
  cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%Y%m%d%H%M%S)"
  success "Backup created."
else
  info "No existing config found. Creating a new one."
fi

result=$(build_config 2>&1)

if echo "$result" | grep -q "^OK"; then
  success "Claude Desktop configured successfully."
else
  echo "$result" >&2
  fail "Failed to update the config file. See error above."
fi

printf '\n%b %s\n' "${BOLD}Config written to:${NC}" "$CONFIG_FILE"
printf '%b\n' "${BOLD}Contents:${NC}"
CLAUDE_CONFIG_FILE="$CONFIG_FILE" python3 -c '
import json, os
with open(os.environ["CLAUDE_CONFIG_FILE"]) as f:
    config = json.load(f)
for server in config.get("mcpServers", {}).values():
    for key, val in server.get("env", {}).items():
        if val and len(val) > 8:
            server["env"][key] = val[:4] + "..." + val[-4:]
        elif val:
            server["env"][key] = "****"
print(json.dumps(config, indent=2))
'

# -- Step 4: Verify npx can find the package -------------------
printf '\n%b\n\n' "${BOLD}Verifying installation${NC}"

if command -v npx &>/dev/null; then
  info "Testing that npx can resolve altmetric-mcp..."
  if timeout 15 npx -y --package=altmetric-mcp node -e "process.exit(0)" &>/dev/null; then
    success "altmetric-mcp package resolved successfully."
  else
    info "Package will be downloaded on first use in Claude Desktop. This is normal."
  fi
else
  warn "npx not found. Make sure Node.js is installed and in your PATH."
fi

# -- Step 5: Restart Claude Desktop ----------------------------
printf '\n%b\n\n' "${BOLD}Almost done!${NC}"

if pgrep -x "Claude" &>/dev/null; then
  read -rp "Claude Desktop is running. Restart it now to apply changes? [Y/n]: " restart_choice
  if [[ "$restart_choice" != [nN] ]]; then
    info "Restarting Claude Desktop..."
    osascript -e 'quit app "Claude"' 2>/dev/null || true
    # Wait for the process to fully exit before reopening
    for i in {1..15}; do
      pgrep -x "Claude" &>/dev/null || break
      sleep 1
    done
    if pgrep -x "Claude" &>/dev/null; then
      warn "Claude Desktop is taking a while to quit. You may need to reopen it manually."
    else
      sleep 1
      open -a "Claude"
      success "Claude Desktop restarted."
    fi
  else
    warn "Remember to restart Claude Desktop manually for changes to take effect."
  fi
else
  info "Claude Desktop is not running."
  read -rp "Open Claude Desktop now? [Y/n]: " open_choice
  if [[ "$open_choice" != [nN] ]]; then
    open -a "Claude"
    success "Claude Desktop opened."
  fi
fi

# -- Done ------------------------------------------------------
printf '\n%b\n\n' "${GREEN}${BOLD}Installation complete!${NC}"
info "Try asking Claude:"
printf '  %b\n\n' "${BOLD}\"Use Altmetric to look up the attention score for DOI 10.1038/nature12373\"${NC}"
