import { z } from "zod";
import type { CanvasClient } from "../canvas/client.ts";
import type { QueryObject } from "../canvas/params.ts";
import { type Operation, operationPath, previewRequest } from "../canvas/services/operations.ts";
import type { Feature, ServerContext, Toolset } from "../context.ts";
import { listResult, paginateOpts } from "./common.ts";
import { htmlToMarkdown } from "./project.ts";
import { defineTool, type ToolKind } from "./registry.ts";

export const id = z.number().int().positive();
export const text = z.string().min(1);
export const date = z
  .string()
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) && Number.isFinite(Date.parse(v)),
    "Use an ISO date or timestamp.",
  );
export const dryRunInput = z
  .boolean()
  .default(false)
  .describe("Preview the exact request without sending it to Canvas.");
export const course = { course_id: id };
export const assignment = { ...course, assignment_id: id };
export const topic = { ...course, topic_id: id };
export const entry = { ...topic, entry_id: id };
export const dateRange = { start_date: date.optional(), end_date: date.optional() };

export function dryRunResult(
  canvas: CanvasClient,
  method: Operation["method"],
  path: string,
  query?: QueryObject,
  body?: unknown,
) {
  return {
    structured: {
      dry_run: true,
      request: previewRequest(canvas, { method, path }, path, query, body),
    },
    text: "Dry run: no change sent to Canvas.",
  };
}

export type DryRun = ReturnType<typeof dryRunResult>["structured"];

/** Preserve nested content while converting known HTML fields. Verbose leaves it untouched. */
export function readable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(readable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      typeof v === "string" && ["body", "description", "message"].includes(key)
        ? `${key}_markdown`
        : key,
      typeof v === "string" && ["body", "description", "message"].includes(key)
        ? htmlToMarkdown(v)
        : readable(v),
    ]),
  );
}

export function projection(
  value: unknown,
  fields: readonly string[] | undefined,
  verbose: boolean,
): unknown {
  if (verbose) return value ?? { success: true };
  if (Array.isArray(value)) return value.map((v) => projection(v, fields, false));
  if (value && typeof value === "object" && fields) {
    return readable(Object.fromEntries(Object.entries(value).filter(([k]) => fields.includes(k))));
  }
  return readable(value ?? { success: true });
}

interface RequestToolOptions<S extends z.ZodRawShape> {
  name: string;
  toolset: Toolset;
  kind?: ToolKind;
  description: string;
  input: z.ZodObject<S>;
  operation: Operation | ((args: z.output<z.ZodObject<S>>) => Operation);
  query?: (args: z.output<z.ZodObject<S>>) => QueryObject;
  /** Pure payload builder: must not perform I/O, including during a dry run. */
  body?: (args: z.output<z.ZodObject<S>>, ctx: ServerContext) => unknown;
  list?: boolean;
  listKey?: string;
  fields?: readonly string[];
  select?: (value: unknown, args: z.output<z.ZodObject<S>>) => unknown;
  filter?: (value: unknown) => boolean;
  feature?: Feature;
  idempotent?: boolean;
}

/** One execution path for projections, pagination and side-effect-free write previews. */
export function requestTool<S extends z.ZodRawShape>(options: RequestToolOptions<S>) {
  return defineTool({
    name: options.name,
    toolset: options.toolset,
    kind: options.kind ?? "read",
    description: options.description,
    input: options.input,
    ...(options.feature ? { feature: options.feature } : {}),
    ...(options.idempotent === undefined ? {} : { idempotent: options.idempotent }),
    handler: async (args, ctx) => {
      const operation =
        typeof options.operation === "function" ? options.operation(args) : options.operation;
      const record = args as Record<string, unknown>;
      const path = operationPath(operation, record);
      const query = options.query?.(args);
      const body = await options.body?.(args, ctx);
      if (record.dry_run === true) {
        return {
          structured: {
            dry_run: true,
            request: previewRequest(ctx.canvas, operation, path, query, body),
          },
          text: "Dry run: no change sent to Canvas.",
        };
      }
      const project = (value: unknown) =>
        projection(
          options.select ? options.select(value, args) : value,
          options.fields,
          record.verbose === true,
        );
      if (options.list) {
        const page = await ctx.canvas.collect<unknown>(path, query, {
          ...paginateOpts({
            page_url: record.page_url as string | undefined,
            per_page: record.per_page as number,
            max_pages: record.max_pages as number,
          }),
          ...(options.listKey ? { listKey: options.listKey } : {}),
        });
        return listResult(
          { ...page, items: options.filter ? page.items.filter(options.filter) : page.items },
          project,
          options.toolset,
        );
      }
      const response = await ctx.canvas.request<unknown>(operation.method, path, { query, body });
      return { structured: project(response.data), text: `${options.name}: request completed.` };
    },
  });
}
