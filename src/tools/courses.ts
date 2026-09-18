import { z } from "zod";
import { courses } from "../canvas/services/courses.ts";
import type { Course } from "../canvas/types.gen.ts";
import {
  courseIdInput,
  listResult,
  paginateOpts,
  paginationInput,
  verboseInput,
} from "./common.ts";
import { htmlToMarkdown } from "./project.ts";
import { defineTool } from "./registry.ts";

const COURSE_INCLUDES = [
  "term",
  "total_scores",
  "current_grading_period_scores",
  "grading_periods",
  "syllabus_body",
  "public_description",
  "course_progress",
  "sections",
  "teachers",
  "favorites",
  "tabs",
  "course_image",
  "concluded",
  "total_students",
] as const;

function courseSummary(c: Course, verbose: boolean) {
  if (verbose) return c;
  const enrollments = (c.enrollments as Array<Record<string, unknown>> | undefined)?.map((e) => ({
    type: e.type,
    role: e.role,
    state: e.enrollment_state,
    current_score: e.computed_current_score,
    current_grade: e.computed_current_grade,
    final_score: e.computed_final_score,
    final_grade: e.computed_final_grade,
    current_period_score: e.current_period_computed_current_score,
    current_period_grade: e.current_period_computed_current_grade,
  }));
  const term = c.term as Record<string, unknown> | undefined;
  const raw = c as Record<string, unknown>;
  return {
    id: c.id,
    name: c.name,
    original_name: raw.original_name,
    course_code: c.course_code,
    workflow_state: c.workflow_state,
    start_at: c.start_at,
    end_at: c.end_at,
    term: term
      ? { id: term.id, name: term.name, start_at: term.start_at, end_at: term.end_at }
      : undefined,
    enrollments,
    is_favorite: raw.is_favorite,
    concluded: raw.concluded,
    default_view: c.default_view,
    time_zone: c.time_zone,
    course_progress: raw.course_progress,
    teachers: (raw.teachers as Array<Record<string, unknown>> | undefined)?.map((t) => ({
      id: t.id,
      name: t.display_name,
    })),
    sections: (raw.sections as Array<Record<string, unknown>> | undefined)?.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.enrollment_role,
    })),
    total_students: raw.total_students,
    syllabus_markdown:
      typeof c.syllabus_body === "string" ? htmlToMarkdown(c.syllabus_body) : undefined,
    public_description: c.public_description,
    image_url: raw.image_download_url,
    html_url: `${raw.html_url ?? ""}` || undefined,
  };
}

export const courseTools = [
  defineTool({
    name: "canvas_courses_list",
    toolset: "courses",
    kind: "read",
    title: "List my courses",
    description:
      "List courses the user is enrolled in. Defaults to active enrollments; set enrollment_state to 'completed' for past courses. Add includes such as 'term', 'total_scores' (current grade per course), 'course_progress', or 'teachers'.",
    input: z.object({
      enrollment_state: z
        .enum(["active", "invited_or_pending", "completed"])
        .optional()
        .describe(
          "Filter by the user's enrollment state. Omit for Canvas default (active + invited).",
        ),
      enrollment_type: z.enum(["student", "teacher", "ta", "observer", "designer"]).optional(),
      state: z
        .array(z.enum(["unpublished", "available", "completed", "deleted"]))
        .optional()
        .describe("Course workflow states to include."),
      include: z.array(z.enum(COURSE_INCLUDES)).default(["term", "total_scores", "favorites"]),
      exclude_blueprint_courses: z.boolean().optional(),
      verbose: verboseInput,
      ...paginationInput,
    }),
    handler: async (args, ctx) => {
      const page = await courses.list(
        ctx.canvas,
        {
          enrollment_state: args.enrollment_state,
          enrollment_type: args.enrollment_type,
          state: args.state,
          include: args.include,
          exclude_blueprint_courses: args.exclude_blueprint_courses,
        },
        paginateOpts(args),
      );
      return listResult(page, (c) => courseSummary(c, args.verbose), "course");
    },
  }),

  defineTool({
    name: "canvas_courses_get",
    toolset: "courses",
    kind: "read",
    title: "Get a course",
    description:
      "Get one course by id with optional includes (syllabus_body returns the syllabus as Markdown, total_scores returns the user's current grade, course_progress returns module completion).",
    input: z.object({
      course_id: courseIdInput,
      include: z
        .array(z.enum(COURSE_INCLUDES))
        .default(["term", "total_scores", "course_progress", "teachers"]),
      verbose: verboseInput,
    }),
    handler: async ({ course_id, include, verbose }, ctx) => {
      const res = await courses.get(ctx.canvas, course_id, { include });
      const s = courseSummary(res.data, verbose);
      return {
        structured: s,
        text: `Course ${course_id}: ${res.data.name ?? ""} (${res.data.workflow_state ?? "?"}).`,
      };
    },
  }),

  defineTool({
    name: "canvas_courses_syllabus",
    toolset: "courses",
    kind: "read",
    title: "Get course syllabus",
    description: "Return the course syllabus body as Markdown (and raw HTML when verbose).",
    input: z.object({ course_id: courseIdInput, verbose: verboseInput }),
    handler: async ({ course_id, verbose }, ctx) => {
      const res = await courses.get(ctx.canvas, course_id, { include: ["syllabus_body"] });
      const html = res.data.syllabus_body ?? null;
      const markdown = htmlToMarkdown(html);
      const structured = {
        course_id,
        name: res.data.name,
        syllabus_markdown: markdown,
        ...(verbose ? { syllabus_html: html } : {}),
      };
      return {
        structured,
        text: markdown
          ? `Syllabus for ${res.data.name ?? course_id} (${markdown.length} chars).`
          : "This course has no syllabus body.",
      };
    },
  }),

  defineTool({
    name: "canvas_courses_tabs",
    toolset: "courses",
    kind: "read",
    title: "List course navigation tabs",
    description:
      "List the navigation tabs visible to the user in a course (Modules, Assignments, Grades, external tools, …) with their URLs. Useful to discover which features a course actually uses.",
    input: z.object({ course_id: courseIdInput, include_external: z.boolean().default(true) }),
    handler: async ({ course_id, include_external }, ctx) => {
      const res = await courses.tabs(
        ctx.canvas,
        course_id,
        include_external ? { include: ["external"] } : undefined,
      );
      const items = res.data.map((t) => {
        const raw = t as Record<string, unknown>;
        return {
          id: t.id,
          label: t.label,
          type: t.type,
          hidden: t.hidden,
          position: t.position,
          html_url: t.html_url,
          full_url: raw.full_url,
        };
      });
      return {
        structured: { items, count: items.length },
        text: `${items.length} tab(s): ${items.map((t) => t.label).join(", ")}.`,
      };
    },
  }),

  defineTool({
    name: "canvas_courses_progress",
    toolset: "courses",
    kind: "read",
    title: "My progress in a course",
    description:
      "Module-requirement completion for the user in a course: requirements completed vs total, next requirement URL, completion date.",
    input: z.object({ course_id: courseIdInput }),
    handler: async ({ course_id }, ctx) => {
      const res = await courses.progress(ctx.canvas, course_id);
      const d = res.data;
      return {
        structured: d,
        text: `${d.requirement_completed_count ?? 0}/${d.requirement_count ?? 0} requirements completed.`,
      };
    },
  }),

  defineTool({
    name: "canvas_courses_favorites_list",
    toolset: "courses",
    kind: "read",
    title: "List favourite courses",
    description:
      "Courses the user has starred as favourites (these appear on the Canvas dashboard).",
    input: z.object({ verbose: verboseInput, ...paginationInput }),
    handler: async (args, ctx) => {
      const page = await courses.favorites(ctx.canvas, paginateOpts(args));
      return listResult(page, (c) => courseSummary(c, args.verbose), "favourite course");
    },
  }),

  defineTool({
    name: "canvas_courses_favorite_add",
    toolset: "courses",
    kind: "write",
    idempotent: true,
    title: "Add course to favourites",
    description: "Star a course so it shows on the user's dashboard.",
    input: z.object({ course_id: courseIdInput }),
    handler: async ({ course_id }, ctx) => {
      const res = await courses.addFavorite(ctx.canvas, course_id);
      return { structured: res.data, text: `Course ${course_id} added to favourites.` };
    },
  }),

  defineTool({
    name: "canvas_courses_favorite_remove",
    toolset: "courses",
    kind: "irreversible",
    idempotent: true,
    title: "Remove course from favourites",
    description:
      "Unstar a course so it no longer shows on the user's dashboard. Reversible by adding it again, but it is a deletion so it is gated as destructive.",
    input: z.object({ course_id: courseIdInput }),
    handler: async ({ course_id }, ctx) => {
      const res = await courses.removeFavorite(ctx.canvas, course_id);
      return { structured: res.data, text: `Course ${course_id} removed from favourites.` };
    },
  }),

  defineTool({
    name: "canvas_courses_nicknames_list",
    toolset: "courses",
    kind: "read",
    title: "List course nicknames",
    description:
      "Personal nicknames the user has set for courses (shown instead of the official name in their Canvas UI).",
    input: z.object({}),
    handler: async (_args, ctx) => {
      const res = await courses.nicknames(ctx.canvas);
      return {
        structured: { items: res.data, count: res.data.length },
        text: `${res.data.length} nickname(s).`,
      };
    },
  }),

  defineTool({
    name: "canvas_courses_nickname_set",
    toolset: "courses",
    kind: "write",
    idempotent: true,
    title: "Set a course nickname",
    description: "Set the user's personal nickname for a course (max 60 characters).",
    input: z.object({ course_id: courseIdInput, nickname: z.string().min(1).max(60) }),
    handler: async ({ course_id, nickname }, ctx) => {
      const res = await courses.setNickname(ctx.canvas, course_id, nickname);
      return { structured: res.data, text: `Course ${course_id} is now nicknamed "${nickname}".` };
    },
  }),

  defineTool({
    name: "canvas_courses_nickname_remove",
    toolset: "courses",
    kind: "irreversible",
    idempotent: true,
    title: "Remove a course nickname",
    description: "Remove the user's personal nickname for a course, restoring the official name.",
    input: z.object({ course_id: courseIdInput }),
    handler: async ({ course_id }, ctx) => {
      const res = await courses.removeNickname(ctx.canvas, course_id);
      return { structured: res.data, text: `Nickname removed for course ${course_id}.` };
    },
  }),
];
