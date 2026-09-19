/**
 * End-to-end through the real Worker in Miniflare: discovery → client
 * registration → consent (token verified against the mocked Canvas) → PKCE
 * token exchange → MCP tools over the protected route → direct bearer mode.
 */
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://canvas-mcp.test";
const REDIRECT = "http://localhost:3333/callback";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  return { verifier, challenge };
}

async function registerClient(): Promise<string> {
  const res = await SELF.fetch(`${ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test Client",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { client_id: string };
  return body.client_id;
}

function authorizeUrl(clientId: string, challenge: string, state = "xyz"): string {
  const u = new URL(`${ORIGIN}/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", REDIRECT);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", "canvas:read canvas:write");
  return u.toString();
}

async function consent(url: string, fields: Record<string, string>) {
  const form = new URLSearchParams(fields);
  return SELF.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
}

async function rpc(
  token: string,
  method: string,
  params: unknown = {},
  path = "/mcp",
  extraHeaders: Record<string, string> = {},
) {
  const res = await SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: loose JSON-RPC envelope in tests
  let data: any = {};
  try {
    data =
      text.startsWith("event:") || text.startsWith("data:")
        ? JSON.parse(
            text
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5))
              .join(""),
          )
        : JSON.parse(text);
  } catch {
    // leave data empty; callers assert on status with text as the message
  }
  return { status: res.status, headers: res.headers, data, text };
}

/** Full happy path; returns an access token. */
async function connect(
  fields: Record<string, string> = {
    canvas_url: "school.instructure.com",
    token: "good-token",
    allow_write: "on",
  },
) {
  const clientId = await registerClient();
  const { verifier, challenge } = await pkce();
  const url = authorizeUrl(clientId, challenge);
  const res = await consent(url, fields);
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location") ?? "");
  expect(location.origin + location.pathname).toBe(REDIRECT);
  expect(location.searchParams.get("state")).toBe("xyz");
  const code = location.searchParams.get("code");
  expect(code).toBeTruthy();
  const tokenRes = await SELF.fetch(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });
  expect(tokenRes.status, await tokenRes.clone().text()).toBe(200);
  const tokens = (await tokenRes.json()) as { access_token: string; scope?: string };
  return tokens;
}

describe("worker", () => {
  it("serves health, landing, and OAuth discovery", async () => {
    expect((await (await SELF.fetch(`${ORIGIN}/health`)).json()) as object).toMatchObject({
      status: "ok",
    });
    const landing = await SELF.fetch(`${ORIGIN}/`);
    expect(landing.headers.get("content-type")).toContain("text/html");
    const catalogue = await landing.text();
    expect(catalogue).toContain('data-tool="canvas_files_files_list"');
    expect(catalogue).toContain('data-tool="canvas_submissions_submit"');
    expect(catalogue).toContain("canvas:destructive");
    expect(landing.headers.get("cache-control")).toBe("no-store");
    const meta = (await (
      await SELF.fetch(`${ORIGIN}/.well-known/oauth-authorization-server`)
    ).json()) as Record<string, unknown>;
    expect(meta.authorization_endpoint).toBe(`${ORIGIN}/authorize`);
    expect(meta.token_endpoint).toBe(`${ORIGIN}/oauth/token`);
    const prm = (await (
      await SELF.fetch(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as Record<string, unknown>;
    expect(prm.resource).toBe(`${ORIGIN}/mcp`);
  });

  it("challenges unauthenticated /mcp requests", async () => {
    const res = await SELF.fetch(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("serves filtered tool documentation publicly without Canvas access", async () => {
    const response = await SELF.fetch(`${ORIGIN}/?toolset=files&scope=canvas%3Aread`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('data-tool="canvas_files_file_get"');
    expect(html).not.toContain('data-tool="canvas_files_upload"');
    expect(html).not.toContain('data-tool="canvas_courses_list"');
  });

  it("renders the consent form and rejects bad input without storing anything", async () => {
    const clientId = await registerClient();
    const { challenge } = await pkce();
    const url = authorizeUrl(clientId, challenge);
    const form = await SELF.fetch(url);
    expect(form.status).toBe(200);
    const html = await form.text();
    expect(html).toContain("Test Client");
    expect(html).toContain('name="canvas_url"');

    const badUrl = await consent(url, { canvas_url: "http://localhost", token: "good-token" });
    expect(badUrl.status).toBe(400);
    expect(await badUrl.text()).toMatch(/https|public hostname/i);

    const badToken = await consent(url, {
      canvas_url: "school.instructure.com",
      token: "wrong-token",
    });
    expect(badToken.status).toBe(400);
    expect(await badToken.text()).toMatch(/rejected that token/i);

    const unreachable = await consent(url, {
      canvas_url: "unreachable.example",
      token: "good-token",
    });
    expect(unreachable.status).toBe(400);
    expect(await unreachable.text()).toMatch(/error \(502\)/i);
  });

  it("completes the OAuth flow and serves MCP tools scoped by consent", async () => {
    const tokens = await connect();
    expect(tokens.scope).toContain("canvas:write");
    expect(tokens.scope).not.toContain("canvas:destructive");

    const list = await rpc(tokens.access_token, "tools/list");
    expect(list.status, list.text).toBe(200);
    const names = (list.data.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("canvas_me");
    expect(names).toContain("canvas_courses_favorite_add");
    expect(names).not.toContain("canvas_courses_favorite_remove");
    expect(names).toContain("canvas_planner_items_list");
    expect(names).toContain("canvas_discussions_entry_reply");
    expect(names).not.toContain("canvas_submissions_submit");

    const me = await rpc(tokens.access_token, "tools/call", { name: "canvas_me", arguments: {} });
    expect(me.data.result.isError).toBeFalsy();
    expect(me.data.result.structuredContent).toMatchObject({ id: 42, name: "Ada Lovelace" });
    expect(me.data.result.content[0].text).toContain("https://school.instructure.com");
  });

  it("accepts string Canvas user IDs through consent and the protected MCP route", async () => {
    const tokens = await connect({
      canvas_url: "string-ids.instructure.com",
      token: "good-token",
    });
    const me = await rpc(tokens.access_token, "tools/call", { name: "canvas_me", arguments: {} });
    expect(me.status, me.text).toBe(200);
    expect(me.data.result.isError).toBeFalsy();
    expect(me.data.result.structuredContent).toMatchObject({
      id: "9007199254740993",
      name: "Ada Lovelace",
    });
  });

  it("read-only consent hides write tools; destructive consent shows them", async () => {
    const ro = await connect({ canvas_url: "school.instructure.com", token: "good-token" });
    const roNames = (
      (await rpc(ro.access_token, "tools/list")).data.result.tools as Array<{ name: string }>
    ).map((t) => t.name);
    expect(roNames).toContain("canvas_me");
    expect(roNames).not.toContain("canvas_courses_favorite_add");
    expect(roNames).not.toContain("canvas_conversations_reply");
    expect(roNames).not.toContain("canvas_files_upload");

    const d = await connect({
      canvas_url: "school.instructure.com",
      token: "good-token",
      allow_write: "on",
      allow_destructive: "on",
    });
    const dNames = (
      (await rpc(d.access_token, "tools/list")).data.result.tools as Array<{ name: string }>
    ).map((t) => t.name);
    expect(dNames).toContain("canvas_courses_favorite_remove");
    expect(dNames).toContain("canvas_planner_note_delete");
  });

  it("serves M2 planner results for each grant's Canvas instance", async () => {
    const school = await connect();
    const other = await connect({ canvas_url: "other.instructure.com", token: "good-token" });
    for (const [tokens, host] of [
      [school, "school.instructure.com"],
      [other, "other.instructure.com"],
    ] as const) {
      const result = await rpc(tokens.access_token, "tools/call", {
        name: "canvas_planner_items_list",
        arguments: { start_date: "2026-09-19", end_date: "2026-09-26" },
      });
      expect(result.data.result.isError).toBeFalsy();
      expect(result.data.result.structuredContent.items[0].html_url).toBe(
        `https://${host}/courses/1/assignments/2`,
      );
    }
  });

  it("gates submit by OAuth consent and previews the payload through /mcp", async () => {
    const tokens = await connect({
      canvas_url: "school.instructure.com",
      token: "good-token",
      allow_write: "on",
      allow_submit: "on",
    });
    const tools = (await rpc(tokens.access_token, "tools/list")).data.result.tools as Array<{
      name: string;
    }>;
    expect(tools.map((t) => t.name)).toContain("canvas_submissions_submit");
    const args = {
      course_id: 1,
      assignment_id: 2,
      submission: { submission_type: "online_text_entry", body: "Reviewed answer" },
    };
    const blocked = await rpc(tokens.access_token, "tools/call", {
      name: "canvas_submissions_submit",
      arguments: args,
    });
    expect(blocked.data.result.isError).toBe(true);
    const preview = await rpc(tokens.access_token, "tools/call", {
      name: "canvas_submissions_submit",
      arguments: { ...args, dry_run: true },
    });
    expect(preview.data.result.isError).toBeFalsy();
    expect(preview.data.result.structuredContent).toMatchObject({
      dry_run: true,
      request: {
        method: "POST",
        url: "https://school.instructure.com/api/v1/courses/1/assignments/2/submissions",
        body: { submission: args.submission },
      },
    });
  });

  it("rejects a bogus bearer on /mcp", async () => {
    const res = await rpc("not-a-real-token", "tools/list");
    expect(res.status).toBe(401);
  });

  it("supports dev-only direct bearer mode", async () => {
    const res = await rpc(
      "good-token",
      "tools/call",
      { name: "canvas_courses_list", arguments: {} },
      "/direct/mcp",
      { "x-canvas-base-url": "https://school.instructure.com" },
    );
    expect(res.status, res.text).toBe(200);
    expect(res.data.result.structuredContent.items[0]).toMatchObject({ id: 1, name: "Algorithms" });
  });

  it("throttle durable object tiers delays by remaining quota", async () => {
    const stub = env.THROTTLE.get(env.THROTTLE.idFromName("test-token"));
    expect((await stub.acquire()).delayMs).toBe(0);
    await stub.release({ remaining: 100 });
    expect((await stub.acquire()).delayMs).toBe(1000);
    await stub.release({ remaining: 300 });
    expect((await stub.acquire()).delayMs).toBe(250);
    await stub.release({ cost: 5 });
    const snap = await stub.snapshot();
    expect(snap.remaining).toBeGreaterThanOrEqual(295);
    expect(snap.inflight).toBe(0);
  });
});
