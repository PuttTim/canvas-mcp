/** Hand-built Canvas fixtures; no student data or live account writes. */
export interface ToolFixture {
  name: string;
  args: Record<string, unknown>;
  method: string;
  path: string;
  response: unknown;
  query?: Record<string, string | string[]>;
  body?: unknown;
  expected?: unknown;
}

const assignment = {
  id: 2,
  course_id: 1,
  name: "Essay",
  due_at: "2026-09-25T15:59:00Z",
  description: "<p>Explain <strong>recursion</strong>.</p>",
  submission_types: ["online_text_entry"],
  points_possible: 10,
};
const submission = {
  id: 9,
  assignment_id: 2,
  user_id: 42,
  workflow_state: "submitted",
  body: "<p>My answer</p>",
  student_entered_score: 8,
  score: 7,
  submission_comments: [{ id: 5, comment: "Good", author_id: 4 }],
};
const module = {
  id: 3,
  name: "Week 1",
  state: "started",
  items_count: 1,
  items: [
    {
      id: 4,
      type: "Page",
      title: "Intro",
      completion_requirement: { type: "must_mark_done", completed: false },
    },
  ],
};
const page = {
  page_id: 4,
  url: "intro",
  title: "Intro",
  body: "<p>Read <em>this</em>.</p>",
  revision_id: 1,
};
const topic = {
  id: 5,
  title: "Welcome",
  message: "<p>Hello</p>",
  subscribed: true,
  read_state: "unread",
};
const entry = { id: 6, user_id: 42, message: "<p>A reply</p>", created_at: "2026-09-19T01:00:00Z" };
const file = {
  id: 7,
  display_name: "notes.txt",
  size: 5,
  url: "https://school.instructure.com/files/7/download",
  "content-type": "text/plain",
};
const folder = { id: 8, name: "Notes", files_count: 1, folders_count: 0 };
const event = {
  id: 10,
  title: "Study",
  context_code: "user_42",
  start_at: "2026-09-20T01:00:00Z",
  end_at: "2026-09-20T02:00:00Z",
};
const group = {
  id: 11,
  title: "Office hours",
  reserved_times: [{ id: 12, start_at: "2026-09-20T01:00:00Z" }],
};
const note = { id: 13, title: "Read", todo_date: "2026-09-20T00:00:00Z", details: "Chapter 1" };
const override = { id: 14, plannable_type: "assignment", plannable_id: 2, marked_complete: true };
const conversation = {
  id: 15,
  subject: "Question",
  workflow_state: "unread",
  participants: [{ id: 42, name: "Ada" }],
  messages: [{ id: 16, body: "Hello", author_id: 4 }],
};
const c = { course_id: 1 };
const a = { ...c, assignment_id: 2 };
const m = { ...c, module_id: 3 };
const item = { ...m, item_id: 4 };
const p = { ...c, page_url_or_id: "intro" };
const t = { ...c, topic_id: 5 };
const e = { ...t, entry_id: 6 };
const cv = { conversation_id: 15 };

function fixture(
  name: string,
  args: Record<string, unknown>,
  method: string,
  path: string,
  response: unknown,
  options: Pick<ToolFixture, "query" | "body" | "expected"> = {},
): ToolFixture {
  return { name: `canvas_${name}`, args, method, path: `/api/v1${path}`, response, ...options };
}
const read = (
  name: string,
  args: Record<string, unknown>,
  path: string,
  response: unknown,
  options: Pick<ToolFixture, "query" | "expected"> = {},
) => fixture(name, args, "GET", path, response, options);
const write = (
  name: string,
  args: Record<string, unknown>,
  method: string,
  path: string,
  response: unknown,
  body?: unknown,
) => fixture(name, args, method, path, response, body === undefined ? {} : { body });

export const studentFixtures: ToolFixture[] = [
  read("assignments_list", { ...c, bucket: "upcoming" }, "/courses/1/assignments", [assignment], {
    query: {
      bucket: "upcoming",
      "include[]": ["submission"],
      override_assignment_dates: "true",
      per_page: "25",
    },
    expected: { items: [{ id: 2, description_markdown: "Explain **recursion**." }] },
  }),
  read("assignments_get", a, "/courses/1/assignments/2", assignment, {
    expected: { id: 2, description_markdown: "Explain **recursion**." },
  }),
  read(
    "assignments_groups_list",
    c,
    "/courses/1/assignment_groups",
    [{ id: 1, name: "Essays", group_weight: 50, assignments: [assignment] }],
    { query: { scope_assignments_to_student: "true" } },
  ),
  read("assignments_overrides_for_me", a, "/courses/1/assignments/2", assignment, {
    query: { override_assignment_dates: "true" },
    expected: { id: 2, due_at: assignment.due_at },
  }),
  read("assignments_peer_reviews_list", a, "/courses/1/assignments/2/peer_reviews", [
    { id: 4, assessor_id: 42, workflow_state: "assigned" },
  ]),
  read("submissions_get_mine", a, "/courses/1/assignments/2/submissions/self", submission, {
    expected: { body_markdown: "My answer", user_id: 42 },
  }),
  read(
    "submissions_list_mine",
    { ...c, assignment_ids: [2] },
    "/courses/1/students/submissions",
    [submission],
    { query: { "student_ids[]": ["self"], "assignment_ids[]": ["2"] } },
  ),
  read("submissions_comments_list", a, "/courses/1/assignments/2/submissions/self", submission, {
    expected: { items: [{ comment: "Good" }] },
  }),
  read("submissions_submission_summary_mine", c, "/courses/1/students/submissions", [submission], {
    query: { "student_ids[]": ["self"] },
    expected: { counts: { submitted: 1 }, complete: true },
  }),
  write(
    "submissions_submit",
    {
      ...a,
      submission: { submission_type: "online_text_entry", body: "<p>My answer</p>" },
      confirmed: true,
    },
    "POST",
    "/courses/1/assignments/2/submissions",
    submission,
    { submission: { submission_type: "online_text_entry", body: "<p>My answer</p>" } },
  ),
  write(
    "submissions_comment_add",
    { ...a, comment: "Thanks" },
    "PUT",
    "/courses/1/assignments/2/submissions/self",
    submission,
    { comment: { text_comment: "Thanks", group_comment: false } },
  ),
  write("submissions_mark_read", a, "PUT", "/courses/1/assignments/2/submissions/self/read", {}),
  write(
    "submissions_mark_unread",
    a,
    "DELETE",
    "/courses/1/assignments/2/submissions/self/read",
    {},
  ),
  read(
    "grades_course_grades",
    c,
    "/courses/1/enrollments",
    [{ id: 1, user_id: 42, grades: { current_score: 80 } }],
    { query: { user_id: "self", "type[]": ["StudentEnrollment"] } },
  ),
  read("grades_assignment_scores", c, "/courses/1/students/submissions", [submission], {
    query: { "student_ids[]": ["self"] },
  }),
  read("grades_what_if_list", c, "/courses/1/students/submissions", [submission], {
    expected: { items: [{ student_entered_score: 8, score: 7 }] },
  }),
  read(
    "grades_grading_periods_list",
    c,
    "/courses/1/grading_periods",
    { grading_periods: [{ id: 1, title: "Term 1" }] },
    { expected: { items: [{ id: 1, title: "Term 1" }] } },
  ),
  write(
    "grades_what_if_set",
    { submission_id: 9, student_entered_score: 9 },
    "PUT",
    "/submissions/9/what_if_grades",
    { grades: { current: 90 }, submission },
    { student_entered_score: 9 },
  ),
  write("grades_what_if_reset", c, "PUT", "/courses/1/what_if_grades/reset", {
    grades: { current: 80 },
  }),
  read("modules_list", c, "/courses/1/modules", [module], {
    query: { "include[]": ["items", "content_details"] },
  }),
  read("modules_get", m, "/courses/1/modules/3", module),
  read("modules_items_list", m, "/courses/1/modules/3/items", module.items),
  read("modules_item_get", item, "/courses/1/modules/3/items/4", module.items[0]),
  read(
    "modules_item_sequence",
    { ...c, asset_type: "ModuleItem", asset_id: 4 },
    "/courses/1/module_item_sequence",
    { items: [{ current: module.items[0] }], modules: [module] },
    { query: { asset_type: "ModuleItem", asset_id: "4" } },
  ),
  read("modules_progress", c, "/courses/1/users/self/progress", {
    requirement_count: 3,
    requirement_completed_count: 1,
  }),
  write(
    "modules_item_mark_done",
    item,
    "PUT",
    "/courses/1/modules/3/items/4/done",
    module.items[0],
  ),
  write("modules_item_mark_read", item, "POST", "/courses/1/modules/3/items/4/mark_read", {}),
  write(
    "modules_item_mark_not_done",
    item,
    "DELETE",
    "/courses/1/modules/3/items/4/done",
    module.items[0],
  ),
  write(
    "modules_select_mastery_path",
    { ...item, assignment_set_id: 20 },
    "POST",
    "/courses/1/modules/3/items/4/select_mastery_path",
    {},
    { assignment_set_id: 20 },
  ),
  read("pages_list", c, "/courses/1/pages", [page]),
  read("pages_get", p, "/courses/1/pages/intro", page, {
    expected: { body_markdown: "Read _this_." },
  }),
  read("pages_revisions_list", p, "/courses/1/pages/intro/revisions", [page]),
  read("pages_revision_get", { ...p, revision_id: 1 }, "/courses/1/pages/intro/revisions/1", page, {
    query: { summary: "false" },
  }),
  write(
    "pages_create",
    { ...c, title: "Intro", body: "<p>Read this</p>" },
    "POST",
    "/courses/1/pages",
    page,
    { wiki_page: { title: "Intro", body: "<p>Read this</p>" } },
  ),
  write("pages_update", { ...p, body: "New" }, "PUT", "/courses/1/pages/intro", page, {
    wiki_page: { body: "New" },
  }),
  read(
    "announcements_list",
    { course_ids: [1, 2], start_date: "2026-09-19", end_date: "2026-09-26" },
    "/announcements",
    [topic],
    {
      query: {
        "context_codes[]": ["course_1", "course_2"],
        start_date: "2026-09-19",
        end_date: "2026-09-26",
      },
    },
  ),
  read("announcements_get", t, "/courses/1/discussion_topics/5", topic),
  write("announcements_mark_read", t, "PUT", "/courses/1/discussion_topics/5/read", {}),
  read("discussions_list", c, "/courses/1/discussion_topics", [topic]),
  read(
    "discussions_subscribed_list",
    c,
    "/courses/1/discussion_topics",
    [topic, { id: 8, subscribed: false }],
    { expected: { count: 1, items: [{ id: 5 }] } },
  ),
  read("discussions_get", t, "/courses/1/discussion_topics/5", topic, {
    expected: { message_markdown: "Hello" },
  }),
  read(
    "discussions_view",
    t,
    "/courses/1/discussion_topics/5/view",
    { participants: [{ id: 42 }], view: [entry], unread_entries: [6] },
    { expected: { view: [{ message_markdown: "A reply" }] } },
  ),
  read("discussions_entries_list", t, "/courses/1/discussion_topics/5/entries", [entry]),
  read("discussions_entry_replies_list", e, "/courses/1/discussion_topics/5/entries/6/replies", [
    entry,
  ]),
  write(
    "discussions_entry_post",
    { ...t, message: "Hello" },
    "POST",
    "/courses/1/discussion_topics/5/entries",
    entry,
    { message: "Hello" },
  ),
  write(
    "discussions_entry_reply",
    { ...e, message: "Reply" },
    "POST",
    "/courses/1/discussion_topics/5/entries/6/replies",
    entry,
    { message: "Reply" },
  ),
  write(
    "discussions_entry_update",
    { ...e, message: "Edit" },
    "PUT",
    "/courses/1/discussion_topics/5/entries/6",
    entry,
    { message: "Edit" },
  ),
  write("discussions_entry_delete", e, "DELETE", "/courses/1/discussion_topics/5/entries/6", {}),
  write("discussions_mark_read", t, "PUT", "/courses/1/discussion_topics/5/read", {}),
  write("discussions_mark_all_read", t, "PUT", "/courses/1/discussion_topics/5/read_all", {}),
  write("discussions_subscribe", t, "PUT", "/courses/1/discussion_topics/5/subscribed", {}),
  write("discussions_unsubscribe", t, "DELETE", "/courses/1/discussion_topics/5/subscribed", {}),
  write(
    "discussions_rate_entry",
    { ...e, rating: 1 },
    "POST",
    "/courses/1/discussion_topics/5/entries/6/rating",
    {},
    { rating: 1 },
  ),
  read("files_folders_list", {}, "/users/self/folders", [folder]),
  read("files_folder_get", { folder_id: 8 }, "/folders/8", folder),
  read("files_files_list", {}, "/users/self/files", [file]),
  read("files_file_get", { file_id: 7 }, "/files/7", file),
  read("files_download_url", { file_id: 7 }, "/files/7", file, { expected: { url: file.url } }),
  read("files_quota", {}, "/users/self/files/quota", { quota: 1000000, quota_used: 500 }),
  write(
    "files_folder_create",
    { name: "Notes", parent_folder_id: 8 },
    "POST",
    "/users/self/folders",
    folder,
    { name: "Notes", parent_folder_id: 8 },
  ),
  write("files_file_update", { file_id: 7, name: "renamed.txt" }, "PUT", "/files/7", file, {
    name: "renamed.txt",
    on_duplicate: "rename",
  }),
  write(
    "files_file_copy",
    { folder_id: 8, source_file_id: 7 },
    "POST",
    "/folders/8/copy_file",
    file,
    { source_file_id: 7, on_duplicate: "rename" },
  ),
  write("files_file_delete", { file_id: 7 }, "DELETE", "/files/7", {}),
  fixture(
    "files_folder_delete",
    { folder_id: 8 },
    "DELETE",
    "/folders/8",
    {},
    { query: { force: "false" } },
  ),
  read(
    "calendar_events_list",
    {
      type: "assignment",
      context_codes: ["course_1"],
      start_date: "2026-09-19",
      end_date: "2026-09-26",
    },
    "/calendar_events",
    [event],
    { query: { type: "assignment", "context_codes[]": ["course_1"], start_date: "2026-09-19" } },
  ),
  read("calendar_event_get", { event_id: 10 }, "/calendar_events/10", event),
  read("calendar_appointment_groups_list", {}, "/appointment_groups", [group], {
    query: { scope: "reservable", "include[]": ["appointments", "reserved_times"] },
  }),
  read(
    "calendar_appointment_group_get",
    { appointment_group_id: 11 },
    "/appointment_groups/11",
    group,
  ),
  read(
    "calendar_reservations_mine",
    {},
    "/appointment_groups",
    [group, { id: 99, reserved_times: [] }],
    { expected: { count: 1, items: [{ reserved_times: [{ id: 12 }] }] } },
  ),
  write(
    "calendar_event_create",
    { context_code: "user_42", title: "Study" },
    "POST",
    "/calendar_events",
    event,
    { calendar_event: { context_code: "user_42", title: "Study" } },
  ),
  write(
    "calendar_event_update",
    { event_id: 10, title: "Study later" },
    "PUT",
    "/calendar_events/10",
    event,
    { calendar_event: { title: "Study later" } },
  ),
  write(
    "calendar_reserve_slot",
    { event_id: 10, comments: "Thanks" },
    "POST",
    "/calendar_events/10/reservations",
    event,
    { comments: "Thanks", cancel_existing: false },
  ),
  write("calendar_event_delete", { event_id: 10 }, "DELETE", "/calendar_events/10", {}),
  write("calendar_reservation_cancel", { event_id: 12 }, "DELETE", "/calendar_events/12", {}),
  read(
    "planner_items_list",
    { start_date: "2026-09-19", end_date: "2026-09-26" },
    "/planner/items",
    [
      {
        course_id: 1,
        plannable_type: "assignment",
        plannable: assignment,
        plannable_date: assignment.due_at,
        html_url: "/courses/1/assignments/2",
      },
    ],
    { query: { start_date: "2026-09-19", end_date: "2026-09-26" } },
  ),
  read("planner_notes_list", {}, "/planner_notes", [note]),
  read("planner_note_get", { note_id: 13 }, "/planner_notes/13", note),
  read("planner_overrides_list", {}, "/planner/overrides", [override]),
  write(
    "planner_note_create",
    { title: "Read", todo_date: "2026-09-20", details: "Chapter 1" },
    "POST",
    "/planner_notes",
    note,
    { title: "Read", todo_date: "2026-09-20", details: "Chapter 1" },
  ),
  write(
    "planner_note_update",
    { note_id: 13, title: "Re-read", course_id: null },
    "PUT",
    "/planner_notes/13",
    note,
    { title: "Re-read", course_id: null },
  ),
  write(
    "planner_override_set",
    { plannable_type: "assignment", plannable_id: 2, marked_complete: true },
    "POST",
    "/planner/overrides",
    override,
    { plannable_type: "assignment", plannable_id: 2, marked_complete: true },
  ),
  write("planner_note_delete", { note_id: 13 }, "DELETE", "/planner_notes/13", {}),
  read("conversations_list", { scope: "unread" }, "/conversations", [conversation], {
    query: { scope: "unread" },
  }),
  read("conversations_get", cv, "/conversations/15", conversation, {
    query: { auto_mark_as_read: "false" },
    expected: { messages: [{ body_markdown: "Hello" }] },
  }),
  read("conversations_unread_count", {}, "/conversations/unread_count", { unread_count: "1" }),
  read(
    "conversations_find_recipients",
    { search: "Ada", context: "course_1" },
    "/search/recipients",
    [{ id: 42, name: "Ada" }],
    { query: { search: "Ada", context: "course_1", type: "user" } },
  ),
  write(
    "conversations_create",
    { recipients: [4], subject: "Question", body: "Hi" },
    "POST",
    "/conversations",
    [conversation],
    { recipients: [4], subject: "Question", body: "Hi", group_conversation: false },
  ),
  write(
    "conversations_reply",
    { ...cv, body: "Thanks" },
    "POST",
    "/conversations/15/add_message",
    conversation,
    { body: "Thanks" },
  ),
  ...(
    [
      ["mark_read", { workflow_state: "read" }],
      ["mark_unread", { workflow_state: "unread" }],
      ["star", { starred: true }],
      ["unstar", { starred: false }],
      ["archive", { workflow_state: "archived" }],
      ["unarchive", { workflow_state: "read" }],
    ] as const
  ).map(([verb, state]) =>
    write(`conversations_${verb}`, cv, "PUT", "/conversations/15", conversation, {
      conversation: state,
    }),
  ),
  write("conversations_delete", cv, "DELETE", "/conversations/15", {}),
  write(
    "conversations_delete_message",
    { ...cv, message_ids: [16] },
    "POST",
    "/conversations/15/remove_messages",
    conversation,
    { remove: [16] },
  ),
];

export const uploadFixtures = [
  {
    name: "canvas_files_upload",
    args: { name: "hello.txt", content_type: "text/plain", content_base64: "aGVsbG8=" },
    path: "/api/v1/users/self/files",
  },
  {
    name: "canvas_submissions_upload_file",
    args: { ...a, name: "hello.txt", content_type: "text/plain", content_base64: "aGVsbG8=" },
    path: "/api/v1/courses/1/assignments/2/submissions/self/files",
  },
];
