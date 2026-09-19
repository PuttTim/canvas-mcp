import type { CanvasUserId } from "./auth/canvas-id.ts";
import type { CanvasClient } from "./canvas/client.ts";

export const TOOLSETS = [
  "me",
  "courses",
  "assignments",
  "submissions",
  "grades",
  "modules",
  "pages",
  "announcements",
  "discussions",
  "quizzes",
  "files",
  "calendar",
  "planner",
  "conversations",
  "groups",
  "people",
  "outcomes",
  "bookmarks",
  "api",
] as const;
export type Toolset = (typeof TOOLSETS)[number];

/** Toolsets enabled when the config says `default`. Everything except the raw `api` escape hatch. */
export const DEFAULT_TOOLSETS: readonly Toolset[] = TOOLSETS.filter((t) => t !== "api");

/** Feature flags for tools that are implemented but hidden unless opted in. */
export const FEATURES = ["submit"] as const;
export type Feature = (typeof FEATURES)[number];

export interface SafetyConfig {
  /** Only register `read` tools. */
  readOnly: boolean;
  /** Register `irreversible` tools (delete, leave, cancel, …). */
  allowDestructive: boolean;
  features: ReadonlySet<Feature>;
}

export interface ServerContext extends SafetyConfig {
  canvas: CanvasClient;
  toolsets: ReadonlySet<Toolset>;
  identity?:
    | { userId?: CanvasUserId | undefined; name?: string | undefined; baseUrl: string }
    | undefined;
}

export function parseToolsets(raw: string | undefined): Set<Toolset> {
  const value = (raw ?? "default").trim();
  if (value === "" || value === "default") return new Set(DEFAULT_TOOLSETS);
  if (value === "all") return new Set(TOOLSETS);
  const out = new Set<Toolset>();
  for (const part of value.split(",")) {
    const name = part.trim();
    if (name === "default") for (const t of DEFAULT_TOOLSETS) out.add(t);
    else if ((TOOLSETS as readonly string[]).includes(name)) out.add(name as Toolset);
    else throw new Error(`Unknown toolset "${name}". Known: ${TOOLSETS.join(", ")}`);
  }
  return out;
}

export function parseFeatures(raw: string | undefined): Set<Feature> {
  const out = new Set<Feature>();
  for (const part of (raw ?? "").split(",")) {
    const name = part.trim();
    if (!name) continue;
    if ((FEATURES as readonly string[]).includes(name)) out.add(name as Feature);
    else throw new Error(`Unknown feature "${name}". Known: ${FEATURES.join(", ")}`);
  }
  return out;
}

export function parseBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/** Environment variables shared by every adapter. */
export interface EnvConfig {
  CANVAS_MCP_TOOLSETS?: string | undefined;
  CANVAS_MCP_READ_ONLY?: string | undefined;
  CANVAS_MCP_ALLOW_DESTRUCTIVE?: string | undefined;
  CANVAS_MCP_FEATURES?: string | undefined;
}

export function safetyFromEnv(env: EnvConfig): SafetyConfig & { toolsets: Set<Toolset> } {
  return {
    toolsets: parseToolsets(env.CANVAS_MCP_TOOLSETS),
    readOnly: parseBool(env.CANVAS_MCP_READ_ONLY),
    allowDestructive: parseBool(env.CANVAS_MCP_ALLOW_DESTRUCTIVE),
    features: parseFeatures(env.CANVAS_MCP_FEATURES),
  };
}
