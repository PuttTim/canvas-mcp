import { z } from "zod";
import { assignments } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { assignment, course, id, requestTool } from "./request.ts";

export const assignmentFields = [
  "id",
  "course_id",
  "name",
  "description",
  "due_at",
  "unlock_at",
  "lock_at",
  "points_possible",
  "grading_type",
  "submission_types",
  "allowed_extensions",
  "allowed_attempts",
  "assignment_group_id",
  "html_url",
  "published",
  "locked_for_user",
  "lock_explanation",
  "has_submitted_submissions",
  "submission",
  "rubric",
  "rubric_settings",
  "peer_reviews",
  "omit_from_final_grade",
];
export const assignmentTools = [
  requestTool({
    name: "canvas_assignments_list",
    toolset: "assignments",
    description:
      "List course assignments, including the student's effective due dates and submission state. Use bucket='upcoming' or 'overdue'; paginate for all results.",
    input: z.object({
      ...course,
      bucket: z
        .enum(["past", "overdue", "undated", "ungraded", "unsubmitted", "upcoming", "future"])
        .optional(),
      search_term: z.string().optional(),
      assignment_ids: z.array(id).optional(),
      order_by: z.enum(["position", "name", "due_at"]).default("due_at"),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: assignments.list,
    list: true,
    fields: assignmentFields,
    query: (a) => ({
      bucket: a.bucket,
      search_term: a.search_term,
      assignment_ids: a.assignment_ids,
      order_by: a.order_by,
      override_assignment_dates: true,
      include: ["submission"],
    }),
  }),
  requestTool({
    name: "canvas_assignments_get",
    toolset: "assignments",
    description:
      "Read an assignment's instructions as Markdown, rubric, accepted submission types, effective due date and your submission.",
    input: z.object({ ...assignment, verbose: verboseInput }),
    operation: assignments.get,
    fields: assignmentFields,
    query: () => ({ include: ["submission"], override_assignment_dates: true }),
  }),
  requestTool({
    name: "canvas_assignments_groups_list",
    toolset: "assignments",
    description:
      "List assignment groups and their grade weights, with assignments scoped to the current student.",
    input: z.object({ ...course, ...paginationInput, verbose: verboseInput }),
    operation: assignments.groups,
    list: true,
    fields: ["id", "name", "position", "group_weight", "rules", "assignments"],
    query: () => ({
      include: ["assignments", "submission"],
      scope_assignments_to_student: true,
      override_assignment_dates: true,
    }),
  }),
  requestTool({
    name: "canvas_assignments_overrides_for_me",
    toolset: "assignments",
    description:
      "Get your effective due, unlock and lock dates after Canvas applies individual, group and section overrides. This returns the effective schedule, not other students' override records.",
    input: z.object({ ...assignment }),
    operation: assignments.get,
    fields: ["id", "due_at", "unlock_at", "lock_at", "locked_for_user", "lock_explanation"],
    query: () => ({ override_assignment_dates: true }),
  }),
  requestTool({
    name: "canvas_assignments_peer_reviews_list",
    toolset: "assignments",
    description: "List peer reviews visible to your student account for an assignment.",
    input: z.object({ ...assignment, ...paginationInput, verbose: verboseInput }),
    operation: assignments.peerReviews,
    list: true,
    fields: [
      "id",
      "asset_id",
      "asset_type",
      "user_id",
      "assessor_id",
      "workflow_state",
      "user",
      "submission_comments",
    ],
    query: () => ({ include: ["user", "submission_comments"] }),
  }),
];
