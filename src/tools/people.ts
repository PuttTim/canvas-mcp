import { z } from "zod";
import { people } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { id, requestTool } from "./request.ts";

const userFields = [
  "id",
  "name",
  "short_name",
  "sortable_name",
  "avatar_url",
  "pronouns",
  "bio",
  "primary_email",
  "locale",
  "time_zone",
  "enrollments",
];

export const peopleTools = [
  requestTool({
    name: "canvas_people_user_get",
    toolset: "people",
    description:
      "Read the limited profile fields Canvas makes visible for a user. Canvas applies course and institution privacy rules.",
    input: z.object({ user_id: id, verbose: verboseInput }),
    operation: people.user,
    fields: userFields,
  }),
  requestTool({
    name: "canvas_people_search_course_users",
    toolset: "people",
    description:
      "Search users visible to you in a course. Results and fields depend on your Canvas permissions.",
    input: z.object({
      course_id: id,
      search_term: z.string().min(1).optional(),
      enrollment_type: z.enum(["student", "teacher", "ta", "observer", "designer"]).optional(),
      enrollment_state: z
        .enum(["active", "invited", "rejected", "completed", "inactive"])
        .optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: people.search,
    list: true,
    fields: userFields,
    query: (a) => ({
      search_term: a.search_term,
      enrollment_type: a.enrollment_type,
      enrollment_state: a.enrollment_state,
      include: ["enrollments"],
    }),
  }),
  requestTool({
    name: "canvas_people_sections_list",
    toolset: "people",
    description: "List course sections visible to you.",
    input: z.object({
      course_id: id,
      search_term: z.string().min(1).optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: people.sections,
    list: true,
    fields: [
      "id",
      "name",
      "sis_section_id",
      "course_id",
      "start_at",
      "end_at",
      "restrict_enrollments_to_section_dates",
      "nonxlist_course_id",
    ],
    query: (a) => ({ search_term: a.search_term }),
  }),
  requestTool({
    name: "canvas_people_enrollments_mine",
    toolset: "people",
    description: "List your own Canvas enrollments, optionally filtered by course, role or state.",
    input: z.object({
      course_id: id.optional(),
      type: z
        .array(
          z.enum([
            "StudentEnrollment",
            "TeacherEnrollment",
            "TaEnrollment",
            "DesignerEnrollment",
            "ObserverEnrollment",
          ]),
        )
        .optional(),
      state: z
        .array(
          z.enum([
            "active",
            "invited",
            "creation_pending",
            "deleted",
            "rejected",
            "completed",
            "inactive",
          ]),
        )
        .optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: people.enrollments,
    list: true,
    fields: [
      "id",
      "course_id",
      "course_section_id",
      "enrollment_state",
      "type",
      "role",
      "role_id",
      "user_id",
      "grades",
      "html_url",
      "last_activity_at",
      "total_activity_time",
    ],
    query: (a) => ({ course_id: a.course_id, type: a.type, state: a.state }),
  }),
];
