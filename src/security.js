/**
 * HighBridge — Security utilities
 *
 * MCP security hardening:
 *   Rule 1:  Secret validation (API key format check)
 *   Rule 3:  Input validation + sanitization + prompt-injection prevention
 *   Rule 9:  Error sanitization (no internal paths / raw stack traces to client)
 *   AI/LLM:  Prompt injection detection on user-controlled string fields
 */

// ── Rule 1: API key validation ────────────────────────────────────────────
// GHL Private Integration Tokens always start with "pit-" and are ~40 chars.
export function validateEnvVars() {
  const key = process.env.GHL_API_KEY || "";
  const loc = process.env.GHL_LOCATION_ID || "";

  const errors = [];

  if (!key) errors.push("GHL_API_KEY is not set");
  else if (!key.startsWith("pit-")) errors.push("GHL_API_KEY does not look like a Private Integration Token (must start with 'pit-')");
  else if (key.length < 20) errors.push("GHL_API_KEY is too short — check your key");

  if (!loc) errors.push("GHL_LOCATION_ID is not set");
  else if (!/^[a-zA-Z0-9_-]{8,}$/.test(loc)) errors.push("GHL_LOCATION_ID contains unexpected characters");

  if (errors.length) {
    for (const e of errors) console.error(`❌  [security] ${e}`);
    process.exit(1);
  }
}

// ── Rule 3: Input sanitization ────────────────────────────────────────────

const MAX_DEFAULT = 500;
const MAX_BODY    = 50_000; // email bodies, html content
const MAX_ID      = 128;

/**
 * Sanitize a plain-text field (names, tags, notes, subjects).
 * - Trims whitespace
 * - Enforces max length
 * - Strips GHL template injection: {{ }} patterns that could hijack server-side rendering
 * - Strips null bytes
 */
export function sanitizeText(value, maxLen = MAX_DEFAULT) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;

  return value
    .trim()
    .slice(0, maxLen)
    .replace(/\x00/g, "")                     // null bytes
    .replace(/\{\{[^}]{0,200}\}\}/g, "");      // GHL template injection e.g. {{contact.phone}}
}

/**
 * Sanitize HTML / rich content (email bodies, templates).
 * Lighter touch — preserve {{ }} because they're intentional merge tags in templates.
 * Still strips null bytes and enforces size.
 */
export function sanitizeHtml(value, maxLen = MAX_BODY) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;

  return value
    .slice(0, maxLen)
    .replace(/\x00/g, "");  // null bytes only
}

/**
 * Sanitize a GHL ID (contact_id, workflow_id, etc.).
 * These should only ever be alphanumeric + hyphens.
 * Rejects anything else — prevents path traversal.
 */
export function sanitizeId(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return String(value).slice(0, MAX_ID);

  const cleaned = value.trim().slice(0, MAX_ID);
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    throw new Error(`Invalid ID format: "${cleaned.slice(0, 20)}..." — only alphanumeric, dash, underscore allowed`);
  }
  return cleaned;
}

/**
 * Sanitize a URL field.
 * Rejects javascript: and data: URIs (XSS via URL injection).
 */
export function sanitizeUrl(value) {
  if (!value) return value;
  const url = String(value).trim().slice(0, 2048);
  if (/^(javascript|data|vbscript):/i.test(url)) {
    throw new Error("Invalid URL scheme — javascript:/data:/vbscript: not allowed");
  }
  return url;
}

// ── Rule 9: Error sanitization ────────────────────────────────────────────

// Patterns that could expose sensitive data in error messages.
const SENSITIVE_PATTERNS = [
  /pit-[a-zA-Z0-9-]{10,}/g,          // GHL PIT keys
  /Bearer\s+[a-zA-Z0-9._-]{10,}/gi,  // Authorization headers
  /password\s*[:=]\s*\S+/gi,         // passwords
  /secret\s*[:=]\s*\S+/gi,           // secrets
  /"token"\s*:\s*"[^"]+"/gi,         // token JSON fields
];

/**
 * Strip sensitive strings from an error message before returning to MCP client.
 * Also truncates long responses so we don't dump an entire GHL HTML error page.
 */
export function sanitizeError(message, maxLen = 500) {
  let msg = String(message).slice(0, maxLen);
  for (const pattern of SENSITIVE_PATTERNS) {
    msg = msg.replace(pattern, "[REDACTED]");
  }
  // Remove absolute file paths (Rule 9: no internal paths to client)
  msg = msg.replace(/([A-Z]:\\|\/[a-z]+\/)[^\s"',]*/gi, "[path]");
  return msg;
}

// ── AI/LLM: Prompt injection detection ───────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore (all |previous |above )?(instructions|prompt|rules)/i,
  /you are now/i,
  /act as (a|an|the)/i,
  /system\s*:/i,
  /\[SYSTEM\]/i,
  /<\/?system>/i,
];

/**
 * Detect obvious prompt injection attempts in a free-text field.
 * Returns the cleaned string or throws if injection is detected.
 * Use on note/message fields that a contact might fill out.
 */
export function detectPromptInjection(value, fieldName = "input") {
  if (!value || typeof value !== "string") return value;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      console.error(`[security] Prompt injection attempt detected in field "${fieldName}": ${value.slice(0, 100)}`);
      throw new Error(`Rejected: "${fieldName}" contains a disallowed pattern`);
    }
  }
  return value;
}
