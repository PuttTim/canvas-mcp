import { z } from "zod";
import { bookmarks } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { dryRunInput, id, requestTool, text } from "./request.ts";

const fields = ["id", "name", "url", "position", "data"];
const bookmarkUrl = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "Use a Canvas-relative path beginning with one slash, such as /courses/123.",
  });
const writable = {
  name: text.optional(),
  url: bookmarkUrl.optional(),
  position: z.number().int().nonnegative().optional(),
  data: z.string().max(10_000).optional(),
};

export const bookmarkTools = [
  requestTool({
    name: "canvas_bookmarks_list",
    toolset: "bookmarks",
    description: "List your Canvas navigation bookmarks.",
    input: z.object({ ...paginationInput, verbose: verboseInput }),
    operation: bookmarks.list,
    list: true,
    fields,
  }),
  requestTool({
    name: "canvas_bookmarks_get",
    toolset: "bookmarks",
    description: "Read one Canvas bookmark.",
    input: z.object({ bookmark_id: id, verbose: verboseInput }),
    operation: bookmarks.get,
    fields,
  }),
  requestTool({
    name: "canvas_bookmarks_create",
    toolset: "bookmarks",
    kind: "write",
    description: "Create a bookmark to a Canvas-relative path.",
    input: z.object({
      name: text,
      url: bookmarkUrl,
      position: z.number().int().nonnegative().optional(),
      data: z.string().max(10_000).optional(),
      dry_run: dryRunInput,
    }),
    operation: bookmarks.create,
    fields,
    body: (a) => ({ name: a.name, url: a.url, position: a.position, data: a.data }),
  }),
  requestTool({
    name: "canvas_bookmarks_update",
    toolset: "bookmarks",
    kind: "write",
    idempotent: true,
    description: "Update the supplied fields of one Canvas bookmark.",
    input: z.object({ bookmark_id: id, ...writable, dry_run: dryRunInput }),
    operation: bookmarks.update,
    fields,
    body: (a) => {
      if ([a.name, a.url, a.position, a.data].every((value) => value === undefined))
        throw new Error("Provide at least one bookmark field to update.");
      return { name: a.name, url: a.url, position: a.position, data: a.data };
    },
  }),
  requestTool({
    name: "canvas_bookmarks_delete",
    toolset: "bookmarks",
    kind: "irreversible",
    idempotent: true,
    description: "Delete one of your Canvas bookmarks.",
    input: z.object({ bookmark_id: id, dry_run: dryRunInput }),
    operation: bookmarks.delete,
  }),
];
