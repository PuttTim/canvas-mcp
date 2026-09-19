import { z } from "zod";
import { modules } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { course, dryRunInput, id, requestTool } from "./request.ts";

const moduleInput = { ...course, module_id: id };
const itemInput = { ...moduleInput, item_id: id };
const moduleFields = [
  "id",
  "name",
  "position",
  "unlock_at",
  "require_sequential_progress",
  "prerequisite_module_ids",
  "state",
  "completed_at",
  "items_count",
  "items_url",
  "items",
  "published",
];
const itemFields = [
  "id",
  "title",
  "position",
  "indent",
  "type",
  "module_id",
  "html_url",
  "url",
  "page_url",
  "external_url",
  "content_id",
  "completion_requirement",
  "content_details",
  "published",
];
export const moduleTools = [
  requestTool({
    name: "canvas_modules_list",
    toolset: "modules",
    description:
      "List modules with your completion state and embedded items. Canvas may omit items in large modules; use items_list then.",
    input: z.object({
      ...course,
      search_term: z.string().optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: modules.list,
    list: true,
    query: (a) => ({ include: ["items", "content_details"], search_term: a.search_term }),
    fields: moduleFields,
  }),
  requestTool({
    name: "canvas_modules_get",
    toolset: "modules",
    description: "Read a module, prerequisites and your completion state.",
    input: z.object({ ...moduleInput, verbose: verboseInput }),
    operation: modules.get,
    query: () => ({ include: ["items", "content_details"] }),
    fields: moduleFields,
  }),
  requestTool({
    name: "canvas_modules_items_list",
    toolset: "modules",
    description: "List items in a module, including completion requirements and content links.",
    input: z.object({ ...moduleInput, ...paginationInput, verbose: verboseInput }),
    operation: modules.items,
    list: true,
    query: () => ({ include: ["content_details"] }),
    fields: itemFields,
  }),
  requestTool({
    name: "canvas_modules_item_get",
    toolset: "modules",
    description: "Read one module item and its completion requirement.",
    input: z.object({ ...itemInput, verbose: verboseInput }),
    operation: modules.item,
    query: () => ({ include: ["content_details"] }),
    fields: itemFields,
  }),
  requestTool({
    name: "canvas_modules_item_sequence",
    toolset: "modules",
    description: "Find the previous and next module items around an asset.",
    input: z.object({
      ...course,
      asset_type: z.enum([
        "ModuleItem",
        "File",
        "Page",
        "Discussion",
        "Assignment",
        "Quiz",
        "ExternalTool",
      ]),
      asset_id: z
        .union([id, z.string().min(1)])
        .describe("Asset id, or the page slug when asset_type is Page."),
      verbose: verboseInput,
    }),
    operation: modules.sequence,
    query: (a) => ({ asset_type: a.asset_type, asset_id: a.asset_id }),
  }),
  requestTool({
    name: "canvas_modules_progress",
    toolset: "modules",
    description: "Read your completed and total module requirements for a course.",
    input: z.object(course),
    operation: modules.progress,
  }),
  ...(
    [
      ["item_mark_done", modules.done, "write"],
      ["item_mark_read", modules.read, "write"],
      ["item_mark_not_done", modules.notDone, "irreversible"],
    ] as const
  ).map(([verb, operation, kind]) =>
    requestTool({
      name: `canvas_modules_${verb}`,
      toolset: "modules",
      kind,
      idempotent: true,
      description: `${verb.replaceAll("_", " ")} for your own module progress.`,
      input: z.object({ ...itemInput, dry_run: dryRunInput }),
      operation,
    }),
  ),
  requestTool({
    name: "canvas_modules_select_mastery_path",
    toolset: "modules",
    kind: "write",
    description: "Choose an available mastery-path assignment set for yourself.",
    input: z.object({ ...itemInput, assignment_set_id: id, dry_run: dryRunInput }),
    operation: modules.mastery,
    body: (a) => ({ assignment_set_id: a.assignment_set_id }),
  }),
];
