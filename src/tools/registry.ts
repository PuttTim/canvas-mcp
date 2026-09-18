import type { CallToolResult, McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { CanvasError } from "../canvas/errors.ts";
import type { Feature, ServerContext, Toolset } from "../context.ts";

/**
 * read         → safe, no side effects (readOnlyHint)
 * write        → creates/updates state; reversible by another call
 * irreversible → deletes, leaves, cancels, submits: destructiveHint, gated by allowDestructive
 */
export type ToolKind = "read" | "write" | "irreversible";

export interface ToolResult<T> {
  /** Typed payload returned as `structuredContent`. */
  structured: T;
  /** One-line human summary. Defaults to a JSON preview. */
  text?: string | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: variance of zod generics
export interface ToolDef<In extends z.ZodType = any, Out = unknown> {
  /** Full tool name, e.g. `canvas_courses_list`. */
  name: string;
  toolset: Toolset;
  kind: ToolKind;
  title?: string;
  description: string;
  input: In;
  /** Feature flag required to register this tool. */
  feature?: Feature;
  /** Whether repeating the call has no additional effect. Defaults: read → true, others → false. */
  idempotent?: boolean;
  handler: (args: z.output<In>, ctx: ServerContext) => Promise<ToolResult<Out>>;
}

export function defineTool<In extends z.ZodType, Out>(def: ToolDef<In, Out>): ToolDef<In, Out> {
  if (!/^canvas_[a-z0-9_]+$/.test(def.name)) throw new Error(`Bad tool name ${def.name}`);
  return def;
}

export function annotationsFor(def: ToolDef): ToolAnnotations {
  const base: ToolAnnotations = { openWorldHint: true };
  if (def.title) base.title = def.title;
  switch (def.kind) {
    case "read":
      return {
        ...base,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: def.idempotent ?? true,
      };
    case "write":
      // destructiveHint deliberately unset: clients default it to true, which fails safe.
      return { ...base, readOnlyHint: false, idempotentHint: def.idempotent ?? false };
    case "irreversible":
      return {
        ...base,
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: def.idempotent ?? false,
      };
  }
}

/** Decide whether a tool is visible under the given context. */
export function isEnabled(def: ToolDef, ctx: ServerContext): boolean {
  if (!ctx.toolsets.has(def.toolset)) return false;
  if (ctx.readOnly && def.kind !== "read") return false;
  if (def.kind === "irreversible" && !ctx.allowDestructive) return false;
  if (def.feature && !ctx.features.has(def.feature)) return false;
  return true;
}

function preview(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 400 ? `${s.slice(0, 399)}…` : s;
}

export function toCallToolResult(result: ToolResult<unknown>): CallToolResult {
  const text = result.text ?? preview(result.structured);
  const out: CallToolResult = { content: [{ type: "text", text }] };
  const s = result.structured;
  // The wire shape requires an object; wrap arrays/primitives.
  out.structuredContent =
    s !== null && typeof s === "object" && !Array.isArray(s)
      ? (s as Record<string, unknown>)
      : { result: s };
  return out;
}

export function errorResult(err: unknown): CallToolResult {
  if (err instanceof CanvasError) {
    const detail = err.messages.length ? ` Canvas said: ${err.messages.join("; ")}` : "";
    return {
      isError: true,
      content: [{ type: "text", text: `${err.hint}${detail} (HTTP ${err.status} ${err.path})` }],
      structuredContent: {
        error: {
          status: err.status,
          messages: err.messages,
          path: err.path,
          rateLimited: err.rateLimited,
        },
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: { message } },
  };
}

export function registerTools(
  server: McpServer,
  ctx: ServerContext,
  defs: readonly ToolDef[],
): string[] {
  const registered: string[] = [];
  for (const def of defs) {
    if (!isEnabled(def, ctx)) continue;
    const config: Parameters<McpServer["registerTool"]>[1] = {
      description: def.description,
      inputSchema: def.input,
      annotations: annotationsFor(def),
    };
    if (def.title) config.title = def.title;
    server.registerTool(def.name, config, async (args: unknown) => {
      try {
        return toCallToolResult(await def.handler(args, ctx));
      } catch (err) {
        return errorResult(err);
      }
    });
    registered.push(def.name);
  }
  return registered;
}
