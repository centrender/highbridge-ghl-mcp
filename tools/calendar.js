import { z } from "zod";
import { makeTool } from "../src/utils.js";

/**
 * Convert a YYYY-MM-DD string or ISO datetime to Unix epoch milliseconds.
 * GHL's free-slots API requires numeric timestamps, not ISO strings.
 */
function toEpochMs(dateStr) {
  if (!dateStr) return undefined;
  // Already a number string (epoch ms passed in)
  if (/^\d{10,13}$/.test(String(dateStr))) return Number(dateStr);
  // ISO date or datetime string
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) throw new Error(`Invalid date: "${dateStr}". Use YYYY-MM-DD or ISO 8601.`);
  return ms;
}

export function registerCalendarTools(server, ghl) {
  // ── GET CALENDARS ─────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_calendars",
    "List all calendars in the location.",
    {},
    async () => {
      const data = await ghl.get("/calendars/", { locationId: ghl.locationId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET APPOINTMENTS ──────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_appointments",
    "List appointments with date range filter. If no calendar_id is given, " +
      "automatically uses the first calendar in the location.",
    {
      calendar_id: z.string().optional().describe("Calendar ID (auto-detected if omitted)"),
      start_time: z.string().describe("ISO start datetime, e.g. 2026-06-20T00:00:00Z"),
      end_time: z.string().describe("ISO end datetime, e.g. 2026-06-20T23:59:59Z"),
      contact_id: z.string().optional(),
    },
    async ({ calendar_id, start_time, end_time, contact_id }) => {
      // GHL requires at least one of calendarId, userId, or groupId.
      // Auto-resolve: if caller didn't supply one, fetch the first calendar.
      let calendarId = calendar_id;
      if (!calendarId) {
        const cals = await ghl.get("/calendars/", { locationId: ghl.locationId });
        calendarId = (cals.calendars || [])[0]?.id;
        if (!calendarId) {
          return { content: [{ type: "text", text: JSON.stringify({ appointments: [], note: "No calendars found in this location." }) }] };
        }
      }
      const data = await ghl.get("/calendars/events", {
        locationId: ghl.locationId,
        calendarId,
        startTime: start_time,
        endTime: end_time,
        contactId: contact_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET BLOCKED SLOTS ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_blocked_slots",
    "List blocked-off slots (busy/unavailable times) in a date range. " +
      "Scope by calendar, user, or group.",
    {
      start_time: z.string().describe("Epoch millis or ISO start datetime"),
      end_time: z.string().describe("Epoch millis or ISO end datetime"),
      calendar_id: z.string().optional(),
      user_id: z.string().optional(),
      group_id: z.string().optional(),
    },
    async ({ start_time, end_time, calendar_id, user_id, group_id }) => {
      const data = await ghl.get("/calendars/blocked-slots", {
        locationId: ghl.locationId,
        startTime: start_time,
        endTime: end_time,
        calendarId: calendar_id,
        userId: user_id,
        groupId: group_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET SINGLE APPOINTMENT ────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_appointment",
    "Get details of a specific appointment.",
    { event_id: z.string() },
    async ({ event_id }) => {
      const data = await ghl.get(`/calendars/events/appointments/${event_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE APPOINTMENT ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_appointment",
    "Book an appointment for a contact.",
    {
      calendar_id: z.string(),
      contact_id: z.string(),
      start_time: z.string().describe("ISO 8601 start time"),
      end_time: z.string().describe("ISO 8601 end time"),
      title: z.string().optional().describe("Appointment title"),
      notes: z.string().optional(),
      assigned_user_id: z.string().optional(),
      status: z.enum(["new", "confirmed", "cancelled", "showed", "noshow", "invalid"]).default("confirmed"),
      meeting_location: z.string().optional(),
      ignore_availability: z.boolean().default(false).describe("Book even if the slot isn't free"),
    },
    async (args) => {
      const data = await ghl.post("/calendars/events/appointments", {
        locationId: ghl.locationId,
        calendarId: args.calendar_id,
        contactId: args.contact_id,
        startTime: args.start_time,
        endTime: args.end_time,
        title: args.title,
        notes: args.notes,
        assignedUserId: args.assigned_user_id,
        appointmentStatus: args.status,
        address: args.meeting_location,
        ignoreFreeSlotValidation: args.ignore_availability,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPDATE APPOINTMENT ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_update_appointment",
    "Update an existing appointment — reschedule, change status, etc.",
    {
      event_id: z.string(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      status: z.enum(["new", "confirmed", "cancelled", "showed", "noshow", "invalid"]).optional(),
      notes: z.string().optional(),
      title: z.string().optional(),
    },
    async ({ event_id, ...args }) => {
      const data = await ghl.put(`/calendars/events/appointments/${event_id}`, {
        startTime: args.start_time,
        endTime: args.end_time,
        appointmentStatus: args.status,
        notes: args.notes,
        title: args.title,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELETE APPOINTMENT ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_delete_appointment",
    "Cancel/delete an appointment.",
    { event_id: z.string() },
    async ({ event_id }) => {
      const data = await ghl.delete(`/calendars/events/${event_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── FREE SLOTS ────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_free_slots",
    "Get available appointment slots in a calendar.",
    {
      calendar_id: z.string(),
      start_date: z.string().describe("Date in YYYY-MM-DD format, e.g. 2026-06-20"),
      end_date: z.string().describe("Date in YYYY-MM-DD format, e.g. 2026-06-27"),
      timezone: z.string().default("America/Los_Angeles"),
    },
    async ({ calendar_id, start_date, end_date, timezone }) => {
      // GHL's free-slots API requires Unix epoch milliseconds (numbers), NOT ISO strings.
      // Convert YYYY-MM-DD → epoch ms automatically so callers can use human dates.
      const startMs = toEpochMs(start_date);
      const endMs   = toEpochMs(end_date);
      const data = await ghl.get(`/calendars/${calendar_id}/free-slots`, {
        startDate: startMs,
        endDate:   endMs,
        timezone,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
