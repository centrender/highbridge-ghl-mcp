#!/bin/bash
# HighBridge — Mac/Linux Auto-Setup
# Run once: chmod +x setup.sh && ./setup.sh

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "=========================================="
echo "  HighBridge — GoHighLevel MCP Installer  "
echo "=========================================="
echo ""

# Step 1: npm install
echo "Installing dependencies..."
cd "$DIR"
npm install --silent
echo "Done."
echo ""

# Step 2: Collect credentials
echo "Enter your GHL credentials."
echo "(Find them in GHL → Settings → Integrations → API Keys)"
echo ""
read -p "GHL Private Integration Token (starts with pit-): " API_KEY
read -p "GHL Location ID: " LOCATION_ID

if [[ "$API_KEY" != pit-* ]]; then
    echo "Warning: token should start with 'pit-'. Double-check in GHL."
fi

# Step 3: Write .env
echo "GHL_API_KEY=$API_KEY" > "$DIR/.env"
echo "GHL_LOCATION_ID=$LOCATION_ID" >> "$DIR/.env"
echo ".env saved."
echo ""

# Step 4: Patch claude_desktop_config.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
else
    CONFIG_DIR="$HOME/.config/Claude"
fi
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
INDEX_PATH="$DIR/src/index.js"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
    echo '{"mcpServers":{}}' > "$CONFIG_FILE"
fi

# Use node to patch the JSON safely
node -e "
const fs = require('fs');
const path = '$CONFIG_FILE';
let config = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!config.mcpServers) config.mcpServers = {};
config.mcpServers.highbridge = {
  command: 'node',
  args: ['$INDEX_PATH'],
  env: {
    GHL_API_KEY: '$API_KEY',
    GHL_LOCATION_ID: '$LOCATION_ID'
  }
};
fs.writeFileSync(path, JSON.stringify(config, null, 2));
console.log('Claude Desktop config updated.');
"
echo ""

# Step 5: Verify
echo "Running live connection test..."
node "$DIR/src/index.js" --test
echo ""

echo "=========================================="
echo "  Setup complete!"
echo "  Restart Claude Desktop to activate."
echo "=========================================="
echo ""
