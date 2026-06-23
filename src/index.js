#!/usr/bin/env node
/**
 * HighBridge — GoHighLevel MCP Server
 * Full GoHighLevel MCP Server covering ALL major API surfaces:
 *   Contacts, Opportunities, Conversations, Calendar,
 *   Workflows, Campaigns, Forms, Funnels, Payments,
 *   Invoices, Email Marketing, Social, Reputation, Location, Agency
 *
 * Compatible with:
 *   - Claude Desktop, Claude Code (stdio transport)
 *   - Cursor, Windsurf, VS Code Copilot
 *   - Any MCP-compatible client
 *
 * https://highbridge.pro
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

// ── Auto-updater ───────────────────────────────────────────────────────────
// Two-path update system:
//   1. Git users  → silent git pull on startup, applies patch automatically
//   2. Zip buyers → version check against highbridge.pro, shows download link
// Both fail silently with no impact on server startup.
const CURRENT_VERSION = "1.2.0";

(async function checkForUpdates() {
  const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));

  // Path 1: git pull (cloned repo)
  try {
    const opts = { cwd: repoDir, timeout: 8000, stdio: "pipe" };
    execSync("git fetch origin main --quiet", opts);
    const behind = execSync("git rev-list HEAD..origin/main --count", opts)
      .toString().trim();
    if (parseInt(behind, 10) > 0) {
      execSync("git pull origin main --quiet", opts);
      console.error(`\n⚡  HighBridge updated (${behind} change(s) applied). Restart Claude Desktop to activate.\n`);
      return; // git handled it, skip version check
    }
    return; // already up to date via git
  } catch {
    // Not a git repo (zip install) — fall through to version check
  }

  // Path 2: version check for zip buyers
  try {
    const res = await fetch("https://raw.githubusercontent.com/centrender/ghl-mcp/main/version.json", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    const { version, message } = await res.json();
    if (version && version !== CURRENT_VERSION) {
      console.error(`\n⚡  HighBridge v${version} is available (you have v${CURRENT_VERSION}).`);
      if (message) console.error(`   ${message}`);
      console.error(`   Download: https://highbridge.pro/update\n`);
    }
  } catch {
    // Offline or server unreachable — continue silently
  }
})();

// ── Load env from .env file if present ────────────────────────────────────
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [key, ...vals] = line.split("=");
    if (key && vals.length) process.env[key.trim()] = vals.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

// ── Security validation (Rule 1 + Rule 4) ────────────────────────────────
import { validateEnvVars } from "./security.js";
validateEnvVars();  // exits with clear message if key/location are missing or malformed

// ── Config ────────────────────────────────────────────────────────────────
const GHL_API_KEY     = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

// ── GHL Client ────────────────────────────────────────────────────────────
import { GHLClient } from "./ghl-client.js";
const ghl = new GHLClient(GHL_API_KEY, GHL_LOCATION_ID);

// ── MCP Server ────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "highbridge",
  version: "1.2.0",
  description: "HighBridge: 90-tool GoHighLevel MCP server. https://highbridge.pro",
});

// ── Register all tool modules ─────────────────────────────────────────────
import { registerContactTools }        from "../tools/contacts.js";
import { registerOpportunityTools }    from "../tools/opportunities.js";
import { registerConversationTools }   from "../tools/conversations.js";
import { registerCalendarTools }       from "../tools/calendar.js";
import { registerWorkflowTools,
         registerCampaignTools,
         registerFormTools,
         registerFunnelTools,
         registerSocialTools }         from "../tools/automation.js";
import { registerPaymentTools }        from "../tools/payments.js";
import { registerEmailMarketingTools } from "../tools/email-marketing.js";
import { registerLocationTools,
         registerAgencyTools }         from "../tools/location.js";
import { registerReputationTools }     from "../tools/reputation.js";

registerContactTools(server, ghl);
registerOpportunityTools(server, ghl);
registerConversationTools(server, ghl);
registerCalendarTools(server, ghl);
registerWorkflowTools(server, ghl);
registerCampaignTools(server, ghl);
registerFormTools(server, ghl);
registerFunnelTools(server, ghl);
registerSocialTools(server, ghl);
registerPaymentTools(server, ghl);
registerEmailMarketingTools(server, ghl);
registerLocationTools(server, ghl);
registerAgencyTools(server, ghl);
registerReputationTools(server, ghl);

// ── Tool list helper ──────────────────────────────────────────────────────
server.tool(
  "ghl_list_tools",
  "List all available GHL MCP tools with descriptions.",
  {},
  async () => {
    const tools = [
      // Contacts
      "ghl_get_contacts", "ghl_get_contact", "ghl_create_contact", "ghl_update_contact",
      "ghl_upsert_contact", "ghl_delete_contact", "ghl_add_contact_tags",
      "ghl_remove_contact_tags", "ghl_get_contact_notes", "ghl_create_contact_note",
      "ghl_get_contact_tasks", "ghl_create_contact_task", "ghl_search_contacts",
      // Opportunities
      "ghl_get_pipelines", "ghl_get_opportunities", "ghl_get_opportunity",
      "ghl_create_opportunity", "ghl_update_opportunity", "ghl_move_opportunity_stage",
      "ghl_delete_opportunity", "ghl_pipeline_summary",
      // Conversations & Calls
      "ghl_get_conversations", "ghl_get_conversation", "ghl_get_messages",
      "ghl_send_sms", "ghl_send_email", "ghl_send_voicemail",
      "ghl_create_conversation", "ghl_mark_conversation_read", "ghl_update_conversation",
      "ghl_get_calls", "ghl_get_call_transcript",
      // Calendar
      "ghl_get_calendars", "ghl_get_appointments", "ghl_get_appointment",
      "ghl_create_appointment", "ghl_update_appointment",
      "ghl_delete_appointment", "ghl_get_free_slots", "ghl_get_blocked_slots",
      // Automation
      "ghl_get_workflows", "ghl_get_workflow", "ghl_trigger_workflow",
      "ghl_remove_from_workflow",
      "ghl_get_campaigns", "ghl_add_to_campaign", "ghl_remove_from_campaign",
      "ghl_fire_webhook", "ghl_get_forms", "ghl_get_form_submissions",
      "ghl_get_funnels", "ghl_get_funnel_pages",
      "ghl_get_social_posts", "ghl_create_social_post",
      // Payments
      "ghl_get_products", "ghl_create_product", "ghl_get_orders", "ghl_get_order",
      "ghl_get_invoices", "ghl_create_invoice", "ghl_send_invoice", "ghl_record_payment",
      "ghl_get_transactions", "ghl_get_subscriptions", "ghl_revenue_summary",
      // Email Marketing
      "ghl_get_email_campaigns", "ghl_create_email_campaign",
      "ghl_get_email_templates", "ghl_create_email_template", "ghl_update_email_template",
      "ghl_delete_email_template", "ghl_email_campaign_stats",
      // Location & Agency
      "ghl_get_location", "ghl_update_location", "ghl_get_users", "ghl_get_user",
      "ghl_create_user", "ghl_get_custom_fields", "ghl_get_custom_values",
      "ghl_get_tags", "ghl_location_snapshot",
      "ghl_get_sub_accounts", "ghl_create_sub_account",
      // Reputation
      "ghl_get_reviews", "ghl_get_review", "ghl_reply_to_review",
      "ghl_delete_review_reply", "ghl_send_review_request", "ghl_reputation_summary",
    ];
    return { content: [{ type: "text", text: `GHL MCP Server — ${tools.length} tools available:\n\n${tools.join("\n")}` }] };
  }
);

// ── --test mode: validate live connectivity, then exit ─────────────────────
// Runs a read-only probe against every API surface so a bad token, wrong
// locationId, or broken endpoint is caught on startup instead of at call time.
if (process.argv.includes("--test")) {
  const checks = [
    ["location",        () => ghl.get(`/locations/${ghl.locationId}`)],
    ["contacts",        () => ghl.get("/contacts/", { locationId: ghl.locationId, limit: 1 })],
    ["pipelines",       () => ghl.get("/opportunities/pipelines", { locationId: ghl.locationId })],
    ["conversations",   () => ghl.get("/conversations/search", { locationId: ghl.locationId, limit: 1 })],
    ["calendars",       () => ghl.get("/calendars/", { locationId: ghl.locationId })],
    ["workflows",       () => ghl.get("/workflows/", { locationId: ghl.locationId })],
    ["campaigns",       () => ghl.get("/campaigns/", { locationId: ghl.locationId })],
    ["forms",           () => ghl.get("/forms/", { locationId: ghl.locationId, limit: 1 })],
    ["funnels",         () => ghl.get("/funnels/funnel/list", { locationId: ghl.locationId, limit: 1 })],
    ["email_templates", () => ghl.get("/emails/builder", { locationId: ghl.locationId, limit: 1 })],
    ["email_campaigns", () => ghl.get("/emails/schedule", { locationId: ghl.locationId, limit: 1 })],
    ["products",        () => ghl.get("/products/", { locationId: ghl.locationId, limit: 1 })],
    ["custom_fields",   () => ghl.get(`/locations/${ghl.locationId}/customFields`)],
    ["custom_values",   () => ghl.get(`/locations/${ghl.locationId}/customValues`)],
    ["tags",            () => ghl.get(`/locations/${ghl.locationId}/tags`)],
    ["users",           () => ghl.get("/users/", { locationId: ghl.locationId })],
    ["reputation",      () => ghl.get("/reputation/reviews", { locationId: ghl.locationId, limit: 1 })],
  ];

  console.error(`\n🔎  Running --test against location ${ghl.locationId}\n`);
  let pass = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.error(`  ✅  ${name}`);
      pass++;
    } catch (err) {
      console.error(`  ❌  ${name}: ${String(err.message).slice(0, 200)}`);
    }
  }
  console.error(`\n${pass}/${checks.length} surfaces reachable.\n`);
  process.exit(pass === checks.length ? 0 : 1);
}

// ── Start server ──────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`✅  GHL MCP Server running — ${ghl.locationId}`);
