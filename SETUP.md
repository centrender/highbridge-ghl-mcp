# HighBridge — 5-Minute Setup Guide

**You'll be done before your coffee gets cold.**

---

## What you need

- Node.js v18 or higher — [download from nodejs.org](https://nodejs.org) (LTS version)
- Claude Desktop — [download from claude.ai/download](https://claude.ai/download)
- A GoHighLevel account with API access
- 5 minutes

---

## Step 1: Get your GHL Private Integration Token

1. Log into GoHighLevel
2. Go to **Settings → Integrations → API Keys**
3. Click **Create Private Integration**
4. Name it: `HighBridge MCP`
5. Scopes: check all of the following — **Contacts, Conversations, Calendars, Opportunities, Workflows, Campaigns, Payments, Marketing, Forms, Funnels, Social Planner, Products, Invoices, Emails, Location, Users, Reputation Management**. Missing scopes cause 401 errors on specific tools.
6. Click **Create**
7. Copy the token — it starts with `pit-`

**Get your Location ID:**
Look at the URL when you're inside a sub-account:
`https://app.gohighlevel.com/location/YOUR_LOCATION_ID/dashboard`
Copy that `YOUR_LOCATION_ID` part.

---

## Step 2: Install HighBridge

**Windows:**
```
1. Extract the zip to a folder you'll keep (e.g. C:\Tools\highbridge)
2. Open Command Prompt in that folder (Shift + Right-click → Open PowerShell here)
3. Run: npm install
```

**Mac:**
```
1. Extract the zip to a folder you'll keep (e.g. ~/Tools/highbridge)
2. Open Terminal, navigate there: cd ~/Tools/highbridge
3. Run: npm install
```

You'll see packages installing. Takes 30 seconds.

---

## Step 3: Add your credentials

1. In the highbridge folder, find `.env.example`
2. Copy it and rename the copy to `.env`
3. Open `.env` in any text editor and fill in:

```
GHL_API_KEY=pit-your-token-here
GHL_LOCATION_ID=your-location-id-here
```

Save the file.

---

## Step 4: Connect to Claude Desktop

**Find your Claude config file:**

- **Windows:** Press `Win+R`, type `%APPDATA%\Claude`, press Enter. Open `claude_desktop_config.json`.
- **Mac:** Press `Cmd+Space`, type `~/Library/Application Support/Claude`, press Enter. Open `claude_desktop_config.json`.

If the file doesn't exist yet, create it.

**Add this block** (replace the path with your actual folder path):

**Windows:**
```json
{
  "mcpServers": {
    "highbridge": {
      "command": "node",
      "args": ["C:\\Tools\\highbridge\\src\\index.js"],
      "env": {
        "GHL_API_KEY": "pit-your-token-here",
        "GHL_LOCATION_ID": "your-location-id-here"
      }
    }
  }
}
```

**Mac:**
```json
{
  "mcpServers": {
    "highbridge": {
      "command": "node",
      "args": ["/Users/yourname/Tools/highbridge/src/index.js"],
      "env": {
        "GHL_API_KEY": "pit-your-token-here",
        "GHL_LOCATION_ID": "your-location-id-here"
      }
    }
  }
}
```

Save the file.

---

## Step 5: Verify it works

Open a terminal in the highbridge folder and run:

```bash
node src/index.js --test
```

You'll see 16 live API surface checks fire against your GHL account:

```
✅  location
✅  contacts
✅  pipelines
✅  conversations
✅  calendars
✅  workflows
...
16/17 surfaces reachable.
```

If `reputation` shows ❌, that's expected unless you have GHL's Reputation Management add-on. Everything else should be green. If anything else fails, the error message tells you exactly what's wrong (usually a missing scope on your token).

---

## Step 6: Restart Claude Desktop

Fully quit Claude Desktop and reopen it. The HighBridge tools appear automatically in the tool list.

**Test it:** Type in Claude: `"List my GHL workflows"` — you should get your workflow list back immediately.

---

## Troubleshooting

**"Missing required env vars"** — Your `.env` file or the env block in `claude_desktop_config.json` is missing or has a typo. Double-check both.

**"GHL_API_KEY does not look like a Private Integration Token"** — The key must start with `pit-`. Make sure you created a **Private Integration** key, not a regular API key.

**"401 Unauthorized"** — Token scopes are too narrow. Go back to GHL and add the missing scopes to your integration.

**Reputation tools show ❌ in --test** — Reputation Management is a GHL add-on. If your account doesn't have it, the scope won't appear in your PIT settings and those 6 tools will return 401. All other tools are unaffected. If you do have reputation management, make sure you checked that scope when creating your token.

**Claude doesn't see the tools** — Make sure you fully quit and restarted Claude Desktop (not just closed the window). On Mac: Cmd+Q. On Windows: right-click taskbar icon → Quit.

**npm not found** — Node.js isn't installed or isn't in your PATH. Download from nodejs.org (LTS version) and restart your terminal after installing.

---

## You're live.

57 battle-tested GHL agency prompts are included in the full package at [highbridge.pro](https://highbridge.pro).

Questions? support@centrender.com
