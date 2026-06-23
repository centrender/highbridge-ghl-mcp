import { z } from "zod";
import { sanitizeText, sanitizeId, sanitizeUrl, detectPromptInjection } from "../src/security.js";
import { makeTool } from "../src/utils.js";

// Helper: sanitize all free-text contact fields before they hit GHL
function sanitizeContactFields(args) {
  return {
    firstName:  sanitizeText(args.first_name, 100),
    lastName:   sanitizeText(args.last_name, 100),
    email:      args.email,
    phone:      args.phone,
    companyName: sanitizeText(args.company_name, 200),
    address1:   sanitizeText(args.address1, 300),
    city:       sanitizeText(args.city, 100),
    state:      sanitizeText(args.state, 100),
    country:    sanitizeText(args.country, 100),
    postalCode: sanitizeText(args.postal_code, 20),
    website:    args.website ? sanitizeUrl(args.website) : undefined,
    source:     sanitizeText(args.source, 100),
    tags:       args.tags?.map((t) => sanitizeText(t, 100)),
    customFields: args.custom_fields
      ? Object.entries(args.custom_fields).map(([key, value]) => ({
          key: sanitizeText(key, 100),
          field_value: sanitizeText(value, 500),
        }))
      : undefined,
  };
}

export function registerContactTools(server, ghl) {
  // ── GET CONTACTS ──────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_contacts",
    "List contacts with optional filters. Returns paginated results.",
    {
      limit:          z.number().min(1).max(100).default(20).describe("Number of contacts to return"),
      start_after_id: z.string().optional().describe("Contact ID to page after (cursor pagination)"),
      query:          z.string().max(200).optional().describe("Search by name, email or phone"),
      tags:           z.string().max(500).optional().describe("Comma-separated tags to filter by"),
      pipeline_id:    z.string().optional(),
      stage_id:       z.string().optional(),
    },
    async ({ limit, start_after_id, query, tags, pipeline_id, stage_id }) => {
      // GHL /contacts/ does not accept tags as a server-side filter — filter client-side instead.
      const data = await ghl.get("/contacts/", {
        locationId:   ghl.locationId,
        limit:        tags ? 100 : limit,   // fetch more when we need to tag-filter
        startAfterId: start_after_id ? sanitizeId(start_after_id) : undefined,
        query:        sanitizeText(query, 200),
        pipelineId:   pipeline_id ? sanitizeId(pipeline_id) : undefined,
        stageId:      stage_id    ? sanitizeId(stage_id)    : undefined,
      });

      if (tags) {
        const tagList = tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        const all = data.contacts || [];
        data.contacts = all.filter((c) => {
          const contactTags = (c.tags || []).map((t) => t.toLowerCase());
          return tagList.some((t) => contactTags.includes(t));
        });
        data._tagFilter = tagList;
        data._scannedTotal = all.length;
      }

      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET SINGLE CONTACT ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_contact",
    "Get full details of a single contact by ID.",
    { contact_id: z.string().describe("Contact ID") },
    async ({ contact_id }) => {
      const data = await ghl.get(`/contacts/${sanitizeId(contact_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE CONTACT ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_contact",
    "Create a new contact in GHL.",
    {
      first_name:    z.string().max(100).optional(),
      last_name:     z.string().max(100).optional(),
      email:         z.string().email().max(254).optional(),
      phone:         z.string().max(20).optional(),
      company_name:  z.string().max(200).optional(),
      address1:      z.string().max(300).optional(),
      city:          z.string().max(100).optional(),
      state:         z.string().max(100).optional(),
      country:       z.string().max(100).optional(),
      postal_code:   z.string().max(20).optional(),
      website:       z.string().max(500).optional(),
      source:        z.string().max(100).optional().describe("Lead source (e.g. 'RVM', 'cold_email')"),
      tags:          z.array(z.string().max(100)).optional(),
      custom_fields: z.record(z.string().max(500)).optional().describe("Key-value custom field map"),
    },
    async (args) => {
      const body = { locationId: ghl.locationId, ...sanitizeContactFields(args) };
      const data = await ghl.post("/contacts/", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPDATE CONTACT ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_update_contact",
    "Update an existing contact by ID.",
    {
      contact_id:    z.string(),
      first_name:    z.string().max(100).optional(),
      last_name:     z.string().max(100).optional(),
      email:         z.string().email().max(254).optional(),
      phone:         z.string().max(20).optional(),
      company_name:  z.string().max(200).optional(),
      tags:          z.array(z.string().max(100)).optional(),
      source:        z.string().max(100).optional(),
      custom_fields: z.record(z.string().max(500)).optional(),
    },
    async ({ contact_id, ...args }) => {
      const body = sanitizeContactFields(args);
      const data = await ghl.put(`/contacts/${sanitizeId(contact_id)}`, body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPSERT CONTACT ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_upsert_contact",
    "Create a contact, or update it if one already exists with the same email/phone. " +
      "GHL dedupes on email then phone within the location.",
    {
      first_name:    z.string().max(100).optional(),
      last_name:     z.string().max(100).optional(),
      email:         z.string().email().max(254).optional(),
      phone:         z.string().max(20).optional(),
      company_name:  z.string().max(200).optional(),
      address1:      z.string().max(300).optional(),
      city:          z.string().max(100).optional(),
      state:         z.string().max(100).optional(),
      country:       z.string().max(100).optional(),
      postal_code:   z.string().max(20).optional(),
      website:       z.string().max(500).optional(),
      source:        z.string().max(100).optional(),
      tags:          z.array(z.string().max(100)).optional(),
      custom_fields: z.record(z.string().max(500)).optional(),
    },
    async (args) => {
      const body = { locationId: ghl.locationId, ...sanitizeContactFields(args) };
      const data = await ghl.post("/contacts/upsert", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELETE CONTACT ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_delete_contact",
    "Delete a contact by ID.",
    { contact_id: z.string() },
    async ({ contact_id }) => {
      const data = await ghl.delete(`/contacts/${sanitizeId(contact_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── ADD TAGS ──────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_add_contact_tags",
    "Add tags to a contact.",
    {
      contact_id: z.string(),
      tags: z.array(z.string().max(100)).describe("Tags to add"),
    },
    async ({ contact_id, tags }) => {
      const data = await ghl.post(`/contacts/${sanitizeId(contact_id)}/tags`, {
        tags: tags.map((t) => sanitizeText(t, 100)),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── REMOVE TAGS ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_remove_contact_tags",
    "Remove tags from a contact.",
    {
      contact_id: z.string(),
      tags: z.array(z.string().max(100)).describe("Tags to remove"),
    },
    async ({ contact_id, tags }) => {
      const data = await ghl.delete(`/contacts/${sanitizeId(contact_id)}/tags`, {
        tags: tags.map((t) => sanitizeText(t, 100)),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET NOTES ─────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_contact_notes",
    "Get all notes for a contact.",
    { contact_id: z.string() },
    async ({ contact_id }) => {
      const data = await ghl.get(`/contacts/${sanitizeId(contact_id)}/notes`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE NOTE ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_contact_note",
    "Add a note to a contact.",
    {
      contact_id: z.string(),
      body:    z.string().max(5000).describe("Note text content"),
      user_id: z.string().optional().describe("GHL user ID to attribute note to"),
    },
    async ({ contact_id, body, user_id }) => {
      // Notes can come from external sources — check for prompt injection
      const safeBody = detectPromptInjection(sanitizeText(body, 5000), "note body");
      const data = await ghl.post(`/contacts/${sanitizeId(contact_id)}/notes`, {
        body: safeBody,
        userId: user_id ? sanitizeId(user_id) : undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET TASKS ─────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_contact_tasks",
    "Get all tasks assigned to a contact.",
    { contact_id: z.string() },
    async ({ contact_id }) => {
      const data = await ghl.get(`/contacts/${sanitizeId(contact_id)}/tasks`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE TASK ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_contact_task",
    "Create a task for a contact.",
    {
      contact_id:  z.string(),
      title:       z.string().max(200),
      body:        z.string().max(2000).optional(),
      due_date:    z.string().describe("ISO 8601 due date"),
      assigned_to: z.string().optional().describe("User ID to assign task to"),
    },
    async ({ contact_id, title, body, due_date, assigned_to }) => {
      const data = await ghl.post(`/contacts/${sanitizeId(contact_id)}/tasks`, {
        title:      sanitizeText(title, 200),
        body:       body ? sanitizeText(body, 2000) : undefined,
        dueDate:    due_date,
        assignedTo: assigned_to ? sanitizeId(assigned_to) : undefined,
        completed:  false,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── BULK SEARCH ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_search_contacts",
    "Advanced contact search by name, email, phone, or company.",
    {
      query: z.string().max(200).describe("Search string (name, email, phone, company)"),
      limit: z.number().min(1).max(100).default(20),
    },
    async ({ query, limit }) => {
      // GHL search is POST /contacts/search (GET routes /search as a contact id).
      const data = await ghl.post("/contacts/search", {
        locationId: ghl.locationId,
        query:      sanitizeText(query, 200),
        pageLimit:  limit,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
