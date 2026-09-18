/**
 * Cloudflare Workers entry (M0: bearer passthrough).
 *
 * The MCP client sends the Canvas personal access token as
 * `Authorization: Bearer <token>` and the instance as `X-Canvas-Base-URL`
 * (or the Worker has CANVAS_BASE_URL set). M1 replaces this with the OAuth
 * consent flow; the factory shape stays the same.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { CanvasClient } from "../canvas/client.ts";
import { type EnvConfig, type ServerContext, safetyFromEnv } from "../context.ts";
import { buildServer } from "../server.ts";

export interface WorkerEnv extends EnvConfig {
  CANVAS_BASE_URL?: string;
}

const MCP_PATH = "/mcp";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function contextFromRequest(request: Request, env: WorkerEnv): ServerContext | Response {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m?.[1]) {
    return new Response("Missing Authorization: Bearer <canvas token>", {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="canvas-mcp"' },
    });
  }
  const baseUrl = request.headers.get("x-canvas-base-url") ?? env.CANVAS_BASE_URL;
  if (!baseUrl)
    return json(400, {
      error: "Set X-Canvas-Base-URL header (e.g. https://school.instructure.com)",
    });
  let canvas: CanvasClient;
  try {
    canvas = new CanvasClient({ baseUrl, token: m[1] });
  } catch (err) {
    return json(400, { error: (err as Error).message });
  }
  return { canvas, ...safetyFromEnv(env), identity: { baseUrl: canvas.baseUrl } };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json(200, { name: "canvas-mcp", mcp: MCP_PATH, status: "ok" });
    }
    if (url.pathname !== MCP_PATH) return json(404, { error: "not found" });

    const ctx = contextFromRequest(request, env);
    if (ctx instanceof Response) return ctx;

    const handler = createMcpHandler(() => buildServer(ctx), {
      onerror: (err) => console.error(`[canvas-mcp] ${err.message}`),
    });
    try {
      return await handler.fetch(request);
    } finally {
      await handler.close();
    }
  },
};
