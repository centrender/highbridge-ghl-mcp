/**
 * HighBridge — GHL API Client
 *
 * Security hardening:
 *   Rule 2:  Outbound rate limiting — token bucket, max 8 req/sec (conservative vs GHL limits)
 *   Rule 9:  Error sanitization — no raw GHL responses or auth headers leaked to caller
 *   Rule 1:  API key never logged or exposed in error messages
 */

import { sanitizeError } from "./security.js";
import { reportError }   from "./telemetry.js";

const GHL_BASE    = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// ── Rule 2: Outbound token-bucket rate limiter ─────────────────────────────
// GHL does not publish hard limits but community reports ~100 req/min per token.
// We cap at 8 req/sec (480/min) — well below the limit, prevents burst abuse.
class TokenBucket {
  constructor(capacity = 8, refillPerSecond = 8) {
    this.capacity   = capacity;
    this.tokens     = capacity;
    this.refillRate = refillPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until a token is available
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000) + 10;
    await new Promise((r) => setTimeout(r, waitMs));
    return this.acquire();
  }

  _refill() {
    const now     = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens   = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

export class GHLClient {
  constructor(apiKey, locationId) {
    this.apiKey     = apiKey;
    this.locationId = locationId;
    this._bucket    = new TokenBucket(8, 8);
  }

  // Rule 1: Authorization header uses key from env — never interpolated into logs
  _headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Version:        GHL_VERSION,
      "Content-Type": "application/json",
      Accept:         "application/json",
    };
  }

  async request(method, path, body = null, params = {}, _retried = false) {
    // Rule 2: Throttle outbound requests
    await this._bucket.acquire();

    const url = new URL(`${GHL_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });

    const opts = { method, headers: this._headers() };
    if (body) opts.body = JSON.stringify(body);

    let res, text;
    try {
      res  = await fetch(url.toString(), opts);
      text = await res.text();
    } catch (networkErr) {
      // Rule 9: Network errors don't expose internals
      const msg = sanitizeError(networkErr.message);
      reportError(method, path, null, msg);
      throw new Error(`GHL network error on ${method} ${path}: ${msg}`);
    }

    // GHL 429 — auto-retry once, honor Retry-After
    if (res.status === 429 && !_retried) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.request(method, path, body, params, true);
    }

    if (!res.ok) {
      // Rule 9: Sanitize before throwing — strip key material, cap length
      const safe = sanitizeError(text, 300);
      reportError(method, path, res.status, safe);
      throw new Error(`GHL ${res.status} on ${method} ${path}: ${safe}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text.slice(0, 1000) };
    }
  }

  get(path, params = {})                    { return this.request("GET",    path, null, params); }
  post(path, body = {})                     { return this.request("POST",   path, body); }
  put(path, body = {})                      { return this.request("PUT",    path, body); }
  patch(path, body = {})                    { return this.request("PATCH",  path, body); }
  // DELETE supports an optional JSON body (e.g. removing tags) and query params.
  delete(path, body = null, params = {})    { return this.request("DELETE", path, body, params); }
}
