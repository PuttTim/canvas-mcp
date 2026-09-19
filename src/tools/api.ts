import { z } from "zod";
import type { QueryObject } from "../canvas/params.ts";
import { findSpecEndpoint, specEndpoints } from "../canvas/spec.ts";
import { defineTool } from "./registry.ts";

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const queryValue = z.union([scalar, z.array(scalar).max(100)]);

function validatePath(path: string): string {
  if (!path.startsWith("/api/v1/")) throw new Error("Only /api/v1 Canvas paths are allowed.");
  if (path.includes("?") || path.includes("#"))
    throw new Error("Put query parameters in the query object, not in path.");
  const segments = path.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw new Error("Path contains invalid percent-encoding.");
    }
  });
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\") ||
        [...segment].some((character) => character.charCodeAt(0) < 32),
    )
  )
    throw new Error("Path traversal is not allowed.");
  return path;
}

export const apiTools = [
  defineTool({
    name: "canvas_api_find_endpoint",
    toolset: "api",
    kind: "read",
    description:
      "Search the committed Canvas API specification by keyword, resource or HTTP method. The api toolset is disabled by default.",
    input: z.object({
      query: z.string().trim().min(1),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
      resource: z.string().trim().min(1).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    handler: async ({ query, method, resource, limit }) => {
      const needle = query.toLowerCase();
      const matches = specEndpoints.filter(
        (endpoint) =>
          (!method || endpoint.method === method) &&
          (!resource || endpoint.resource === resource) &&
          [endpoint.path, endpoint.nickname, endpoint.resource, endpoint.summary]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      );
      const items = matches.slice(0, limit).map((endpoint) => ({
        method: endpoint.method,
        path: endpoint.path,
        nickname: endpoint.nickname,
        resource: endpoint.resource,
        summary: endpoint.summary,
        parameters: endpoint.params.map((param) => ({
          name: param.name,
          in: param.in,
          type: param.type,
          required: param.required,
          enum: param.enum,
        })),
        returns: endpoint.returns,
      }));
      return {
        structured: { items, count: items.length, truncated: matches.length > limit },
        text: `${items.length} matching Canvas API endpoint(s).`,
      };
    },
  }),
  defineTool({
    name: "canvas_api_request",
    toolset: "api",
    kind: "read",
    description:
      "Make one GET request to an endpoint documented in the committed Canvas specification. Cross-origin URLs, writes and undocumented paths are refused; the api toolset is disabled by default.",
    input: z
      .object({
        path: z.string().min(1).optional(),
        page_url: z
          .string()
          .url()
          .optional()
          .describe(
            "Same-instance next_page_url returned by an earlier call; overrides path/query.",
          ),
        query: z.record(z.string(), queryValue).default({}),
      })
      .refine((args) => args.path !== undefined || args.page_url !== undefined, {
        message: "Provide path or page_url.",
      }),
    handler: async ({ path: rawPath, page_url, query }, ctx) => {
      let requestTarget: string;
      let path: string;
      if (page_url) {
        requestTarget = ctx.canvas.resolveUrl(page_url);
        path = validatePath(new URL(requestTarget).pathname);
      } else {
        path = validatePath(rawPath ?? "");
        requestTarget = path;
      }
      const endpoint = findSpecEndpoint("GET", path);
      if (!endpoint) throw new Error("No documented GET endpoint matches this Canvas path.");
      const allowedQuery = new Set([
        "per_page",
        ...endpoint.params.filter((param) => param.in === "query").map((param) => param.name),
      ]);
      for (const key of page_url ? [] : Object.keys(query)) {
        if (!allowedQuery.has(key))
          throw new Error(`Query parameter "${key}" is not documented for this endpoint.`);
      }
      const perPage = page_url ? undefined : query.per_page;
      if (
        typeof perPage === "number" &&
        (!Number.isInteger(perPage) || perPage < 1 || perPage > 100)
      )
        throw new Error("per_page must be an integer from 1 to 100.");
      const response = await ctx.canvas.get<unknown>(requestTarget, {
        query: page_url ? undefined : (query as QueryObject),
      });
      const nextPageUrl = response.links.next ?? null;
      return {
        structured: {
          endpoint: {
            method: endpoint.method,
            path: endpoint.path,
            nickname: endpoint.nickname,
            resource: endpoint.resource,
          },
          data: response.data,
          next_page_url: nextPageUrl,
        },
        text: `Canvas GET completed for ${endpoint.nickname}.${nextPageUrl ? " More results are available." : ""}`,
      };
    },
  }),
];
