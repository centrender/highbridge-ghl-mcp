import { z } from "zod";
import { makeTool } from "../src/utils.js";

export function registerLocationTools(server, ghl) {
  // ── GET LOCATION ──────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_location",
    "Get current location/sub-account details and settings.",
    {},
    async () => {
      const data = await ghl.get(`/locations/${ghl.locationId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPDATE LOCATION ───────────────────────────────────────────────────────
  makeTool(server,
    "ghl_update_location",
    "Update location settings.",
    {
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      website: z.string().optional(),
      timezone: z.string().optional(),
    },
    async (args) => {
      const data = await ghl.put(`/locations/${ghl.locationId}`, args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET USERS ─────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_users",
    "List all users in the location.",
    {},
    async () => {
      const data = await ghl.get("/users/", { locationId: ghl.locationId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET USER ──────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_user",
    "Get details of a specific user by ID.",
    { user_id: z.string() },
    async ({ user_id }) => {
      const data = await ghl.get(`/users/${user_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE USER ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_user",
    "Create a new GHL user and assign to location.",
    {
      first_name: z.string(),
      last_name: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      role: z.enum(["admin", "user"]).default("user"),
      permissions: z.object({
        contactsEnabled: z.boolean().default(true),
        workflowsEnabled: z.boolean().default(true),
        opportunitiesEnabled: z.boolean().default(true),
        settingsEnabled: z.boolean().default(false),
        campaignsEnabled: z.boolean().default(true),
        conversationsEnabled: z.boolean().default(true),
      }).optional(),
    },
    async (args) => {
      const data = await ghl.post("/users/", {
        locationId: ghl.locationId,
        firstName: args.first_name,
        lastName: args.last_name,
        email: args.email,
        phone: args.phone,
        type: args.role,
        permissions: args.permissions ?? {
          contactsEnabled: true,
          workflowsEnabled: true,
          opportunitiesEnabled: true,
          settingsEnabled: false,
          campaignsEnabled: true,
          conversationsEnabled: true,
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET CUSTOM FIELDS ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_custom_fields",
    "List all custom fields defined in the location.",
    {
      model: z.enum(["contact", "opportunity", "all"]).default("contact"),
    },
    async ({ model }) => {
      const data = await ghl.get(`/locations/${ghl.locationId}/customFields`, {
        model: model === "all" ? undefined : model,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET CUSTOM VALUES ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_custom_values",
    "List all custom values (dropdown options) in the location.",
    {},
    async () => {
      const data = await ghl.get(`/locations/${ghl.locationId}/customValues`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET TAGS ──────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_tags",
    "List all available tags in the location.",
    {},
    async () => {
      const data = await ghl.get(`/locations/${ghl.locationId}/tags`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SNAPSHOT / LOCATION HEALTH ────────────────────────────────────────────
  makeTool(server,
    "ghl_location_snapshot",
    "Get a comprehensive health snapshot of the location: contacts, pipelines, campaigns, revenue.",
    {},
    async () => {
      const [contacts, pipelines, campaigns, workflows] = await Promise.allSettled([
        ghl.post("/contacts/search", { locationId: ghl.locationId, query: "", pageLimit: 1 }),
        ghl.get("/opportunities/pipelines", { locationId: ghl.locationId }),
        ghl.get("/campaigns/", { locationId: ghl.locationId }),
        ghl.get("/workflows/", { locationId: ghl.locationId }),
      ]);

      // Safely extract a value from a settled promise result, with a fallback.
      const settled = (result, extract, fallback = 0) => {
        if (result.status !== "fulfilled") return fallback;
        try { return extract(result.value) ?? fallback; } catch { return fallback; }
      };

      const pipelinesList = settled(pipelines, (v) => v.pipelines, []);
      const workflowsList = settled(workflows, (v) => v.workflows, []);

      // Build per-pipeline stage counts for bonus context
      const pipelineSummary = pipelinesList.map((p) => ({
        name:   p.name,
        id:     p.id,
        stages: (p.stages || []).length,
      }));

      const snapshot = {
        generated_at:   new Date().toISOString(),
        location_id:    ghl.locationId,
        contacts_total: settled(contacts, (v) => v.total ?? v.contacts?.length),
        pipelines:      pipelinesList.length,
        pipeline_detail: pipelineSummary,
        campaigns:      settled(campaigns, (v) => v.campaigns?.length),
        workflows:      workflowsList.length,
        workflows_active: workflowsList.filter((w) => w.status === "published").length,
        workflows_draft:  workflowsList.filter((w) => w.status === "draft").length,
      };
      return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }] };
    }
  );
}

export function registerAgencyTools(server, ghl) {
  // ── GET SUB-ACCOUNTS (Agency level) ──────────────────────────────────────
  makeTool(server,
    "ghl_get_sub_accounts",
    "List all sub-accounts under the agency. Requires Agency API key.",
    {
      company_id: z.string().describe("Agency company ID"),
      limit: z.number().default(20),
      skip: z.number().default(0),
    },
    async ({ company_id, limit, skip }) => {
      const data = await ghl.get("/locations/search", {
        companyId: company_id,
        limit,
        skip,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE SUB-ACCOUNT ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_sub_account",
    "Create a new client sub-account under the agency.",
    {
      company_id: z.string().describe("Agency company ID"),
      name: z.string().describe("Business/client name"),
      email: z.string().email(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().default("US"),
      timezone: z.string().default("America/Los_Angeles"),
      snapshot_id: z.string().optional().describe("Apply a GHL snapshot on creation"),
    },
    async (args) => {
      const data = await ghl.post("/locations/", {
        companyId: args.company_id,
        name: args.name,
        email: args.email,
        phone: args.phone,
        address: args.address,
        city: args.city,
        state: args.state,
        country: args.country,
        timezone: args.timezone,
        snapshotId: args.snapshot_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
