/**
 * AES-256-GCM sealing for Canvas tokens stored in OAuth grant props.
 *
 * The OAuth provider already encrypts props with a key wrapped by the issued
 * access token; this adds a second layer keyed by a Worker secret so a KV dump
 * plus a leaked access token is still not enough to recover the Canvas token
 * without the deployment secret.
 *
 * Format: `v1.<base64url(iv)>.<base64url(ciphertext)>`
 */

const PREFIX = "v1";

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  // Accept either a base64url 32-byte key or any string (hashed to 32 bytes).
  let raw: Uint8Array;
  try {
    const decoded = b64urlDecode(secret);
    raw =
      decoded.length === 32
        ? decoded
        : new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  } catch {
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function seal(plaintext: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${PREFIX}.${b64urlEncode(iv)}.${b64urlEncode(new Uint8Array(ct))}`;
}

export async function open(sealed: string, secret: string): Promise<string> {
  const [prefix, ivB64, ctB64] = sealed.split(".");
  if (prefix !== PREFIX || !ivB64 || !ctB64) throw new Error("Unrecognised sealed token format");
  const key = await importKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64urlDecode(ivB64) as BufferSource },
    key,
    b64urlDecode(ctB64) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/** Generate a fresh base64url 32-byte key (for `wrangler secret put PROPS_KEY`). */
export function generateKey(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

/** Stable, non-reversible identifier for a token (Durable Object keys, logs). */
export async function tokenFingerprint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return b64urlEncode(new Uint8Array(digest)).slice(0, 32);
}
