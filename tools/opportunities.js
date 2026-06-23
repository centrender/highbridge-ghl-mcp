import { z } from "zod";
import { makeTool } from "../src/utils.js";

export function registerOpportunityTools(server, ghl) {
  // ── GET PIPELINES ─────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_pipelines",
    "List all pipelines and their stages in the location.",
    {},
    async () => {
      const data = await ghl.get("/opportunities/pipelines", {
        locationId: ghl.locationId,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET OPPORTUNITIES ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_opportunities",
    "List opportunities with optional filters. Essential for pipeline reporting.",
    {
      pipeline_id: z.string().optional(),
      stage_id: z.string().optional(),
      status: z.enum(["open", "won", "lost", "abandoned", "all"]).default("all"),
      contact_id: z.string().optional(),
      limit: z.number().default(20),
      start_after_id: z.string().optional().describe("Opportunity ID to page after (cursor pagination)"),
      assigned_to: z.string().optional(),
      start_date: z.string().optional().describe("ISO date filter"),
      end_date: z.string().optional().describe("ISO date filter"),
    },
    async (args) => {
      const data = await ghl.get("/opportunities/search", {
        location_id: ghl.locationId,
        pipeline_id: args.pipeline_id,
        stage_id: args.stage_id,
        status: args.status,
        contact_id: args.contact_id,
        limit: args.limit,
        startAfterId: args.start_after_id,
        assigned_to: args.assigned_to,
        startDate: args.start_date,
        endDate: args.end_date,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET SINGLE OPPORTUNITY ────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_opportunity",
    "Get full details of an opportunity.",
    { opportunity_id: z.string() },
    async ({ opportunity_id }) => {
      const data = await ghl.get(`/opportunities/${opportunity_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE OPPORTUNITY ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_opportunity",
    "Create a new opportunity/deal in a pipeline.",
    {
      pipeline_id: z.string(),
      stage_id: z.string(),
      contact_id: z.string(),
      name: z.string().describe("Deal/opportunity name"),
      monetary_value: z.number().optional(),
      status: z.enum(["open", "won", "lost", "abandoned"]).default("open"),
      assigned_to: z.string().optional(),
      close_date: z.string().optional().describe("Expected close date ISO 8601"),
    },
    async (args) => {
      const data = await ghl.post("/opportunities/", {
        locationId: ghl.locationId,
        pipelineId: args.pipeline_id,
        pipelineStageId: args.stage_id,
        contactId: args.contact_id,
        name: args.name,
        monetaryValue: args.monetary_value,
        status: args.status,
        assignedTo: args.assigned_to,
        expectedCloseDate: args.close_date,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPDATE OPPORTUNITY ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_update_opportunity",
    "Update an opportunity — move stage, change value, update status.",
    {
      opportunity_id: z.string(),
      pipeline_id: z.string().optional(),
      stage_id: z.string().optional(),
      name: z.string().optional(),
      monetary_value: z.number().optional(),
      status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
      assigned_to: z.string().optional(),
      close_date: z.string().optional(),
    },
    async ({ opportunity_id, ...args }) => {
      const data = await ghl.put(`/opportunities/${opportunity_id}`, {
        pipelineId: args.pipeline_id,
        pipelineStageId: args.stage_id,
        name: args.name,
        monetaryValue: args.monetary_value,
        status: args.status,
        assignedTo: args.assigned_to,
        expectedCloseDate: args.close_date,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPDATE STAGE (shortcut) ───────────────────────────────────────────────
  makeTool(server,
    "ghl_move_opportunity_stage",
    "Move an opportunity to a different pipeline stage.",
    {
      opportunity_id: z.string(),
      stage_id: z.string().describe("Target stage ID"),
      pipeline_id: z.string().optional().describe("Pipeline ID; auto-detected from the opportunity if omitted"),
    },
    async ({ opportunity_id, stage_id, pipeline_id }) => {
      // GHL moves stage via PUT /opportunities/{id}; pipelineId is required alongside
      // the new stage, so fetch the opportunity to fill it in when not provided.
      let pipelineId = pipeline_id;
      if (!pipelineId) {
        const current = await ghl.get(`/opportunities/${opportunity_id}`);
        pipelineId = current.opportunity?.pipelineId;
      }
      const data = await ghl.put(`/opportunities/${opportunity_id}`, {
        pipelineId,
        pipelineStageId: stage_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELETE OPPORTUNITY ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_delete_opportunity",
    "Delete an opportunity.",
    { opportunity_id: z.string() },
    async ({ opportunity_id }) => {
      const data = await ghl.delete(`/opportunities/${opportunity_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── PIPELINE SUMMARY (computed) ───────────────────────────────────────────
  makeTool(server,
    "ghl_pipeline_summary",
    "Get a high-level summary of a pipeline: total deals, total value, deals per stage.",
    {
      pipeline_id: z.string(),
      status: z.enum(["open", "won", "lost", "all"]).default("open"),
    },
    async ({ pipeline_id, status }) => {
      const data = await ghl.get("/opportunities/search", {
        location_id: ghl.locationId,
        pipeline_id,
        status,
        limit: 100,
      });
      const opps = data.opportunities || [];
      const byStage = {};
      let totalValue = 0;
      for (const o of opps) {
        const stage = o.pipelineStageName || o.pipelineStageId || "Unknown";
        if (!byStage[stage]) byStage[stage] = { count: 0, value: 0 };
        byStage[stage].count++;
        byStage[stage].value += o.monetaryValue || 0;
        totalValue += o.monetaryValue || 0;
      }
      const summary = {
        pipeline_id,
        status,
        total_opportunities: opps.length,
        total_value: totalValue,
        by_stage: byStage,
      };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );
}
