import { z } from "zod";
import { quizzes } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { dryRunInput, id, requestTool } from "./request.ts";

const quizFields = [
  "id",
  "title",
  "description",
  "quiz_type",
  "assignment_group_id",
  "time_limit",
  "shuffle_answers",
  "allowed_attempts",
  "scoring_policy",
  "one_question_at_a_time",
  "cant_go_back",
  "due_at",
  "lock_at",
  "unlock_at",
  "published",
  "question_count",
  "points_possible",
  "has_access_code",
  "html_url",
];
const submissionFields = [
  "id",
  "quiz_id",
  "user_id",
  "submission_id",
  "started_at",
  "finished_at",
  "end_at",
  "attempt",
  "workflow_state",
  "score",
  "kept_score",
  "validation_token",
  "time_spent",
  "attempts_left",
  "overdue_and_needs_submission",
];
const attemptCredentials = {
  attempt: z.number().int().positive(),
  validation_token: z.string().min(1),
  access_code: z.string().min(1).optional(),
};

export const quizTools = [
  requestTool({
    name: "canvas_quizzes_list",
    toolset: "quizzes",
    description: "List classic quizzes visible to you in a course.",
    input: z.object({
      course_id: id,
      search_term: z.string().min(1).optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: quizzes.list,
    list: true,
    fields: quizFields,
    query: (a) => ({ search_term: a.search_term }),
  }),
  requestTool({
    name: "canvas_quizzes_get",
    toolset: "quizzes",
    description: "Read the details, timing and attempt rules for one classic quiz.",
    input: z.object({ course_id: id, quiz_id: id, verbose: verboseInput }),
    operation: quizzes.get,
    fields: quizFields,
  }),
  requestTool({
    name: "canvas_quizzes_submissions_mine",
    toolset: "quizzes",
    description:
      "List your own attempts for a classic quiz. Canvas restricts student tokens to their own submissions.",
    input: z.object({
      course_id: id,
      quiz_id: id,
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: quizzes.submissions,
    query: () => ({ include: ["submission", "quiz"] }),
    list: true,
    listKey: "quiz_submissions",
    fields: submissionFields,
  }),
  requestTool({
    name: "canvas_quizzes_submission_questions",
    toolset: "quizzes",
    description:
      "List the question records for your active or completed classic-quiz attempt. Possible answers are returned only when Canvas permits them.",
    input: z.object({
      quiz_submission_id: id,
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: quizzes.questions,
    query: () => ({ include: ["quiz_question"] }),
    list: true,
    fields: ["id", "flagged", "answer", "answers", "quiz_question"],
  }),
  requestTool({
    name: "canvas_quizzes_submission_time",
    toolset: "quizzes",
    description: "Get the current end time and seconds remaining for an active quiz attempt.",
    input: z.object({ course_id: id, quiz_id: id, quiz_submission_id: id }),
    operation: quizzes.time,
  }),
  requestTool({
    name: "canvas_quizzes_submission_start",
    toolset: "quizzes",
    kind: "write",
    feature: "submit",
    description:
      "Start a real classic-quiz attempt. This consumes an attempt and returns an attempt number and validation token; preview with dry_run first.",
    input: z.object({
      course_id: id,
      quiz_id: id,
      access_code: z.string().min(1).optional(),
      dry_run: dryRunInput,
    }),
    operation: quizzes.start,
    fields: submissionFields,
    body: (a) => ({ access_code: a.access_code }),
  }),
  requestTool({
    name: "canvas_quizzes_submission_answer",
    toolset: "quizzes",
    kind: "write",
    feature: "submit",
    description:
      "Save answers for an active classic-quiz attempt. Answer formats depend on question type; use the question records returned by Canvas.",
    input: z.object({
      quiz_submission_id: id,
      ...attemptCredentials,
      quiz_questions: z
        .array(z.object({ id, answer: z.json() }))
        .min(1)
        .describe("Question ids and Canvas-compatible answer values."),
      dry_run: dryRunInput,
    }),
    operation: quizzes.answer,
    body: (a) => ({
      attempt: a.attempt,
      validation_token: a.validation_token,
      access_code: a.access_code,
      quiz_questions: a.quiz_questions,
    }),
  }),
  ...(["flag", "unflag"] as const).map((verb) =>
    requestTool({
      name: `canvas_quizzes_submission_${verb}`,
      toolset: "quizzes",
      kind: "write",
      feature: "submit",
      idempotent: true,
      description: `${verb === "flag" ? "Flag" : "Unflag"} a question in your active classic-quiz attempt for later review.`,
      input: z.object({
        quiz_submission_id: id,
        question_id: id,
        ...attemptCredentials,
        dry_run: dryRunInput,
      }),
      operation: quizzes[verb],
      body: (a) => ({
        attempt: a.attempt,
        validation_token: a.validation_token,
        access_code: a.access_code,
      }),
    }),
  ),
  requestTool({
    name: "canvas_quizzes_submission_complete",
    toolset: "quizzes",
    kind: "write",
    feature: "submit",
    description:
      "Turn in an active classic-quiz attempt. This is final: preview the exact request and obtain explicit approval before confirmed=true.",
    input: z.object({
      course_id: id,
      quiz_id: id,
      quiz_submission_id: id,
      ...attemptCredentials,
      confirmed: z.boolean().default(false),
      dry_run: dryRunInput,
    }),
    operation: quizzes.complete,
    fields: submissionFields,
    body: (a) => {
      if (!a.dry_run && !a.confirmed)
        throw new Error(
          "Preview with dry_run=true, then obtain user approval of the exact payload before setting confirmed=true.",
        );
      return {
        attempt: a.attempt,
        validation_token: a.validation_token,
        access_code: a.access_code,
      };
    },
  }),
];
