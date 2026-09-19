/**
 * Cloudflare Workers entry.
 *
 *   OAuthProvider
 *     ├─ /mcp            (apiHandler)   MCP over Streamable HTTP; ctx.props = GrantProps
 *     ├─ /authorize      (default)      consent page: Canvas URL + token → grant
 *     ├─ /oauth/token, /oauth/register, /.well-known/*   (provider)
 *     ├─ /direct/mcp     (default)      dev-only bearer passthrough when ALLOW_DIRECT_BEARER=1
 *     └─ /, /health      (default)
 */
import { type OAuthHelpers, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { open } from "../auth/crypto.ts";
import {
  ALL_SCOPES,
  type GrantProps,
  isGrantProps,
  SCOPES,
  safetyFromScopes,
} from "../auth/grant.ts";
import { CanvasClient } from "../canvas/client.ts";
import { type EnvConfig, parseToolsets, type ServerContext, safetyFromEnv } from "../context.ts";
import { buildServer } from "../server.ts";
import { DurableObjectThrottleStore, ThrottleDurableObject } from "../state/throttle-do.ts";
import { handleAuthorize } from "./consent.ts";
import { handleLanding } from "./landing.ts";

export { ThrottleDurableObject };

export interface Env extends EnvConfig {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  THROTTLE: DurableObjectNamespace<ThrottleDurableObject>;
  PROPS_KEY?: string;
  ALLOW_DIRECT_BEARER?: string;
  CANVAS_BASE_URL?: string;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function serveMcp(request: Request, ctx: ServerContext): Promise<Response> {
  const handler = createMcpHandler(() => buildServer(ctx), {
    onerror: (err) => console.error(`[canvas-mcp] ${err.message}`),
  });
  try {
    return await handler.fetch(request);
  } finally {
    await handler.close();
  }
}

function contextFromGrant(props: GrantProps, env: Env): ServerContext {
  const key = env.PROPS_KEY;
  if (!key) throw new Error("PROPS_KEY secret is not set");
  const stub = env.THROTTLE.get(env.THROTTLE.idFromName(props.tokenId));
  const canvas = new CanvasClient({
    baseUrl: props.baseUrl,
    token: () => open(props.sealedToken, key),
    throttle: new DurableObjectThrottleStore(stub),
  });
  return {
    canvas,
    toolsets: parseToolsets(env.CANVAS_MCP_TOOLSETS),
    ...safetyFromScopes(props.scopes),
    identity: { userId: props.userId, name: props.name, baseUrl: props.baseUrl },
  };
}

/** Protected route: the provider has already validated the bearer and decrypted props. */
const apiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: unknown }).props;
    if (!isGrantProps(props)) {
      return json(
        401,
        {
          error: "invalid_token",
          error_description: "Grant is missing Canvas credentials; please reconnect.",
        },
        {
          "www-authenticate": 'Bearer error="invalid_token"',
        },
      );
    }
    return serveMcp(request, contextFromGrant(props, env));
  },
};

/** Dev-only: `Authorization: Bearer <canvas token>` + `X-Canvas-Base-URL`, no OAuth. */
async function directBearer(request: Request, env: Env): Promise<Response> {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m?.[1])
    return new Response("Missing Authorization: Bearer <canvas token>", {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="canvas-mcp-direct"' },
    });
  const baseUrl = request.headers.get("x-canvas-base-url") ?? env.CANVAS_BASE_URL;
  if (!baseUrl) return json(400, { error: "Set X-Canvas-Base-URL header" });
  let canvas: CanvasClient;
  try {
    canvas = new CanvasClient({ baseUrl, token: m[1] });
  } catch (err) {
    return json(400, { error: (err as Error).message });
  }
  return serveMcp(request, {
    canvas,
    ...safetyFromEnv(env),
    identity: { baseUrl: canvas.baseUrl },
  });
}

const defaultHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/":
        return handleLanding(request, env);
      case "/health":
        return json(200, { name: "canvas-mcp", mcp: "/mcp", status: "ok" });
      case "/authorize":
        return handleAuthorize(request, env);
      case "/direct/mcp":
        if (env.ALLOW_DIRECT_BEARER !== "1") return json(404, { error: "not found" });
        return directBearer(request, env);
      default:
        return json(404, { error: "not found" });
    }
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: [...ALL_SCOPES],
  resourceMetadata: {
    scopes_supported: [SCOPES.read],
    bearer_methods_supported: ["header"],
    resource_name: "Canvas MCP",
  },
  accessTokenTTL: 3600,
});
