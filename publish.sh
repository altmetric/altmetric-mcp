#!/bin/bash
set -e

echo "🚀 Altmetric MCP Server Publishing Script"
echo "=========================================="
echo ""

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ Error: You must be on the main branch to publish."
  echo "Current branch: $CURRENT_BRANCH"
  exit 1
fi

# Fetch remote to ensure we have latest refs
echo "🔄 Fetching from remote..."
git fetch origin main

# Check if branch is synced with remote
LOCAL_COMMIT=$(git rev-parse @)
REMOTE_COMMIT=$(git rev-parse @{u})

if [[ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]]; then
  echo "❌ Error: Your local main branch is not synced with remote."

  # Check if local is behind
  if git merge-base --is-ancestor @ @{u} 2>/dev/null; then
    echo "Your local branch is behind the remote. Please pull first:"
    echo "  git pull origin main"
  # Check if local is ahead
  elif git merge-base --is-ancestor @{u} @ 2>/dev/null; then
    echo "Your local branch has unpushed commits. Please push first:"
    echo "  git push origin main"
  else
    echo "Your branch has diverged from remote. Please sync manually."
  fi

  exit 1
fi

echo "✅ Branch check passed: on main and synced with remote"

# Check that package.json and server.json versions match
echo "🔍 Checking version consistency..."
PKG_VERSION=$(node -e "console.log(require('./package.json').version)")
SERVER_VERSION=$(node -e "console.log(require('./server.json').version)")
SERVER_PKG_VERSION=$(node -e "console.log(require('./server.json').packages[0].version)")

if [[ "$PKG_VERSION" != "$SERVER_VERSION" ]] || [[ "$PKG_VERSION" != "$SERVER_PKG_VERSION" ]]; then
  echo "❌ Error: Version mismatch!"
  echo "  package.json:              $PKG_VERSION"
  echo "  server.json:               $SERVER_VERSION"
  echo "  server.json packages[0]:   $SERVER_PKG_VERSION"
  echo ""
  echo "Please update versions to match before publishing."
  exit 1
fi

VERSION="v$PKG_VERSION"
echo "✅ Version check passed: $VERSION"

# Run tests
echo ""
echo "🧪 Running tests..."
npm test

# Create tag
echo ""
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "⚠️  Tag $VERSION already exists, skipping tag creation"
else
  echo "🏷️  Creating tag $VERSION..."
  git tag $VERSION
fi

# Push tag to GitHub
echo ""
if git ls-remote --tags origin | grep -q "refs/tags/$VERSION$"; then
  echo "⚠️  Tag $VERSION already exists on GitHub, skipping push"
else
  read -p "Push tag to GitHub? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "⬆️  Pushing tag to GitHub..."
    git push origin $VERSION
    echo "✅ Pushed tag to GitHub"
  else
    echo "⚠️  Skipped GitHub push (you can do this later with: git push origin $VERSION)"
  fi
fi

# Publish to npm
echo ""
if npm view "altmetric-mcp@$PKG_VERSION" version >/dev/null 2>&1; then
  echo "⚠️  Version $PKG_VERSION already published to npm, skipping"
else
  read -p "Publish to npm? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Publishing to npm..."
    npm publish
    echo "✅ Published to npm: https://www.npmjs.com/package/altmetric-mcp"
  else
    echo "⚠️  Skipped npm publish"
  fi
fi

# Publish to MCP Registry
echo ""
read -p "Publish to MCP Registry? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Check if mcp-publisher is installed
  if ! command -v mcp-publisher &> /dev/null; then
    echo "⚠️  mcp-publisher not found."
    echo ""
    echo "Install it with:"
    echo "  brew install mcp-publisher"
    echo ""
    echo "Or download from: https://github.com/modelcontextprotocol/mcp-publisher/releases"
    echo ""
    read -p "Continue without MCP Registry publish? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "❌ Aborted."
      exit 1
    fi
  else
    # Check if authenticated
    echo "🔐 Checking MCP Registry authentication..."
    if ! mcp-publisher whoami &> /dev/null; then
      echo "⚠️  Not authenticated with MCP Registry."
      echo "Authenticating with GitHub..."
      mcp-publisher login github
    fi

    echo "📤 Publishing to MCP Registry..."
    mcp-publisher publish
    echo "✅ Published to MCP Registry"
  fi
else
  echo "⚠️  Skipped MCP Registry publish"
fi

echo ""
echo "🎉 Done!"
echo ""
echo "Summary:"
echo "  Version: $NEW_VERSION"
echo "  npm: https://www.npmjs.com/package/altmetric-mcp"
echo "  GitHub: https://github.com/altmetric/altmetric-mcp/releases/tag/$NEW_VERSION"
echo "  MCP Registry: https://modelcontextprotocol.io/servers"
