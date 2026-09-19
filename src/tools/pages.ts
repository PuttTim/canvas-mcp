import { z } from "zod";
import { pages } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { course, dryRunInput, id, requestTool, text } from "./request.ts";

const pageInput = {
  ...course,
  page_url_or_id: text.describe("Canvas page slug or numeric page id; not a full URL."),
};
const fields = [
  "page_id",
  "url",
  "title",
  "body",
  "created_at",
  "updated_at",
  "published",
  "front_page",
  "html_url",
  "editing_roles",
  "locked_for_user",
  "lock_explanation",
  "revision_id",
  "edited_by",
  "latest",
];
export const pageTools = [
  requestTool({
    name: "canvas_pages_list",
    toolset: "pages",
    description: "List visible course pages.",
    input: z.object({
      ...course,
      search_term: z.string().optional(),
      sort: z.enum(["title", "created_at", "updated_at"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: pages.list,
    list: true,
    fields,
    query: (a) => ({ search_term: a.search_term, sort: a.sort, order: a.order }),
  }),
  requestTool({
    name: "canvas_pages_get",
    toolset: "pages",
    description: "Read a course page as Markdown.",
    input: z.object({ ...pageInput, verbose: verboseInput }),
    operation: pages.get,
    fields,
  }),
  requestTool({
    name: "canvas_pages_revisions_list",
    toolset: "pages",
    description: "List accessible revisions of a course page.",
    input: z.object({ ...pageInput, ...paginationInput, verbose: verboseInput }),
    operation: pages.revisions,
    list: true,
    fields,
  }),
  requestTool({
    name: "canvas_pages_revision_get",
    toolset: "pages",
    description: "Read a specific page revision as Markdown.",
    input: z.object({ ...pageInput, revision_id: id, verbose: verboseInput }),
    operation: pages.revision,
    fields,
    query: () => ({ summary: false }),
  }),
  requestTool({
    name: "canvas_pages_create",
    toolset: "pages",
    kind: "write",
    description:
      "Create a course page where student page creation is permitted. Canvas enforces course permissions.",
    input: z.object({ ...course, title: text, body: z.string().default(""), dry_run: dryRunInput }),
    operation: pages.create,
    fields,
    body: (a) => ({ wiki_page: { title: a.title, body: a.body } }),
  }),
  requestTool({
    name: "canvas_pages_update",
    toolset: "pages",
    kind: "write",
    idempotent: true,
    description:
      "Edit a page's title/body where students may edit it. Requires at least one changed field.",
    input: z
      .object({
        ...pageInput,
        title: text.optional(),
        body: z.string().optional(),
        dry_run: dryRunInput,
      })
      .refine((a) => a.title !== undefined || a.body !== undefined, "Provide title or body."),
    operation: pages.update,
    fields,
    body: (a) => ({ wiki_page: { title: a.title, body: a.body } }),
  }),
];
