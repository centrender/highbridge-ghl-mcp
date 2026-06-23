import { z } from "zod";
import { makeTool } from "../src/utils.js";

export function registerPaymentTools(server, ghl) {
  // ── GET PRODUCTS ──────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_products",
    "List all products/offers in the location.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
    },
    async ({ limit, skip }) => {
      const data = await ghl.get("/products/", {
        locationId: ghl.locationId,
        limit,
        skip,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE PRODUCT ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_product",
    "Create a new product or service in GHL.",
    {
      name: z.string(),
      description: z.string().optional(),
      product_type: z.enum(["DIGITAL", "SERVICE", "PHYSICAL"]).default("SERVICE"),
      price: z.number().describe("Price in cents (e.g. 9700 = $97.00)"),
      currency: z.string().default("USD"),
      recurring: z.boolean().default(false),
      interval: z.enum(["day", "week", "month", "year"]).optional(),
      interval_count: z.number().optional().default(1),
    },
    async (args) => {
      const body = {
        locationId: ghl.locationId,
        name: args.name,
        description: args.description,
        productType: args.product_type,
        prices: [{
          name: args.name,
          amount: args.price,
          currency: args.currency,
          type: args.recurring ? "recurring" : "one_time",
          ...(args.recurring ? {
            recurringDetails: {
              interval: args.interval,
              intervalCount: args.interval_count,
            }
          } : {})
        }]
      };
      const data = await ghl.post("/products/", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET ORDERS ────────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_orders",
    "List payment orders with optional filters.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
      payment_mode: z.enum(["live", "test", "all"]).default("all"),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
    },
    async ({ limit, skip, payment_mode, start_date, end_date }) => {
      const data = await ghl.get("/payments/orders", {
        altId: ghl.locationId,
        altType: "location",
        limit,
        offset: skip,
        paymentMode: payment_mode === "all" ? undefined : payment_mode,
        startAt: start_date,
        endAt: end_date,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET SINGLE ORDER ──────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_order",
    "Get details of a specific order.",
    { order_id: z.string() },
    async ({ order_id }) => {
      const data = await ghl.get(`/payments/orders/${order_id}`, {
        altId: ghl.locationId,
        altType: "location",
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET INVOICES ──────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_invoices",
    "List invoices.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
      status: z.enum(["draft", "sent", "payment_processing", "paid", "void", "overdue", "all"]).default("all"),
      contact_id: z.string().optional(),
    },
    async ({ limit, skip, status, contact_id }) => {
      const data = await ghl.get("/invoices/", {
        altId: ghl.locationId,
        altType: "location",
        limit,
        offset: skip,
        status: status === "all" ? undefined : status,
        contactId: contact_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREATE INVOICE ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_create_invoice",
    "Create an invoice for a contact (draft by default). Contact email/phone are " +
      "pulled automatically — GHL requires them. Use ghl_send_invoice to deliver it.",
    {
      contact_id: z.string(),
      title: z.string().default("Invoice"),
      name: z.string().optional().describe("Internal invoice name; defaults to title"),
      currency: z.string().default("USD"),
      business_name: z.string().optional().describe("Your business name shown on the invoice; defaults to the location name"),
      issue_date: z.string().optional().describe("ISO date YYYY-MM-DD; defaults to today"),
      due_date: z.string().describe("ISO date YYYY-MM-DD"),
      items: z.array(z.object({
        name: z.string(),
        qty: z.number().default(1),
        unit_price: z.number().describe("Amount in major units (e.g. 97 = $97), per GHL invoice items"),
        currency: z.string().default("USD"),
      })),
      send_immediately: z.boolean().default(false).describe("Email+SMS the invoice right after creating"),
      live_mode: z.boolean().default(true),
    },
    async ({ contact_id, title, name, currency, business_name, issue_date, due_date, items, send_immediately, live_mode }) => {
      // GHL requires full contactDetails (name, email, E.164 phone) on the invoice,
      // and a non-empty businessDetails.name.
      const c = (await ghl.get(`/contacts/${contact_id}`)).contact || {};
      let bizName = business_name;
      if (!bizName) {
        const loc = await ghl.get(`/locations/${ghl.locationId}`);
        bizName = loc.location?.name || loc.name || "Business";
      }
      const today = new Date().toISOString().slice(0, 10);
      const body = {
        altId: ghl.locationId,
        altType: "location",
        name: name || title,
        title,
        currency,
        businessDetails: { name: bizName },
        contactDetails: {
          id: contact_id,
          name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Customer",
          email: c.email || undefined,
          phoneNo: c.phone || undefined,
        },
        issueDate: issue_date || today,
        dueDate: due_date,
        liveMode: live_mode,
        items: items.map((i) => ({
          name: i.name,
          qty: i.qty,
          amount: i.unit_price,
          currency: i.currency,
        })),
      };
      const created = await ghl.post("/invoices/", body);
      const invoiceId = created._id || created.id;
      if (send_immediately && invoiceId) {
        const users = await ghl.get("/users/", { locationId: ghl.locationId });
        const sent = await ghl.post(`/invoices/${invoiceId}/send`, {
          altId: ghl.locationId,
          altType: "location",
          action: "sms_and_email",
          userId: (users.users || [])[0]?.id,
          liveMode: live_mode,
        });
        return { content: [{ type: "text", text: JSON.stringify({ created, sent }, null, 2) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(created, null, 2) }] };
    }
  );

  // ── SEND INVOICE ──────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_send_invoice",
    "Send (or re-send) an existing invoice to the contact via email and/or SMS.",
    {
      invoice_id: z.string(),
      action: z.enum(["sms_and_email", "email", "sms"]).default("sms_and_email")
        .describe("Delivery channel(s)"),
      user_id: z.string().optional().describe("User ID sending on behalf of; auto-detected if omitted"),
      live_mode: z.boolean().default(true).describe("false routes through test mode"),
    },
    async ({ invoice_id, action, user_id, live_mode }) => {
      // GHL requires userId (or sentFrom); fall back to the first location user.
      let userId = user_id;
      if (!userId) {
        const users = await ghl.get("/users/", { locationId: ghl.locationId });
        userId = (users.users || [])[0]?.id;
      }
      const data = await ghl.post(`/invoices/${invoice_id}/send`, {
        altId: ghl.locationId,
        altType: "location",
        action,
        userId,
        liveMode: live_mode,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── RECORD PAYMENT ────────────────────────────────────────────────────────
  makeTool(server,
    "ghl_record_payment",
    "Manually record an (off-platform) payment against an invoice — e.g. cash, " +
      "check, or external transfer. Marks the invoice paid/partially paid.",
    {
      invoice_id: z.string(),
      amount: z.number().describe("Amount paid, in major units (e.g. 97.00 for $97)"),
      mode: z.enum(["cash", "card", "cheque", "bank_transfer", "other"]).default("cash")
        .describe("Payment method recorded"),
      notes: z.string().optional(),
      payment_date: z.string().optional().describe("ISO datetime; defaults to now"),
    },
    async ({ invoice_id, amount, mode, notes, payment_date }) => {
      const data = await ghl.post(`/invoices/${invoice_id}/record-payment`, {
        altId: ghl.locationId,
        altType: "location",
        mode,
        amount,
        notes,
        paymentSchedule: undefined,
        ...(payment_date ? { paymentDate: payment_date } : {}),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET TRANSACTIONS ──────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_transactions",
    "Get payment transactions.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
    },
    async ({ limit, skip, start_date, end_date }) => {
      const data = await ghl.get("/payments/transactions", {
        altId: ghl.locationId,
        altType: "location",
        limit,
        offset: skip,
        startAt: start_date,
        endAt: end_date,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── GET SUBSCRIPTIONS ─────────────────────────────────────────────────────
  makeTool(server,
    "ghl_get_subscriptions",
    "List active and past subscriptions.",
    {
      limit: z.number().default(20),
      skip: z.number().default(0),
      contact_id: z.string().optional(),
    },
    async ({ limit, skip, contact_id }) => {
      const data = await ghl.get("/payments/subscriptions", {
        altId: ghl.locationId,
        altType: "location",
        limit,
        offset: skip,
        contactId: contact_id,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── REVENUE SUMMARY ───────────────────────────────────────────────────────
  makeTool(server,
    "ghl_revenue_summary",
    "Compute total revenue, MRR, and order count for a date range.",
    {
      start_date: z.string().describe("ISO date YYYY-MM-DD"),
      end_date: z.string().describe("ISO date YYYY-MM-DD"),
    },
    async ({ start_date, end_date }) => {
      const data = await ghl.get("/payments/orders", {
        altId: ghl.locationId,
        altType: "location",
        limit: 200,
        startAt: start_date,
        endAt: end_date,
      });
      const orders = data.data || [];
      const totalRevenue = orders.reduce((s, o) => s + (o.amount || 0), 0);
      const paid = orders.filter((o) => o.status === "completed");
      const summary = {
        period: `${start_date} → ${end_date}`,
        total_orders: orders.length,
        paid_orders: paid.length,
        total_revenue_cents: totalRevenue,
        total_revenue_usd: `$${(totalRevenue / 100).toFixed(2)}`,
      };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );
}
