import { z } from "zod";
import { makeTool } from "../src/utils.js";

export function registerWorkflowTools(server, ghl) {
  // ── GET WORKFLOWS ─────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_workflows",
    "List all automation workflows in the location.",
    {},
    async () => {
      const data = await ghl.get("/workflows/", { locationId: ghl.locationId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET WORKFLOW BY ID ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_workflow",
    "Get a single workflow by ID. (GHL has no single-workflow endpoint, " +
      "so this filters the location's workflow list.)",
    { workflow_id: z.string() },
    async ({ workflow_id }) => {
      const data = await ghl.get("/workflows/", { locationId: ghl.locationId });
      const workflow = (data.workflows || []).find((w) => w.id === workflow_id);
      if (!workflow) {
        return {
          content: [{ type: "text", text: `No workflow found with id ${workflow_id}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(workflow, null, 2) }] };
    }
  );

  // ── TRIGGER WORKFLOW FOR CONTACT ──────────────────────────────────────────
  makeTool(server,
    "ghl_trigger_workflow",
    "Add a contact into a specific workflow (trigger automation).",
    {
      workflow_id: z.string(),
      contact_id: z.string(),
      event: z.string().optional().describe("Custom event name if workflow uses event trigger"),
    },
    async ({ workflow_id, contact_id, event }) => {
      // GHL requires a tz-offset timestamp WITHOUT milliseconds, e.g.
      // 2026-06-20T10:00:00+00:00 — the trailing-Z / .000 forms are both rejected.
      const data = await ghl.post(`/contacts/${contact_id}/workflow/${workflow_id}`, {
        eventStartTime: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
        event,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── REMOVE FROM WORKFLOW ──────────────────────────────────────────────────
  makeTool(server,
    "ghl_remove_from_workflow",
    "Remove a contact from a workflow.",
    {
      workflow_id: z.string(),
      contact_id: z.string(),
    },
    async ({ workflow_id, contact_id }) => {
      const data = await ghl.delete(`/contacts/${contact_id}/workflow/${workflow_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}

export function registerCampaignTools(server, ghl) {
  // ── GET CAMPAIGNS ─────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_campaigns",
    "List all campaigns in the location.",
    {
      status: z.enum(["active", "inactive", "draft", "archived", "deleted", "all"]).default("all"),
    },
    async ({ status }) => {
      const data = await ghl.get("/campaigns/", {
        locationId: ghl.locationId,
        status: status === "all" ? undefined : status,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── ADD CONTACT TO CAMPAIGN ───────────────────────────────────────────────
  makeTool(server,
    "ghl_add_to_campaign",
    "Add a contact to a campaign (starts the campaign's drip sequence for them).",
    {
      contact_id: z.string(),
      campaign_id: z.string(),
    },
    async ({ contact_id, campaign_id }) => {
      const data = await ghl.post(`/contacts/${contact_id}/campaigns/${campaign_id}`, {});
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── REMOVE CONTACT FROM CAMPAIGN ──────────────────────────────────────────
  makeTool(server,
    "ghl_remove_from_campaign",
    "Remove a contact from a specific campaign, or from all campaigns if no " +
      "campaign_id is given.",
    {
      contact_id: z.string(),
      campaign_id: z.string().optional().describe("Omit to remove from ALL campaigns"),
    },
    async ({ contact_id, campaign_id }) => {
      const path = campaign_id
        ? `/contacts/${contact_id}/campaigns/${campaign_id}`
        : `/contacts/${contact_id}/campaigns/removeAll`;
      const data = await ghl.delete(path);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── FIRE WEBHOOK EVENT ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_fire_webhook",
    "POST a JSON payload to a GHL Inbound Webhook trigger URL to kick off a " +
      "workflow that listens for it. Provide the full webhook URL from the " +
      "workflow's Inbound Webhook trigger.",
    {
      webhook_url: z.string().url().describe("Full inbound webhook trigger URL"),
      payload: z.record(z.any()).describe("Arbitrary JSON body to send"),
    },
    async ({ webhook_url, payload }) => {
      const res = await fetch(webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Webhook POST failed ${res.status}: ${text}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Webhook fired (${res.status}). Response: ${text || "(empty)"}` }],
      };
    }
  );
}

export function registerFormTools(server, ghl) {
  // ── GET FORMS ─────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_forms",
    "List all forms in the location.",
    {
      skip: z.number().default(0),
      limit: z.number().default(20),
    },
    async ({ skip, limit }) => {
      const data = await ghl.get("/forms/", {
        locationId: ghl.locationId,
        skip,
        limit,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET FORM SUBMISSIONS ──────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_form_submissions",
    "Get submissions for a specific form.",
    {
      form_id: z.string().describe("Form ID, or 'all' for every form"),
      limit: z.number().default(20),
      page: z.number().default(1).describe("1-based page number"),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
    },
    async ({ form_id, limit, page, start_date, end_date }) => {
      const data = await ghl.get("/forms/submissions", {
        locationId: ghl.locationId,
        formId: form_id === "all" ? undefined : form_id,
        limit,
        page,
        startAt: start_date,
        endAt: end_date,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}

export function registerFunnelTools(server, ghl) {
  // ── GET FUNNELS ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_funnels",
    "List all funnels in the location.",
    {
      category: z.enum(["funnel", "website", "all"]).default("all"),
    },
    async ({ category }) => {
      const data = await ghl.get("/funnels/funnel/list", {
        locationId: ghl.locationId,
        type: category === "all" ? undefined : category,
        limit: 100,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET FUNNEL PAGES ──────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_funnel_pages",
    "Get all pages within a funnel.",
    { funnel_id: z.string() },
    async ({ funnel_id }) => {
      const data = await ghl.get("/funnels/page", {
        locationId: ghl.locationId,
        funnelId: funnel_id,
        limit: 100,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}

export function registerSocialTools(server, ghl) {
  // ── GET SOCIAL POSTS ──────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_social_posts",
    "List scheduled/published social media posts. Searches across all connected " +
      "social accounts (fetched automatically).",
    {
      skip: z.number().default(0),
      limit: z.number().default(20),
      type: z.enum(["all", "draft", "scheduled", "published", "failed", "in_review", "deleted"]).default("all"),
      account_ids: z.array(z.string()).optional().describe("Restrict to these account IDs; defaults to all connected"),
    },
    async ({ skip, limit, type, account_ids }) => {
      let accounts = account_ids;
      if (!accounts || accounts.length === 0) {
        const acc = await ghl.get(`/social-media-posting/${ghl.locationId}/accounts`);
        accounts = (acc.results?.accounts || []).map((a) => a.id || a._id);
      }
      if (accounts.length === 0) {
        return { content: [{ type: "text", text: "No social accounts are connected to this location." }] };
      }
      // GHL wants accounts as a comma-joined string and skip/limit as numeric strings.
      const data = await ghl.post(`/social-media-posting/${ghl.locationId}/posts/list`, {
        type,
        accounts: accounts.join(","),
        skip: String(skip),
        limit: String(limit),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE SOCIAL POST ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_social_post",
    "Schedule a social media post across connected accounts.",
    {
      content: z.string().describe("Post text content"),
      schedule_at: z.string().optional().describe("ISO datetime to publish; omit to post immediately"),
      account_ids: z.array(z.string()).describe("Connected social account IDs to post to"),
      media_urls: z.array(z.string()).optional().describe("Image/video URLs to attach"),
    },
    async ({ content, schedule_at, account_ids, media_urls }) => {
      const data = await ghl.post("/social-media-posting/post", {
        locationId: ghl.locationId,
        content,
        scheduleAt: schedule_at,
        accountIds: account_ids,
        media: media_urls?.map((url) => ({ url })),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
