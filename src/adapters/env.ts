import { CanvasClient } from "../canvas/client.ts";
import { type EnvConfig, type ServerContext, safetyFromEnv } from "../context.ts";

export interface LocalEnv extends EnvConfig {
  CANVAS_BASE_URL?: string | undefined;
  CANVAS_TOKEN?: string | undefined;
}

/** Build a single-tenant context from environment variables (stdio / Node adapters). */
export function contextFromEnv(env: LocalEnv, extra: { fetch?: typeof fetch } = {}): ServerContext {
  const baseUrl = env.CANVAS_BASE_URL?.trim();
  const token = env.CANVAS_TOKEN?.trim();
  if (!baseUrl)
    throw new Error("CANVAS_BASE_URL is required (e.g. https://school.instructure.com)");
  if (!token) throw new Error("CANVAS_TOKEN is required (a Canvas personal access token)");
  const canvasOpts: ConstructorParameters<typeof CanvasClient>[0] = { baseUrl, token };
  if (extra.fetch) canvasOpts.fetch = extra.fetch;
  const canvas = new CanvasClient(canvasOpts);
  return { canvas, ...safetyFromEnv(env), identity: { baseUrl: canvas.baseUrl } };
}
