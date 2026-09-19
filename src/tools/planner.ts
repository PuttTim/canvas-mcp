import { z } from "zod";
import { planner } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { date, dateRange, dryRunInput, id, requestTool, text } from "./request.ts";

const noteFields = [
  "id",
  "title",
  "details",
  "todo_date",
  "course_id",
  "user_id",
  "workflow_state",
  "created_at",
  "updated_at",
  "linked_object_type",
  "linked_object_id",
  "linked_object_html_url",
];
const dates = {
  ...dateRange,
  context_codes: z.array(z.string().regex(/^(course|group)_\d+$/)).optional(),
};
const plannable = z.enum([
  "announcement",
  "assignment",
  "discussion_topic",
  "quiz",
  "wiki_page",
  "planner_note",
  "calendar_event",
  "assessment_request",
  "sub_assignment",
  "peer_review_sub_assignment",
]);
export const plannerTools = [
  requestTool({
    name: "canvas_planner_items_list",
    toolset: "planner",
    description:
      "Find what's due across your courses in a date range, including assignments, quizzes, discussions and personal notes. Use ISO dates in your time zone and paginate.",
    input: z.object({
      ...dates,
      filter: z.enum(["new_activity", "incomplete_items", "complete_items"]).optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: planner.items,
    list: true,
    fields: [
      "course_id",
      "context_type",
      "context_name",
      "plannable_type",
      "plannable_id",
      "plannable_date",
      "plannable",
      "planner_override",
      "submissions",
      "html_url",
      "new_activity",
    ],
    query: (a) => ({
      start_date: a.start_date,
      end_date: a.end_date,
      context_codes: a.context_codes,
      filter: a.filter,
    }),
  }),
  requestTool({
    name: "canvas_planner_notes_list",
    toolset: "planner",
    description: "List your personal planner notes, optionally within a date range.",
    input: z.object({ ...dates, ...paginationInput, verbose: verboseInput }),
    operation: planner.notes,
    list: true,
    fields: noteFields,
    query: (a) => ({
      start_date: a.start_date,
      end_date: a.end_date,
      context_codes: a.context_codes,
    }),
  }),
  requestTool({
    name: "canvas_planner_note_get",
    toolset: "planner",
    description: "Read a personal planner note.",
    input: z.object({ note_id: id, verbose: verboseInput }),
    operation: planner.note,
    fields: noteFields,
  }),
  requestTool({
    name: "canvas_planner_overrides_list",
    toolset: "planner",
    description: "List your planner completion and dismissal overrides.",
    input: z.object({ ...paginationInput, verbose: verboseInput }),
    operation: planner.overrides,
    list: true,
  }),
  requestTool({
    name: "canvas_planner_note_create",
    toolset: "planner",
    kind: "write",
    description: "Create a personal to-do note in your Canvas planner.",
    input: z.object({
      title: text,
      todo_date: date,
      details: z.string().optional(),
      course_id: id.optional(),
      dry_run: dryRunInput,
    }),
    operation: planner.create,
    fields: noteFields,
    body: (a) => ({
      title: a.title,
      todo_date: a.todo_date,
      details: a.details,
      course_id: a.course_id,
    }),
  }),
  requestTool({
    name: "canvas_planner_note_update",
    toolset: "planner",
    kind: "write",
    idempotent: true,
    description:
      "Update your planner note. Omitted fields stay unchanged; course_id=null removes its course association.",
    input: z
      .object({
        note_id: id,
        title: text.optional(),
        todo_date: date.optional(),
        details: z.string().optional(),
        course_id: id.nullable().optional(),
        dry_run: dryRunInput,
      })
      .refine(
        (a) => [a.title, a.todo_date, a.details, a.course_id].some((v) => v !== undefined),
        "Provide a note field to change.",
      ),
    operation: planner.update,
    fields: noteFields,
    body: (a) => ({
      title: a.title,
      todo_date: a.todo_date,
      details: a.details,
      course_id: a.course_id,
    }),
  }),
  requestTool({
    name: "canvas_planner_override_set",
    toolset: "planner",
    kind: "write",
    description:
      "Set a planner item's completed/dismissed state. Pass its existing override_id to update; otherwise provide plannable_type and plannable_id to create an override.",
    input: z
      .object({
        override_id: id.optional(),
        plannable_type: plannable.optional(),
        plannable_id: id.optional(),
        marked_complete: z.boolean().optional(),
        dismissed: z.boolean().optional(),
        dry_run: dryRunInput,
      })
      .refine(
        (a) =>
          a.override_id !== undefined ||
          (a.plannable_type !== undefined && a.plannable_id !== undefined),
        "Provide override_id or plannable_type plus plannable_id.",
      )
      .refine(
        (a) => a.marked_complete !== undefined || a.dismissed !== undefined,
        "Provide marked_complete or dismissed.",
      ),
    operation: (a) => (a.override_id ? planner.overrideUpdate : planner.overrideCreate),
    body: (a) => ({
      ...(a.override_id ? {} : { plannable_type: a.plannable_type, plannable_id: a.plannable_id }),
      marked_complete: a.marked_complete,
      dismissed: a.dismissed,
    }),
  }),
  requestTool({
    name: "canvas_planner_note_delete",
    toolset: "planner",
    kind: "irreversible",
    idempotent: true,
    description: "Delete a personal planner note.",
    input: z.object({ note_id: id, dry_run: dryRunInput }),
    operation: planner.delete,
  }),
];
