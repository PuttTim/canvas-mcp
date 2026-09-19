/**
 * The OAuth provider's `defaultHandler`: everything that is not the protected
 * /mcp route. Owns the consent page where a student pastes their Canvas URL
 * and personal access token, plus a landing page and health check.
 */
import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { type CanvasUserId, isCanvasUserId } from "../auth/canvas-id.ts";
import { CanvasUrlError, normalizeCanvasUrl } from "../auth/canvas-url.ts";
import { seal, tokenFingerprint } from "../auth/crypto.ts";
import { type GrantProps, SCOPES } from "../auth/grant.ts";
import { CanvasClient } from "../canvas/client.ts";
import { CanvasError } from "../canvas/errors.ts";
import { NoopThrottleStore } from "../canvas/throttle.ts";

export interface ConsentEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  PROPS_KEY?: string;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a}
h1{font-size:1.5rem}label{display:block;margin:1rem 0 .25rem;font-weight:600}
input[type=text],input[type=password]{width:100%;padding:.5rem;font-size:1rem;border:1px solid #bbb;border-radius:4px}
.check{display:flex;gap:.5rem;align-items:flex-start;margin:.5rem 0;font-weight:400}
.check input{margin-top:.35rem}button{margin-top:1.5rem;padding:.6rem 1.2rem;font-size:1rem;background:#0b5;color:#fff;border:0;border-radius:4px}
.err{background:#fee;border:1px solid #c66;padding:.75rem;border-radius:4px}.muted{color:#555;font-size:.9rem}code{background:#f3f3f3;padding:0 .25rem}
</style></head><body>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function landing(): Response {
  return page(
    "Canvas MCP",
    `<h1>Canvas MCP</h1>
<p>A Model Context Protocol server for your own Canvas LMS account. Add this server's <code>/mcp</code> URL to an MCP client (Claude, ChatGPT, Cursor, …); it will send you to a consent page where you paste your Canvas URL and a personal access token.</p>
<p class="muted">Your token is stored encrypted and only ever sent to the Canvas instance you name. Revoke access any time by deleting the token in Canvas (Account → Settings → Approved Integrations).</p>`,
  );
}

function consentForm(opts: {
  action: string;
  clientName: string;
  error?: string;
  values?: { canvas_url?: string };
}): Response {
  const v = opts.values ?? {};
  return page(
    "Connect Canvas",
    `<h1>Connect your Canvas account</h1>
<p><strong>${esc(opts.clientName)}</strong> wants to access Canvas on your behalf.</p>
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ""}
<form method="post" action="${esc(opts.action)}">
<label for="canvas_url">Canvas URL</label>
<input type="text" id="canvas_url" name="canvas_url" placeholder="https://your-school.instructure.com" value="${esc(v.canvas_url ?? "")}" required autocomplete="url">
<label for="token">Personal access token</label>
<input type="password" id="token" name="token" required autocomplete="off">
<p class="muted">In Canvas: Account → Settings → Approved Integrations → <em>New Access Token</em>. Paste the token here; it is stored encrypted.</p>
<label>Permissions</label>
<label class="check"><input type="checkbox" checked disabled> Read my courses, assignments, grades, messages, files</label>
<label class="check"><input type="checkbox" name="allow_write" checked> Make changes on my behalf (post replies, send messages, add notes, upload files)</label>
<label class="check"><input type="checkbox" name="allow_destructive"> Allow deletions (remove notes, delete messages, leave groups)</label>
<label class="check"><input type="checkbox" name="allow_submit"> Allow submitting assignments and completing quizzes</label>
<button type="submit">Connect</button>
</form>`,
    opts.error ? 400 : 200,
  );
}

async function parseOrRender(request: Request, env: ConsentEnv): Promise<AuthRequest | Response> {
  try {
    return await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    if (!error.redirectUri)
      return page(
        "Authorization error",
        `<h1>Authorization error</h1><p class="err">${esc(error.description)}</p>`,
        400,
      );
    const redirect = new URL(error.redirectUri);
    redirect.searchParams.set("error", error.code);
    redirect.searchParams.set("error_description", error.description);
    if (error.state) redirect.searchParams.set("state", error.state);
    if (error.issuer) redirect.searchParams.set("iss", error.issuer);
    return Response.redirect(redirect.toString(), 302);
  }
}

export async function handleAuthorize(request: Request, env: ConsentEnv): Promise<Response> {
  const parsed = await parseOrRender(request, env);
  if (parsed instanceof Response) return parsed;
  const client = await env.OAUTH_PROVIDER.lookupClient(parsed.clientId);
  const clientName = client?.clientName ?? parsed.clientId;
  const action = new URL(request.url).pathname + new URL(request.url).search;

  if (request.method === "GET") return consentForm({ action, clientName });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const form = await request.formData();
  const canvasUrlRaw = String(form.get("canvas_url") ?? "");
  const token = String(form.get("token") ?? "").trim();
  const values = { canvas_url: canvasUrlRaw };
  const fail = (error: string) => consentForm({ action, clientName, error, values });

  if (!env.PROPS_KEY)
    return page(
      "Server misconfigured",
      `<h1>Server misconfigured</h1><p class="err">PROPS_KEY secret is not set.</p>`,
      500,
    );

  let baseUrl: string;
  try {
    baseUrl = normalizeCanvasUrl(canvasUrlRaw);
  } catch (err) {
    return fail(err instanceof CanvasUrlError ? err.message : "Invalid Canvas URL.");
  }
  if (!token) return fail("Paste your Canvas access token.");
  if (token.length > 512 || /\s/.test(token))
    return fail("That does not look like a Canvas access token.");

  // Verify the token against the named instance before storing anything.
  let userId: CanvasUserId;
  let name: string;
  try {
    const probe = new CanvasClient({
      baseUrl,
      token,
      throttle: new NoopThrottleStore(),
      maxRetries: 1,
    });
    const me = await probe.get<{ id?: unknown; name?: unknown }>("/api/v1/users/self");
    if (!isCanvasUserId(me.data?.id))
      return fail("Canvas responded, but not with a user profile. Is that the right URL?");
    userId = me.data.id;
    name = typeof me.data.name === "string" ? me.data.name : `user ${userId}`;
  } catch (err) {
    if (err instanceof CanvasError) {
      if (err.status === 401)
        return fail(
          "Canvas rejected that token. Check it was copied completely and has not expired.",
        );
      if (err.status === 0) return fail(`Could not reach ${baseUrl}. Check the URL.`);
      return fail(`Canvas returned an error (${err.status}). ${err.messages.join("; ")}`);
    }
    return fail(`Could not verify the token: ${(err as Error).message}`);
  }

  const scopes: string[] = [SCOPES.read];
  if (form.get("allow_write")) scopes.push(SCOPES.write);
  if (form.get("allow_destructive")) scopes.push(SCOPES.destructive);
  if (form.get("allow_submit")) scopes.push(SCOPES.submit);

  const props: GrantProps = {
    v: 1,
    baseUrl,
    sealedToken: await seal(token, env.PROPS_KEY),
    tokenId: await tokenFingerprint(token),
    userId,
    name,
    scopes,
  };
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: parsed,
    // No colons: the provider embeds this id in authorization codes split on ':'.
    userId: `${userId}@${new URL(baseUrl).hostname}`,
    metadata: { clientName, baseUrl, grantedAt: new Date().toISOString() },
    scope: scopes,
    props,
  });
  return Response.redirect(redirectTo, 302);
}

export function handleLanding(): Response {
  return landing();
}
