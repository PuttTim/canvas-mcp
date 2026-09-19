/**
 * Validate a user-supplied Canvas instance URL before we ever send a token to
 * it. Bring-your-own-instance means this is an SSRF surface: reject anything
 * that is not a public HTTPS hostname.
 */
export class CanvasUrlError extends Error {}

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home", ".lan", ".corp", ".arpa"];

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

export function normalizeCanvasUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed)
    throw new CanvasUrlError("Enter your Canvas URL, e.g. https://school.instructure.com");
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CanvasUrlError("That does not look like a valid URL.");
  }
  if (url.protocol !== "https:") throw new CanvasUrlError("Canvas URL must use https.");
  if (url.username || url.password)
    throw new CanvasUrlError("Canvas URL must not contain credentials.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || isIpLiteral(host) || host.startsWith("[")) {
    throw new CanvasUrlError(
      "Canvas URL must be a public hostname, not an IP address or localhost.",
    );
  }
  if (!host.includes("."))
    throw new CanvasUrlError("Canvas URL must be a fully qualified hostname.");
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new CanvasUrlError("Canvas URL must be a public hostname.");
  }
  if (url.port && url.port !== "443")
    throw new CanvasUrlError("Canvas URL must use the default https port.");
  // Ignore any path/query the user pasted (e.g. a course link).
  return `https://${host}`;
}
