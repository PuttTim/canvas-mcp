import { z } from "zod";
import { submissions } from "../canvas/services/student.ts";
import { listResult, paginateOpts, paginationInput, verboseInput } from "./common.ts";
import { defineTool } from "./registry.ts";
import { assignment, course, dryRunInput, id, projection, requestTool, text } from "./request.ts";

export const submissionFields = [
  "id",
  "assignment_id",
  "user_id",
  "attempt",
  "submission_type",
  "body",
  "url",
  "grade",
  "score",
  "student_entered_score",
  "graded_at",
  "submitted_at",
  "workflow_state",
  "late",
  "missing",
  "excused",
  "late_policy_status",
  "points_deducted",
  "seconds_late",
  "preview_url",
  "html_url",
  "attachments",
  "submission_comments",
  "rubric_assessment",
  "assignment",
];
const listInput = z.object({
  ...course,
  assignment_ids: z.array(id).optional(),
  ...paginationInput,
  verbose: verboseInput,
});
const submitInput = z.object({
  ...assignment,
  submission: z.discriminatedUnion("submission_type", [
    z.object({ submission_type: z.literal("online_text_entry"), body: text }),
    z.object({ submission_type: z.literal("online_url"), url: z.url({ protocol: /^https?$/ }) }),
    z.object({ submission_type: z.literal("online_upload"), file_ids: z.array(id).min(1) }),
    z.object({
      submission_type: z.literal("media_recording"),
      media_comment_id: text,
      media_comment_type: z.enum(["audio", "video"]),
    }),
  ]),
  comment: z.string().optional(),
  dry_run: dryRunInput,
  confirmed: z
    .boolean()
    .default(false)
    .describe(
      "Set true only after the user approves the exact submission payload. Use dry_run first.",
    ),
});

export const submissionTools = [
  requestTool({
    name: "canvas_submissions_get_mine",
    toolset: "submissions",
    description: "Get your own submission, feedback, attachments and rubric for an assignment.",
    input: z.object({ ...assignment, verbose: verboseInput }),
    operation: submissions.get,
    query: () => ({ include: ["submission_comments", "rubric_assessment", "submission_history"] }),
    fields: submissionFields,
  }),
  requestTool({
    name: "canvas_submissions_list_mine",
    toolset: "submissions",
    description: "List only your own submissions across assignments in one course.",
    input: listInput,
    operation: submissions.list,
    list: true,
    query: (a) => ({
      student_ids: ["self"],
      assignment_ids: a.assignment_ids,
      include: ["assignment", "submission_comments"],
    }),
    fields: submissionFields,
  }),
  requestTool({
    name: "canvas_submissions_comments_list",
    toolset: "submissions",
    description: "Read comments on your own assignment submission.",
    input: z.object({ ...assignment, verbose: verboseInput }),
    operation: submissions.get,
    query: () => ({ include: ["submission_comments"] }),
    select: (value) => ({ items: (value as Record<string, unknown>).submission_comments ?? [] }),
  }),
  defineTool({
    name: "canvas_submissions_submission_summary_mine",
    toolset: "submissions",
    kind: "read",
    description:
      "Summarize your own fetched submissions by state. Counts cover only returned pages; follow next_page_url for more.",
    input: listInput,
    handler: async (a, ctx) => {
      const page = await ctx.canvas.collect<Record<string, unknown>>(
        `/api/v1/courses/${a.course_id}/students/submissions`,
        { student_ids: ["self"], assignment_ids: a.assignment_ids },
        paginateOpts(a),
      );
      const counts: Record<string, number> = {};
      for (const item of page.items) {
        const state = String(item.workflow_state ?? "unknown");
        counts[state] = (counts[state] ?? 0) + 1;
      }
      return {
        ...listResult(page, (s) => projection(s, submissionFields, a.verbose), "submission"),
        structured: {
          counts,
          count: page.items.length,
          next_page_url: page.nextPageUrl,
          complete: page.nextPageUrl === null,
        },
      };
    },
  }),
  requestTool({
    name: "canvas_submissions_submit",
    toolset: "submissions",
    kind: "write",
    feature: "submit",
    description:
      "Submit academic work as text, URL, uploaded file IDs or media. Requires the submit feature, dry-run review and confirmed=true for a real submission. Uploading a file alone does not submit it.",
    input: submitInput,
    operation: submissions.submit,
    fields: submissionFields,
    body: (a) => {
      if (!a.dry_run && !a.confirmed)
        throw new Error(
          "Preview with dry_run=true, then obtain user approval of the exact payload before setting confirmed=true.",
        );
      return {
        submission: a.submission,
        ...(a.comment === undefined ? {} : { comment: { text_comment: a.comment } }),
      };
    },
  }),
  requestTool({
    name: "canvas_submissions_comment_add",
    toolset: "submissions",
    kind: "write",
    description:
      "Add a text comment to your own submission. Does not change a grade or submit the assignment.",
    input: z.object({
      ...assignment,
      comment: text,
      group_comment: z.boolean().default(false),
      dry_run: dryRunInput,
    }),
    operation: submissions.comment,
    fields: submissionFields,
    body: (a) => ({ comment: { text_comment: a.comment, group_comment: a.group_comment } }),
  }),
  ...(
    [
      ["mark_read", submissions.read],
      ["mark_unread", submissions.unread],
    ] as const
  ).map(([verb, operation]) =>
    requestTool({
      name: `canvas_submissions_${verb}`,
      toolset: "submissions",
      kind: "write",
      idempotent: true,
      description: `${verb === "mark_read" ? "Mark" : "Unmark"} your submission feedback as read.`,
      input: z.object({ ...assignment, dry_run: dryRunInput }),
      operation,
    }),
  ),
];
