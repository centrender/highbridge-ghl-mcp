import { z } from "zod";
import { makeTool } from "../src/utils.js";

export function registerConversationTools(server, ghl) {
  // ── GET CONVERSATIONS ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_conversations",
    "List conversations. Use to find unread messages, follow-up needed, etc.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
      status: z.enum(["all", "read", "unread", "starred", "recents"]).default("all"),
      assigned_to: z.string().optional().describe("Filter by assigned user ID"),
      contact_id: z.string().optional(),
      sort: z.enum(["asc", "desc"]).default("desc"),
    },
    async (args) => {
      const data = await ghl.get("/conversations/search", {
        locationId: ghl.locationId,
        limit: args.limit,
        skip: args.skip,
        status: args.status,
        assignedTo: args.assigned_to,
        contactId: args.contact_id,
        sort: args.sort,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET SINGLE CONVERSATION ───────────────────────────────────────────────
  makeTool(server,
    "ghl_get_conversation",
    "Get a conversation by ID including all messages.",
    { conversation_id: z.string() },
    async ({ conversation_id }) => {
      const data = await ghl.get(`/conversations/${conversation_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET MESSAGES ──────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_messages",
    "Get messages in a conversation.",
    {
      conversation_id: z.string(),
      limit: z.number().default(20),
      last_message_id: z.string().optional().describe("For pagination - get messages before this ID"),
    },
    async ({ conversation_id, limit, last_message_id }) => {
      const data = await ghl.get(`/conversations/${conversation_id}/messages`, {
        limit,
        lastMessageId: last_message_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SEND SMS ──────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_send_sms",
    "Send an SMS to a contact.",
    {
      contact_id: z.string(),
      message: z.string().describe("SMS text body"),
      from_number: z.string().optional().describe("GHL phone number to send from"),
    },
    async ({ contact_id, message, from_number }) => {
      const data = await ghl.post("/conversations/messages", {
        type: "SMS",
        contactId: contact_id,
        locationId: ghl.locationId,
        message,
        fromNumber: from_number,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SEND EMAIL ────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_send_email",
    "Send an email to a contact.",
    {
      contact_id: z.string(),
      subject: z.string(),
      body: z.string().describe("HTML or plain text email body"),
      from_name: z.string().optional(),
      from_email: z.string().optional(),
      reply_to: z.string().optional(),
    },
    async ({ contact_id, subject, body, from_name, from_email, reply_to }) => {
      const data = await ghl.post("/conversations/messages", {
        type: "Email",
        contactId: contact_id,
        locationId: ghl.locationId,
        subject,
        html: body,
        fromName: from_name,
        fromEmail: from_email,
        replyToEmail: reply_to,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SEND VOICE MESSAGE (RVM) ──────────────────────────────────────────────
  makeTool(server,
    "ghl_send_voicemail",
    "Send a ringless voicemail (RVM) to a contact.",
    {
      contact_id: z.string(),
      message: z.string().describe("Text to convert to voicemail, or URL of audio file"),
      from_number: z.string().optional(),
    },
    async ({ contact_id, message, from_number }) => {
      const data = await ghl.post("/conversations/messages", {
        type: "Voicemail",
        contactId: contact_id,
        locationId: ghl.locationId,
        message,
        fromNumber: from_number,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE CONVERSATION ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_conversation",
    "Create a new conversation with a contact.",
    {
      contact_id: z.string(),
      user_id: z.string().optional().describe("Assign to specific user ID"),
    },
    async ({ contact_id, user_id }) => {
      // GHL auto-creates one conversation per contact; if it already exists the API
      // returns 400 with the existing conversationId — surface that instead of failing.
      try {
        const data = await ghl.post("/conversations/", {
          locationId: ghl.locationId,
          contactId: contact_id,
          userId: user_id,
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        const match = String(err.message).match(/"conversationId":"([^"]+)"/);
        if (match) {
          return { content: [{ type: "text", text: JSON.stringify({ conversationId: match[1], existing: true }, null, 2) }] };
        }
        throw err;
      }
    }
  );

  // ── MARK READ ─────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_mark_conversation_read",
    "Mark a conversation as read (clears its unread count).",
    { conversation_id: z.string() },
    async ({ conversation_id }) => {
      const data = await ghl.put(`/conversations/${conversation_id}`, { unreadCount: 0 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UPDATE CONVERSATION ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_update_conversation",
    "Update conversation status (read/unread/starred).",
    {
      conversation_id: z.string(),
      unread_count: z.number().optional(),
      starred: z.boolean().optional(),
    },
    async ({ conversation_id, unread_count, starred }) => {
      const data = await ghl.put(`/conversations/${conversation_id}`, {
        unreadCount: unread_count,
        starred,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET CALL TRANSCRIPT ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_call_transcript",
    "Get the Voice AI transcript for a specific call message. Requires GHL Voice Intelligence add-on. " +
      "First use ghl_get_messages to find a call message_id, then pass it here.",
    {
      message_id: z.string().describe("The message ID of the call (from ghl_get_messages, type='Call')"),
    },
    async ({ message_id }) => {
      const data = await ghl.get(`/conversations/messages/${message_id}/transcription`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── LIST CALLS ────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_calls",
    "List call messages across conversations. Filters conversations to only those with call activity. " +
      "Use ghl_get_call_transcript with a message_id to get the transcript for any call.",
    {
      contact_id: z.string().optional().describe("Filter calls for a specific contact"),
      limit: z.number().default(20),
      skip: z.number().default(0),
    },
    async ({ contact_id, limit, skip }) => {
      // Search conversations then pull messages of type Call
      const convData = await ghl.get("/conversations/search", {
        locationId: ghl.locationId,
        limit,
        skip,
        contactId: contact_id,
      });
      const conversations = convData.conversations || [];

      // For each conversation, pull messages and filter to Call type
      const callResults = [];
      for (const conv of conversations.slice(0, 10)) {
        try {
          const msgData = await ghl.get(`/conversations/${conv.id}/messages`, { limit: 20 });
          const calls = (msgData.messages || []).filter((m) => m.messageType === "TYPE_CALL" || m.type === "Call");
          if (calls.length > 0) {
            callResults.push({
              conversation_id: conv.id,
              contact_id: conv.contactId,
              contact_name: conv.contactName,
              calls: calls.map((c) => ({
                message_id: c.id,
                direction: c.direction,
                duration_seconds: c.meta?.duration,
                status: c.status,
                created_at: c.dateAdded,
                has_transcript: !!c.meta?.transcriptionUrl || !!c.meta?.hasTranscript,
              })),
            });
          }
        } catch {
          // skip conversations that fail silently
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            total_conversations_searched: conversations.length,
            conversations_with_calls: callResults.length,
            calls: callResults,
            note: "Use ghl_get_call_transcript with a message_id to get full transcript text.",
          }, null, 2),
        }],
      };
    }
  );
}
