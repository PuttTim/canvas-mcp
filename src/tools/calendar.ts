import { z } from "zod";
import { calendar } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { date, dateRange, dryRunInput, id, requestTool, text } from "./request.ts";

const fields = [
  "id",
  "title",
  "description",
  "start_at",
  "end_at",
  "all_day",
  "all_day_date",
  "location_name",
  "location_address",
  "context_code",
  "effective_context_code",
  "html_url",
  "workflow_state",
  "parent_event_id",
  "appointment_group_id",
  "appointment_group_url",
  "reserve_url",
  "reserved",
  "child_events",
  "assignment",
  "important_dates",
];
const groupFields = [
  "id",
  "title",
  "description",
  "start_at",
  "end_at",
  "location_name",
  "context_codes",
  "appointments",
  "reserved_times",
  "participant_count",
  "participants_per_appointment",
  "max_appointments_per_participant",
  "html_url",
  "url",
];
const event = { event_id: id };
const details = {
  title: text.optional(),
  description: z.string().optional(),
  start_at: date.optional(),
  end_at: date.optional(),
  all_day: z.boolean().optional(),
  location_name: z.string().optional(),
  location_address: z.string().optional(),
};
export const calendarTools = [
  requestTool({
    name: "canvas_calendar_events_list",
    toolset: "calendar",
    description:
      "List calendar events or assignments in a date range. Include course_<id> context_codes for course events; otherwise Canvas defaults to your personal calendar. Maximum 10 contexts.",
    input: z.object({
      type: z.enum(["event", "assignment", "sub_assignment"]).default("event"),
      ...dateRange,
      context_codes: z
        .array(z.string().regex(/^(course|group|user)_\d+$/))
        .min(1)
        .max(10)
        .optional(),
      undated: z.boolean().optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: calendar.list,
    list: true,
    fields,
    query: (a) => ({
      type: a.type,
      start_date: a.start_date,
      end_date: a.end_date,
      context_codes: a.context_codes,
      undated: a.undated,
    }),
  }),
  requestTool({
    name: "canvas_calendar_event_get",
    toolset: "calendar",
    description: "Read a calendar event or appointment slot.",
    input: z.object({ ...event, verbose: verboseInput }),
    operation: calendar.get,
    fields,
  }),
  requestTool({
    name: "canvas_calendar_appointment_groups_list",
    toolset: "calendar",
    description:
      "List appointment groups you can reserve, including slots and your reserved times.",
    input: z.object({ ...paginationInput, verbose: verboseInput }),
    operation: calendar.groups,
    list: true,
    fields: groupFields,
    query: () => ({ scope: "reservable", include: ["appointments", "reserved_times"] }),
  }),
  requestTool({
    name: "canvas_calendar_appointment_group_get",
    toolset: "calendar",
    description: "Read an appointment group's slots and reservation limits.",
    input: z.object({ appointment_group_id: id, verbose: verboseInput }),
    operation: calendar.group,
    fields: groupFields,
    query: () => ({ include: ["appointments", "child_events"] }),
  }),
  requestTool({
    name: "canvas_calendar_reservations_mine",
    toolset: "calendar",
    description:
      "List appointment groups with your reserved_times. Groups without a current reservation are filtered after pagination; follow next_page_url even on an empty page.",
    input: z.object({
      include_past_appointments: z.boolean().default(false),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: calendar.groups,
    list: true,
    fields: ["id", "title", "reserved_times", "html_url"],
    query: (a) => ({
      scope: "reservable",
      include: ["reserved_times"],
      include_past_appointments: a.include_past_appointments,
    }),
    filter: (value) => {
      const times = (value as Record<string, unknown>).reserved_times;
      return Array.isArray(times) && times.length > 0;
    },
  }),
  requestTool({
    name: "canvas_calendar_event_create",
    toolset: "calendar",
    kind: "write",
    description:
      "Create an event on your personal calendar. context_code must be user_<your Canvas user id> from canvas_me.",
    input: z.object({
      context_code: z.string().regex(/^user_\d+$/),
      ...details,
      title: text,
      dry_run: dryRunInput,
    }),
    operation: calendar.create,
    fields,
    body: (a, ctx) => {
      if (ctx.identity?.userId !== undefined && a.context_code !== `user_${ctx.identity.userId}`)
        throw new Error("Use your own personal calendar context_code.");
      const { dry_run: _dryRun, ...calendar_event } = a;
      return { calendar_event };
    },
  }),
  requestTool({
    name: "canvas_calendar_event_update",
    toolset: "calendar",
    kind: "write",
    idempotent: true,
    description: "Update a calendar event you own. Canvas enforces editing permissions.",
    input: z
      .object({ ...event, ...details, dry_run: dryRunInput })
      .refine(
        (a) => Object.keys(details).some((k) => a[k as keyof typeof a] !== undefined),
        "Provide an event field to change.",
      ),
    operation: calendar.update,
    fields,
    body: (a) => {
      const { event_id: _id, dry_run: _dryRun, ...calendar_event } = a;
      return { calendar_event };
    },
  }),
  requestTool({
    name: "canvas_calendar_reserve_slot",
    toolset: "calendar",
    kind: "write",
    description:
      "Reserve an available appointment slot for yourself. Existing reservations are never automatically cancelled.",
    input: z.object({ ...event, comments: z.string().optional(), dry_run: dryRunInput }),
    operation: calendar.reserve,
    fields,
    body: (a) => ({ comments: a.comments, cancel_existing: false }),
  }),
  ...(["event_delete", "reservation_cancel"] as const).map((verb) =>
    requestTool({
      name: `canvas_calendar_${verb}`,
      toolset: "calendar",
      kind: "irreversible",
      idempotent: true,
      description:
        verb === "reservation_cancel"
          ? "Cancel your reservation using the child reservation event ID from reserved_times, not the parent appointment slot ID."
          : "Delete a calendar event you own.",
      input: z.object({ ...event, cancel_reason: z.string().optional(), dry_run: dryRunInput }),
      operation: calendar.delete,
      query: (a) => ({ cancel_reason: a.cancel_reason }),
    }),
  ),
];
