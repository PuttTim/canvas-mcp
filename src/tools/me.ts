import { z } from "zod";
import { users } from "../canvas/services/users.ts";
import { listResult, paginateOpts, paginationInput, verboseInput } from "./common.ts";
import { defineTool } from "./registry.ts";

const userSummary = (u: Record<string, unknown>) => ({
  id: u.id,
  name: u.name,
  short_name: u.short_name,
  sortable_name: u.sortable_name,
  login_id: u.login_id,
  email: u.email ?? u.primary_email,
  avatar_url: u.avatar_url,
  time_zone: u.time_zone,
  locale: u.locale,
  bio: u.bio,
});

export const meTools = [
  defineTool({
    name: "canvas_me",
    toolset: "me",
    kind: "read",
    title: "Who am I",
    description:
      "Return the profile of the Canvas user the connected token belongs to (id, name, email, time zone). Use this first to confirm the connection works and to learn the user's id.",
    input: z.object({ verbose: verboseInput }),
    handler: async ({ verbose }, ctx) => {
      const res = await users.profile(ctx.canvas);
      const p = res.data as Record<string, unknown>;
      const structured = verbose ? p : userSummary(p);
      return {
        structured,
        text: `Connected to ${ctx.canvas.baseUrl} as ${String(p.name)} (id ${String(p.id)}).`,
      };
    },
  }),

  defineTool({
    name: "canvas_me_todo",
    toolset: "me",
    kind: "read",
    title: "My to-do list",
    description:
      "List the user's Canvas to-do items: assignments that need submitting (and, for graders, things needing grading). Each item names the course and assignment with its due date.",
    input: z.object({
      include_ungraded_quizzes: z
        .boolean()
        .default(false)
        .describe("Also include ungraded quizzes."),
      ...paginationInput,
    }),
    handler: async (args, ctx) => {
      const page = await users.todo(
        ctx.canvas,
        args.include_ungraded_quizzes ? { include: ["ungraded_quizzes"] } : undefined,
        paginateOpts(args),
      );
      return listResult(
        page,
        (t) => {
          const a = (t.assignment ?? t.quiz ?? {}) as Record<string, unknown>;
          return {
            type: t.type,
            course_id: t.course_id,
            context_name: t.context_name,
            assignment_id: a.id,
            name: a.name ?? a.title,
            due_at: a.due_at,
            points_possible: a.points_possible,
            html_url: t.html_url,
            ignore_url: t.ignore,
          };
        },
        "to-do item",
      );
    },
  }),

  defineTool({
    name: "canvas_me_todo_count",
    toolset: "me",
    kind: "read",
    title: "My to-do counts",
    description:
      "Counts of to-do items: assignments needing submission and (for graders) submissions needing grading.",
    input: z.object({ include_ungraded_quizzes: z.boolean().default(false) }),
    handler: async ({ include_ungraded_quizzes }, ctx) => {
      const res = await users.todoCount(
        ctx.canvas,
        include_ungraded_quizzes ? { include: ["ungraded_quizzes"] } : undefined,
      );
      return {
        structured: res.data,
        text: `${res.data.assignments_needing_submitting} assignment(s) need submitting.`,
      };
    },
  }),

  defineTool({
    name: "canvas_me_upcoming_events",
    toolset: "me",
    kind: "read",
    title: "My upcoming events",
    description:
      "Upcoming assignments and calendar events for the user across all courses (roughly the next week or two), sorted by date. Good for 'what is due soon'.",
    input: z.object({}),
    handler: async (_args, ctx) => {
      const res = await users.upcomingEvents(ctx.canvas);
      const items = res.data.map((e) => {
        const a = (e.assignment ?? null) as Record<string, unknown> | null;
        return {
          id: e.id,
          type: e.type,
          title: e.title,
          start_at: e.start_at,
          end_at: e.end_at,
          all_day: e.all_day,
          context_code: e.context_code,
          context_name: e.context_name,
          assignment_id: a?.id,
          due_at: a?.due_at,
          points_possible: a?.points_possible,
          submitted:
            a && typeof a.submission === "object" && a.submission !== null ? true : undefined,
          html_url: e.html_url,
        };
      });
      return {
        structured: { items, count: items.length },
        text: `${items.length} upcoming event(s).`,
      };
    },
  }),

  defineTool({
    name: "canvas_me_missing_submissions",
    toolset: "me",
    kind: "read",
    title: "My missing submissions",
    description:
      "Assignments that are past due and have not been submitted by the user, across all courses. Optionally include planner overrides and course info.",
    input: z.object({
      course_ids: z.array(z.number().int()).optional().describe("Restrict to these course ids."),
      include_course: z.boolean().default(true),
      ...paginationInput,
    }),
    handler: async (args, ctx) => {
      const query: Record<string, unknown> = {};
      if (args.course_ids?.length) query.course_ids = args.course_ids;
      if (args.include_course) query.include = ["course"];
      const page = await users.missingSubmissions(ctx.canvas, query as never, paginateOpts(args));
      return listResult(
        page,
        (a) => {
          const course = (a.course ?? null) as Record<string, unknown> | null;
          return {
            id: a.id,
            name: a.name,
            course_id: a.course_id,
            course_name: course?.name,
            due_at: a.due_at,
            points_possible: a.points_possible,
            submission_types: a.submission_types,
            html_url: a.html_url,
          };
        },
        "missing submission",
      );
    },
  }),

  defineTool({
    name: "canvas_me_activity_stream",
    toolset: "me",
    kind: "read",
    title: "My activity stream",
    description:
      "Recent activity for the user: announcements, discussion posts, messages, grade changes, submission comments. Newest first. Use `only_active_courses` to skip concluded courses.",
    input: z.object({
      only_active_courses: z.boolean().default(true),
      ...paginationInput,
    }),
    handler: async (args, ctx) => {
      const page = await users.activityStream(
        ctx.canvas,
        { only_active_courses: args.only_active_courses },
        paginateOpts(args),
      );
      return listResult(
        page,
        (s) => ({
          id: s.id,
          type: s.type,
          title: s.title,
          message:
            typeof s.message === "string"
              ? s.message.replace(/<[^>]+>/g, "").slice(0, 300)
              : undefined,
          course_id: s.course_id,
          context_type: s.context_type,
          created_at: s.created_at,
          updated_at: s.updated_at,
          read_state: s.read_state,
          html_url: s.html_url,
          notification_category: s.notification_category,
          grade: s.grade,
          score: s.score,
        }),
        "activity item",
      );
    },
  }),

  defineTool({
    name: "canvas_me_activity_stream_summary",
    toolset: "me",
    kind: "read",
    title: "My activity summary",
    description:
      "Counts of activity stream items by type (Announcement, DiscussionTopic, Message, Submission, …) with unread counts.",
    input: z.object({}),
    handler: async (_args, ctx) => {
      const res = await users.activityStreamSummary(ctx.canvas);
      const unread = res.data.reduce((n, i) => n + (i.unread_count ?? 0), 0);
      return {
        structured: { items: res.data },
        text: `${unread} unread across ${res.data.length} activity type(s).`,
      };
    },
  }),

  defineTool({
    name: "canvas_me_activity_stream_hide",
    toolset: "me",
    kind: "write",
    idempotent: true,
    title: "Hide an activity stream item",
    description:
      "Hide one item from the user's activity stream (it stays in Canvas, just not in the stream).",
    input: z.object({ item_id: z.number().int().positive().describe("Activity stream item id.") }),
    handler: async ({ item_id }, ctx) => {
      const res = await users.hideStreamItem(ctx.canvas, item_id);
      return { structured: res.data, text: `Hidden activity item ${item_id}.` };
    },
  }),
];
