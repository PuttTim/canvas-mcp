/** Normalised Canvas API error. */
export class CanvasError extends Error {
  readonly status: number;
  readonly messages: string[];
  readonly path: string;
  readonly requestId: string | undefined;
  readonly rateLimited: boolean;

  constructor(opts: {
    status: number;
    messages: string[];
    path: string;
    requestId?: string | undefined;
    rateLimited?: boolean;
  }) {
    super(`Canvas ${opts.status} on ${opts.path}: ${opts.messages.join("; ") || "no message"}`);
    this.name = "CanvasError";
    this.status = opts.status;
    this.messages = opts.messages;
    this.path = opts.path;
    this.requestId = opts.requestId;
    this.rateLimited = opts.rateLimited ?? false;
  }

  /** A short explanation suitable for showing to an LLM/user. */
  get hint(): string {
    if (this.rateLimited) return "Canvas rate limit exceeded; retry shortly.";
    switch (this.status) {
      case 401:
        return "Canvas rejected the access token. It may be invalid, expired, or revoked; reconnect with a fresh token.";
      case 403:
        return "Your Canvas account is not allowed to access this. The endpoint may need teacher or admin permissions, or the course may restrict it.";
      case 404:
        return "Canvas returned not found. Check the id, or the resource may be unpublished or not visible to you.";
      case 422:
        return "Canvas rejected the request parameters.";
      default:
        return this.status >= 500 ? "Canvas server error; retry later." : "Canvas request failed.";
    }
  }
}

/**
 * Extract human-readable messages from the various error bodies Canvas emits:
 *   { errors: [{ message }] }
 *   { errors: { field: [{ message }] } }
 *   { errors: { field: "msg" } }
 *   { message } / { error } / plain text
 */
export function extractErrorMessages(body: unknown): string[] {
  if (typeof body === "string") return body.trim() ? [body.trim().slice(0, 500)] : [];
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const out: string[] = [];
  const errors = b.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (typeof e === "string") out.push(e);
      else if (
        e &&
        typeof e === "object" &&
        typeof (e as { message?: unknown }).message === "string"
      )
        out.push((e as { message: string }).message);
    }
  } else if (errors && typeof errors === "object") {
    for (const [field, v] of Object.entries(errors as Record<string, unknown>)) {
      if (typeof v === "string") out.push(`${field}: ${v}`);
      else if (Array.isArray(v))
        for (const e of v) {
          const msg = typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
          if (typeof msg === "string") out.push(`${field}: ${msg}`);
        }
    }
  }
  if (typeof b.message === "string") out.push(b.message);
  if (typeof b.error === "string") out.push(b.error);
  if (typeof b.error_report_id !== "undefined")
    out.push(`error_report_id=${String(b.error_report_id)}`);
  return out;
}
