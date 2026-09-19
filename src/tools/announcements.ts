import { z } from "zod";
import { discussions } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { discussionFields } from "./discussions.ts";
import { dateRange, dryRunInput, id, requestTool, topic } from "./request.ts";

export const announcementTools = [
  requestTool({
    name: "canvas_announcements_list",
    toolset: "announcements",
    description:
      "Read announcements across selected courses. Supply start_date/end_date to control the date window; Canvas defaults to recent announcements.",
    input: z.object({
      course_ids: z.array(id).min(1).max(100),
      ...dateRange,
      active_only: z.boolean().default(true),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: discussions.announcements,
    list: true,
    fields: [...discussionFields, "context_code"],
    query: (a) => ({
      context_codes: a.course_ids.map((n) => `course_${n}`),
      start_date: a.start_date,
      end_date: a.end_date,
      active_only: a.active_only,
    }),
  }),
  requestTool({
    name: "canvas_announcements_get",
    toolset: "announcements",
    description: "Read an announcement by its discussion topic ID.",
    input: z.object({ ...topic, verbose: verboseInput }),
    operation: discussions.get,
    fields: discussionFields,
  }),
  requestTool({
    name: "canvas_announcements_mark_read",
    toolset: "announcements",
    kind: "write",
    idempotent: true,
    description: "Mark an announcement as read on your account.",
    input: z.object({ ...topic, dry_run: dryRunInput }),
    operation: discussions.read,
  }),
];
