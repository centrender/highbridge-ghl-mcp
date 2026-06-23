import { z } from "zod";
import { makeTool } from "../src/utils.js";

// GHL email surface notes (verified live against LeadConnector v2):
//   • Templates live under /emails/builder (the response key is "builders").
//   • Scheduled campaigns live under /emails/schedule (response key "schedules").
//   • Template content is saved via POST /emails/builder/data and REQUIRES updatedBy.
//   • Delete is DELETE /emails/builder/{locationId}/{templateId}.

export function registerEmailMarketingTools(server, ghl) {
  // ── GET EMAIL CAMPAIGNS ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_email_campaigns",
    "List scheduled/sent email campaigns (broadcasts) in the location.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
    },
    async ({ limit, skip }) => {
      const data = await ghl.get("/emails/schedule", {
        locationId: ghl.locationId,
        limit,
        skip,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE EMAIL CAMPAIGN (SCHEDULE) ──────────────────────────────────────
  makeTool(server,
    "ghl_create_email_campaign",
    "Schedule an email campaign broadcast from an existing template. " +
      "Build/import the template first with ghl_create_email_template and pass its ID.",
    {
      name: z.string().describe("Internal campaign name"),
      template_id: z.string().describe("Builder template ID to send"),
      send_at: z.string().describe("ISO datetime to send"),
      from_name: z.string(),
      from_email: z.string().email(),
      reply_to: z.string().email().optional(),
    },
    async (args) => {
      const data = await ghl.post("/emails/schedule", {
        locationId: ghl.locationId,
        name: args.name,
        templateId: args.template_id,
        sendAt: args.send_at,
        fromName: args.from_name,
        fromEmail: args.from_email,
        replyToEmail: args.reply_to,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET EMAIL TEMPLATES ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_email_templates",
    "List saved email templates (builders) in the location.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
    },
    async ({ limit, skip }) => {
      const data = await ghl.get("/emails/builder", {
        locationId: ghl.locationId,
        limit,
        skip,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE EMAIL TEMPLATE ─────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_email_template",
    "Create a saved email template for reuse in campaigns or workflows. " +
      "Pass body_html to set initial content (saved via the builder data endpoint).",
    {
      name: z.string().describe("Template name"),
      body_html: z.string().optional().describe("HTML body (supports {{contact.*}} variables)"),
      is_plain_text: z.boolean().default(false).describe("Set true for plain text emails"),
      updated_by: z.string().default("ghl-mcp").describe("Author label stored on the template"),
    },
    async ({ name, body_html, is_plain_text, updated_by }) => {
      const created = await ghl.post("/emails/builder", {
        locationId: ghl.locationId,
        title: name,
        type: "html",
        isPlainText: is_plain_text,
        updatedBy: updated_by,
      });
      const templateId = created.id || created.redirect;
      // If content was supplied, persist it to the new template.
      if (body_html && templateId) {
        await ghl.post("/emails/builder/data", {
          locationId: ghl.locationId,
          templateId,
          editorType: "html",
          html: body_html,
          updatedBy: updated_by,
        });
      }
      return { content: [{ type: "text", text: JSON.stringify({ templateId, ...created }, null, 2) }] };
    }
  );

  // ── UPDATE EMAIL TEMPLATE ─────────────────────────────────────────────────
  makeTool(server,
    "ghl_update_email_template",
    "Update an existing email template's HTML/subject content.",
    {
      template_id: z.string(),
      body_html: z.string().describe("New HTML body"),
      subject: z.string().optional(),
      updated_by: z.string().default("ghl-mcp").describe("Author label (required by GHL)"),
    },
    async ({ template_id, body_html, subject, updated_by }) => {
      const data = await ghl.post("/emails/builder/data", {
        locationId: ghl.locationId,
        templateId: template_id,
        editorType: "html",
        html: body_html,
        ...(subject ? { subject } : {}),
        updatedBy: updated_by,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELETE EMAIL TEMPLATE ─────────────────────────────────────────────────
  makeTool(server,
    "ghl_delete_email_template",
    "Delete an email template by ID.",
    { template_id: z.string() },
    async ({ template_id }) => {
      const data = await ghl.delete(`/emails/builder/${ghl.locationId}/${template_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── EMAIL CAMPAIGN STATS ──────────────────────────────────────────────────
  makeTool(server,
    "ghl_email_campaign_stats",
    "Get delivery/open/click stats for a scheduled email campaign by ID.",
    { campaign_id: z.string().describe("Schedule (campaign) ID from ghl_get_email_campaigns") },
    async ({ campaign_id }) => {
      const data = await ghl.get("/emails/statistics", {
        locationId: ghl.locationId,
        emailId: campaign_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
