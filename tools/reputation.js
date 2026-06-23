import { z } from "zod";
import { makeTool } from "../src/utils.js";

export function registerReputationTools(server, ghl) {
  // ── GET REVIEWS ───────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_reviews",
    "List Google/Facebook reviews for the location. Filter by rating, type, or date range. " +
      "Great for auditing review health before pitching reputation management to a client.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
      rating: z.enum(["1", "2", "3", "4", "5"]).optional().describe("Filter by star rating"),
      type: z.enum(["google", "facebook"]).optional().describe("Filter by review source"),
      sort: z.enum(["asc", "desc"]).default("desc"),
    },
    async ({ limit, skip, rating, type, sort }) => {
      const params = {
        locationId: ghl.locationId,
        limit,
        skip,
        sort,
      };
      if (rating) params.rating = rating;
      if (type) params.type = type;

      const data = await ghl.get("/reputation/reviews", params);

      // Surface a helpful summary alongside raw data
      const reviews = data.reviews || [];
      const avgRating = reviews.length
        ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
        : null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            total: data.total ?? reviews.length,
            returned: reviews.length,
            average_rating: avgRating,
            reviews: reviews.map((r) => ({
              id: r.id,
              reviewer: r.reviewer?.displayName || r.reviewerName,
              rating: r.rating,
              body: r.comment || r.review,
              source: r.type || r.source,
              date: r.reviewDate || r.dateAdded,
              status: r.replied ? "replied" : "needs_reply",
              reply: r.reviewReply?.comment || null,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── GET SINGLE REVIEW ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_review",
    "Get a single review by ID including full body and any existing reply.",
    { review_id: z.string() },
    async ({ review_id }) => {
      const data = await ghl.get(`/reputation/reviews/${review_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── REPLY TO REVIEW ───────────────────────────────────────────────────────
  makeTool(server,
    "ghl_reply_to_review",
    "Post a reply to a Google or Facebook review. Pass the review_id and your reply text. " +
      "This publishes directly to Google/Facebook via GHL's connected account.",
    {
      review_id: z.string(),
      reply: z.string().describe("Your response text. Keep it professional — it posts publicly."),
    },
    async ({ review_id, reply }) => {
      const data = await ghl.post(`/reputation/reviews/${review_id}/reply`, { reply });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELETE REVIEW REPLY ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_delete_review_reply",
    "Delete/retract an existing reply to a review.",
    { review_id: z.string() },
    async ({ review_id }) => {
      const data = await ghl.delete(`/reputation/reviews/${review_id}/reply`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SEND REVIEW REQUEST ───────────────────────────────────────────────────
  makeTool(server,
    "ghl_send_review_request",
    "Send a review request to a contact via SMS or email. " +
      "Use after a job is done or a deal is closed. Links to the business's Google review page.",
    {
      contact_id: z.string(),
      type: z.enum(["SMS", "Email"]).default("SMS").describe("Channel to send the review request"),
      message: z.string().optional().describe(
        "Custom message body. If omitted GHL uses the default template from reputation settings."
      ),
    },
    async ({ contact_id, type, message }) => {
      const body = {
        contactId: contact_id,
        type,
        locationId: ghl.locationId,
      };
      if (message) body.message = message;
      const data = await ghl.post("/reputation/requests", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── REPUTATION SUMMARY ────────────────────────────────────────────────────
  makeTool(server,
    "ghl_reputation_summary",
    "Get a quick health snapshot of the location's review profile: total reviews, average rating, " +
      "breakdown by star rating, and count of reviews still needing a reply. " +
      "Perfect opening slide for a reputation management pitch.",
    {},
    async () => {
      // Pull up to 100 reviews to build the summary
      const data = await ghl.get("/reputation/reviews", {
        locationId: ghl.locationId,
        limit: 100,
        skip: 0,
        sort: "desc",
      });

      const reviews = data.reviews || [];
      const total = data.total ?? reviews.length;

      const byRating = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      let needsReply = 0;
      let sumRating = 0;

      for (const r of reviews) {
        const stars = String(Math.round(r.rating || 0));
        if (byRating[stars] !== undefined) byRating[stars]++;
        sumRating += r.rating || 0;
        if (!r.replied && !r.reviewReply) needsReply++;
      }

      const avgRating = reviews.length ? (sumRating / reviews.length).toFixed(1) : null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            total_reviews: total,
            sampled: reviews.length,
            average_rating: avgRating,
            by_star: byRating,
            needs_reply: needsReply,
            reply_rate: reviews.length
              ? `${(((reviews.length - needsReply) / reviews.length) * 100).toFixed(0)}%`
              : null,
            note: total > 100 ? `Showing summary from first 100 of ${total} reviews.` : undefined,
          }, null, 2),
        }],
      };
    }
  );
}
