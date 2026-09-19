import { z } from "zod";
import { grades, submissions } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { course, dryRunInput, id, requestTool } from "./request.ts";
import { submissionFields } from "./submissions.ts";

export const gradeTools = [
  requestTool({
    name: "canvas_grades_course_grades",
    toolset: "grades",
    description: "Read your own student enrollment grades for a course.",
    input: z.object({ ...course, ...paginationInput, verbose: verboseInput }),
    operation: grades.enrollments,
    list: true,
    query: () => ({ user_id: "self", type: ["StudentEnrollment"], include: ["current_points"] }),
    fields: [
      "id",
      "course_id",
      "user_id",
      "type",
      "enrollment_state",
      "grades",
      "html_url",
      "current_grading_period_id",
      "current_period_computed_current_score",
      "current_period_computed_final_score",
    ],
  }),
  ...(["assignment_scores", "what_if_list"] as const).map((verb) =>
    requestTool({
      name: `canvas_grades_${verb}`,
      toolset: "grades",
      description:
        verb === "what_if_list"
          ? "Read your submissions' saved student_entered_score values (what-if scores), alongside actual scores."
          : "Read actual scores, grades and feedback on your own assignments.",
      input: z.object({
        ...course,
        assignment_ids: z.array(id).optional(),
        ...paginationInput,
        verbose: verboseInput,
      }),
      operation: submissions.list,
      list: true,
      query: (a) => ({
        student_ids: ["self"],
        assignment_ids: a.assignment_ids,
        include: ["assignment"],
      }),
      fields: submissionFields,
    }),
  ),
  requestTool({
    name: "canvas_grades_grading_periods_list",
    toolset: "grades",
    description: "List the course's grading periods.",
    input: z.object({ ...course, ...paginationInput, verbose: verboseInput }),
    operation: grades.periods,
    list: true,
    listKey: "grading_periods",
    fields: ["id", "title", "start_date", "end_date", "close_date", "weight"],
  }),
  requestTool({
    name: "canvas_grades_what_if_set",
    toolset: "grades",
    kind: "write",
    idempotent: true,
    description:
      "Set a hypothetical score on one of your submissions. This recalculates your what-if grade, not the instructor's grade. Use sparingly.",
    input: z.object({
      submission_id: id,
      student_entered_score: z.number().nonnegative(),
      dry_run: dryRunInput,
    }),
    operation: grades.whatIf,
    body: (a) => ({ student_entered_score: a.student_entered_score }),
  }),
  requestTool({
    name: "canvas_grades_what_if_reset",
    toolset: "grades",
    kind: "irreversible",
    idempotent: true,
    description: "Clear all of your saved what-if scores in a course.",
    input: z.object({ ...course, dry_run: dryRunInput }),
    operation: grades.reset,
  }),
];
