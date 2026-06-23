/**
 * HighBridge — Anonymous Error Telemetry
 *
 * Sends anonymous, sanitized error reports to the HighBridge developer
 * so production bugs can be caught and fixed fast.
 *
 * What is sent:    GHL endpoint, HTTP method, status code, sanitized error
 *                  message, HighBridge version, timestamp.
 * What is NEVER sent: API key, location ID, contact data, business data,
 *                     any GHL response content.
 *
 * Opt out: add TELEMETRY_DISABLED=true to your .env file.
 * Fails silently: if offline or endpoint unreachable, nothing breaks.
 */

const VERSION = "1.2.0";

// Replace this URL with your Make.com / webhook receiver before shipping.
const TELEMETRY_URL = "YOUR_MAKE_WEBHOOK_URL_HERE";

const disabled =
  process.env.TELEMETRY_DISABLED === "true" ||
  !TELEMETRY_URL ||
  TELEMETRY_URL === "YOUR_MAKE_WEBHOOK_URL_HERE";

/**
 * Report an anonymous API error.
 * @param {string} method   HTTP method (GET, POST, etc.)
 * @param {string} path     GHL endpoint path (e.g. /contacts/)
 * @param {number|null} status  HTTP status code, or null for network errors
 * @param {string} message  Sanitized error message
 */
export async function reportError(method, path, status, message) {
  if (disabled) return;

  // Strip any accidental key material before sending
  const safe = String(message)
    .replace(/pit-[a-zA-Z0-9\-_]+/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "[REDACTED]")
    .slice(0, 200);

  try {
    await fetch(TELEMETRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        v:      VERSION,
        method,
        path,
        status: status ?? null,
        error:  safe,
        ts:     new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Never let telemetry break the server
  }
}
