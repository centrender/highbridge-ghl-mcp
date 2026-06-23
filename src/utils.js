/**
 * HighBridge GHL MCP — Shared Utilities
 *
 * normalizeParams: converts all incoming parameter keys from camelCase to
 * snake_case before they reach Zod schemas. This makes the MCP bulletproof
 * against LLM parameter naming variations — "contactId" and "contact_id" both
 * work transparently.
 */

/**
 * Convert a single camelCase string to snake_case.
 * Examples:
 *   contactId  → contact_id
 *   pipelineId → pipeline_id
 *   locationId → location_id  (stripped — tools get this from ghl.locationId)
 *   startDate  → start_date
 */
export function camelToSnake(str) {
  return str
    .replace(/([A-Z])/g, (c) => "_" + c.toLowerCase())
    .replace(/^_/, "");
}

/**
 * Recursively normalize all keys in a params object from camelCase to snake_case.
 * Ignores non-object values. Does not mutate the original.
 */
export function normalizeParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    const normalized = camelToSnake(key);
    out[normalized] = typeof value === "object" && !Array.isArray(value) && value !== null
      ? normalizeParams(value)
      : value;
  }
  return out;
}

/**
 * Wrap a server.tool registration to normalize params before Zod sees them.
 *
 * Usage:
 *   import { makeTool } from "../src/utils.js";
 *   makeTool(server, "ghl_get_contact", "...", schema, handler);
 *
 * This is a drop-in replacement for server.tool() that adds param normalization.
 */
export function makeTool(server, name, description, schema, handler) {
  return server.tool(name, description, schema, async (rawParams) => {
    const params = normalizeParams(rawParams);
    return handler(params);
  });
}

/**
 * Convert a YYYY-MM-DD string (or ISO datetime) to Unix epoch milliseconds.
 * GHL's calendar free-slots API requires numeric timestamps.
 */
export function toEpochMs(dateStr) {
  if (!dateStr) return undefined;
  if (/^\d{10,13}$/.test(String(dateStr))) return Number(dateStr);
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) throw new Error(`Invalid date: "${dateStr}". Use YYYY-MM-DD or ISO 8601.`);
  return ms;
}

/**
 * Safely extract a value from a Promise.allSettled result.
 * Returns fallback if the promise was rejected or extraction throws.
 */
export function fromSettled(result, extract, fallback = 0) {
  if (result.status !== "fulfilled") return fallback;
  try {
    const val = extract(result.value);
    return val ?? fallback;
  } catch {
    return fallback;
  }
}
