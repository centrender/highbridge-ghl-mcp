# HighBridge
### GHL MCP Server

**The only GHL MCP server built and verified against a real sub-account.**

90 tools. 16/17 API surfaces live-tested. 16 bugs fixed that ship broken everywhere else. Works in Claude Desktop, Cursor, Windsurf, and VS Code.

**Want 5-minute setup, 57 agency prompts, and one-click installer?**
**-> [highbridge.pro](https://highbridge.pro) — $97 founding price**

---

## Why this one

Every other GHL MCP has at least one of these problems:

| Problem | Who has it |
|---|---|
| Open repo stale, users being routed to paid SaaS | mastanley13 |
| Built from API docs, never tested against a real account | drausal (npm) |
| HTTP-only, incompatible with Claude Desktop | Official GHL MCP |

**HighBridge:**

- 90 tools, every major GHL surface, all working
- 16/17 API surfaces live-verified (reputation requires GHL Reputation Management add-on, clearly documented)
- 16 production bugs found and fixed, see list below
- Native stdio transport, works in Claude Desktop with no middleware
- Actively maintained by a solo GHL operator running it in production daily

---

## The 16 bugs fixed

1. `get_appointments`: wrong URL path, always 404
2. `delete_appointment`: IAM 401, missing required field
3. `create_appointment` / `update_appointment`: `appointmentStatus` field rejected by GHL
4. `search_contacts`: sent as GET, GHL requires POST
5. `create_contact_task`: missing required `completed` field
6. `move_opportunity_stage`: PATCH 404, GHL requires PUT
7. Custom fields path: 403 on wrong endpoint
8. Email templates: wrong endpoint (`/emails/templates` -> `/emails/builder`)
9. Email campaigns: wrong endpoint (`/emails/campaigns` -> `/emails/schedule`)
10. Payments: missing `altId`/`altType` params, returns empty
11. `create_invoice`: required fields missing, fails silently
12. `send_invoice`: missing userId, silently fails
13. `get_contacts` / `get_opportunities`: pagination off-by-one, drops last page
14. `get_form_submissions`: wrong page param name
15. `get_social_posts`: GET endpoint, GHL requires POST
16. `trigger_workflow`: timestamp format rejected (must be `+00:00` not `Z`)

---

## Tools (90 total)

| Module | Tools |
|---|---|
| Contacts | get, create, update, upsert, delete, search, add/remove tags, notes CRUD, tasks CRUD |
| Opportunities | list, get, create, update, delete, move stage, pipeline list, pipeline summary |
| Conversations + Calls | list, get, messages, send SMS / email, create, mark read, update, call log, transcript |
| Calendar | list calendars, CRUD appointments, free slots, blocked slots |
| Workflows | list, get, trigger for contact, remove contact |
| Campaigns | list, add contact, remove contact, fire webhook |
| Forms | list forms, get submissions |
| Funnels | list funnels, list pages |
| Social | list posts, create/schedule post |
| Payments | products, orders, invoices (create/send/record), transactions, subscriptions, revenue summary |
| Email Marketing | templates CRUD, campaigns CRUD, campaign stats |
| Reputation + Reviews | list reviews, get review, reply, delete reply, send review request, summary |
| Location + Agency | settings, users, custom fields/values, tags, health snapshot, sub-accounts |

---

## Setup

### 1. Get your GHL Private Integration Token

GHL → Settings → Integrations → API Keys → Create Private Integration → check all scopes → copy key (starts with `pit-`).

### 2. Get your Location ID

It's in the URL when inside a sub-account:
`https://app.gohighlevel.com/location/YOUR_LOCATION_ID/...`

### 3. Install

```bash
git clone https://github.com/centrender/highbridge-ghl-mcp.git
cd highbridge-ghl-mcp
npm install
cp .env.example .env
# Add your GHL_API_KEY and GHL_LOCATION_ID to .env
```

### 4. Verify it works

```bash
node src/index.js --test
```

17 live API surface checks fire against your GHL account. Expect 16 green. Reputation shows red if you don't have the GHL Reputation Management add-on, everything else should pass.

### 5. Connect to Claude Desktop

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "highbridge": {
      "command": "node",
      "args": ["/absolute/path/to/highbridge-ghl-mcp/src/index.js"],
      "env": {
        "GHL_API_KEY": "pit-your-key-here",
        "GHL_LOCATION_ID": "your-location-id-here"
      }
    }
  }
}
```

Restart Claude Desktop. Tools appear automatically.

### Connect to Cursor / Windsurf / VS Code

Same config format. Check your editor's MCP docs for the config file location.

---

## Usage examples

```
"Give me a full snapshot of my GHL account"
"Show me all contacts tagged 'RVM Sent' added this week"
"Enroll all uncontacted leads from this week into my follow-up workflow"
"Send a follow-up SMS to all contacts in stage 'Called Back'"
"Create an invoice for $497 for contact [ID], due in 7 days, and send it"
"Book an appointment for [contact] tomorrow at 2pm"
"Pull my revenue summary for this month"
"List all open reviews under 4 stars and draft replies" *(requires GHL Reputation Management add-on)*
```

---

## Platform support

| Platform | Support |
|---|---|
| Claude Desktop | Native (stdio) |
| Claude Code | Native |
| Cursor | Native |
| Windsurf | Native |
| VS Code Copilot | Native |

---

## Want the full package?

The repo gives you the server. **[highbridge.pro](https://highbridge.pro)** gives you:

- Pre-configured setup that works in 5 minutes (no debugging)
- 57 battle-tested GHL agency prompts
- One-click installer for Windows and Mac
- Lifetime updates with notification when GHL changes their API
- 7-day refund if it doesn't work on your setup

Founding price: $97. Goes to $147 after 100 buyers.

---

## License

CC BY-NC 4.0 — free for personal and agency use. Commercial resale or redistribution of this codebase as a paid product is not permitted.

---

## Built by

Faruk Sahin — [Centrender LLC](https://centrender.com) · [highbridge.pro](https://highbridge.pro)

Running this in production at VoxLead Agency. If it breaks, I fix it, because I use it too.

Issues and PRs welcome.
