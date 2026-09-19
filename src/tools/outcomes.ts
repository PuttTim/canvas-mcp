import { z } from "zod";
import { outcomes } from "../canvas/services/student.ts";
import type { ServerContext } from "../context.ts";
import { listResult, paginateOpts, paginationInput, verboseInput } from "./common.ts";
import { defineTool } from "./registry.ts";
import { id, projection, requestTool } from "./request.ts";

async function ownUserId(ctx: ServerContext): Promise<string | number> {
  if (ctx.identity?.userId !== undefined) return ctx.identity.userId;
  const response = await ctx.canvas.get<Record<string, unknown>>("/api/v1/users/self");
  const userId = response.data.id;
  if (typeof userId !== "string" && typeof userId !== "number")
    throw new Error("Canvas did not return the current user's id.");
  return userId;
}

const filters = {
  course_id: id,
  outcome_ids: z.array(id).max(100).optional(),
  ...paginationInput,
  verbose: verboseInput,
};

export const outcomeTools = [
  defineTool({
    name: "canvas_outcomes_results_mine",
    toolset: "outcomes",
    kind: "read",
    description:
      "List your own assessed learning-outcome results in a course. The request is always restricted to the connected user.",
    input: z.object({ ...filters, include_alignments: z.boolean().default(true) }),
    handler: async (args, ctx) => {
      const page = await ctx.canvas.collect<unknown>(
        `/api/v1/courses/${args.course_id}/outcome_results`,
        {
          user_ids: [await ownUserId(ctx)],
          outcome_ids: args.outcome_ids,
          include: args.include_alignments ? ["alignments"] : undefined,
        },
        { ...paginateOpts(args), listKey: "outcome_results" },
      );
      return listResult(
        page,
        (value) =>
          projection(
            value,
            ["id", "score", "submitted_or_assessed_at", "links", "percent", "hide_points"],
            args.verbose,
          ),
        "outcome result",
      );
    },
  }),
  defineTool({
    name: "canvas_outcomes_rollups_mine",
    toolset: "outcomes",
    kind: "read",
    description:
      "List your own learning-outcome mastery rollups in a course. The request is always restricted to the connected user.",
    input: z.object({
      ...filters,
      exclude_missing_results: z.boolean().default(false),
      add_defaults: z.boolean().default(false),
    }),
    handler: async (args, ctx) => {
      const page = await ctx.canvas.collect<unknown>(
        `/api/v1/courses/${args.course_id}/outcome_rollups`,
        {
          user_ids: [await ownUserId(ctx)],
          outcome_ids: args.outcome_ids,
          include: ["outcomes", "outcome_groups", "outcome_paths"],
          exclude: args.exclude_missing_results ? ["missing_outcome_results"] : undefined,
          add_defaults: args.add_defaults,
        },
        { ...paginateOpts(args), listKey: "rollups" },
      );
      return listResult(
        page,
        (value) => projection(value, ["scores", "name", "links"], args.verbose),
        "outcome rollup",
      );
    },
  }),
  requestTool({
    name: "canvas_outcomes_get",
    toolset: "outcomes",
    description: "Read an accessible learning outcome and its mastery ratings.",
    input: z.object({
      outcome_id: id,
      add_defaults: z.boolean().default(false),
      verbose: verboseInput,
    }),
    operation: outcomes.get,
    fields: [
      "id",
      "url",
      "context_id",
      "context_type",
      "title",
      "display_name",
      "description",
      "vendor_guid",
      "points_possible",
      "mastery_points",
      "ratings",
      "calculation_method",
      "calculation_int",
    ],
    query: (a) => ({ add_defaults: a.add_defaults }),
  }),
];
