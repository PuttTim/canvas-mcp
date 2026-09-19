import { endpoint } from "./operations.ts";

export const assignments = {
  list: endpoint("GET", "/api/v1/courses/{course_id}/assignments"),
  get: endpoint("GET", "/api/v1/courses/{course_id}/assignments/{assignment_id}"),
  groups: endpoint("GET", "/api/v1/courses/{course_id}/assignment_groups"),
  peerReviews: endpoint(
    "GET",
    "/api/v1/courses/{course_id}/assignments/{assignment_id}/peer_reviews",
  ),
};
export const submissions = {
  get: endpoint("GET", "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self"),
  list: endpoint("GET", "/api/v1/courses/{course_id}/students/submissions"),
  submit: endpoint("POST", "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions"),
  comment: endpoint(
    "PUT",
    "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self",
  ),
  upload: endpoint(
    "POST",
    "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self/files",
  ),
  read: endpoint(
    "PUT",
    "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self/read",
  ),
  unread: endpoint(
    "DELETE",
    "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self/read",
  ),
};
export const grades = {
  enrollments: endpoint("GET", "/api/v1/courses/{course_id}/enrollments"),
  periods: endpoint("GET", "/api/v1/courses/{course_id}/grading_periods"),
  whatIf: endpoint("PUT", "/api/v1/submissions/{submission_id}/what_if_grades"),
  reset: endpoint("PUT", "/api/v1/courses/{course_id}/what_if_grades/reset"),
};
export const modules = {
  list: endpoint("GET", "/api/v1/courses/{course_id}/modules"),
  get: endpoint("GET", "/api/v1/courses/{course_id}/modules/{module_id}"),
  items: endpoint("GET", "/api/v1/courses/{course_id}/modules/{module_id}/items"),
  item: endpoint("GET", "/api/v1/courses/{course_id}/modules/{module_id}/items/{item_id}"),
  sequence: endpoint("GET", "/api/v1/courses/{course_id}/module_item_sequence"),
  progress: endpoint("GET", "/api/v1/courses/{course_id}/users/self/progress"),
  done: endpoint("PUT", "/api/v1/courses/{course_id}/modules/{module_id}/items/{item_id}/done"),
  notDone: endpoint(
    "DELETE",
    "/api/v1/courses/{course_id}/modules/{module_id}/items/{item_id}/done",
  ),
  read: endpoint(
    "POST",
    "/api/v1/courses/{course_id}/modules/{module_id}/items/{item_id}/mark_read",
  ),
  mastery: endpoint(
    "POST",
    "/api/v1/courses/{course_id}/modules/{module_id}/items/{item_id}/select_mastery_path",
  ),
};
export const pages = {
  list: endpoint("GET", "/api/v1/courses/{course_id}/pages"),
  get: endpoint("GET", "/api/v1/courses/{course_id}/pages/{page_url_or_id}"),
  revisions: endpoint("GET", "/api/v1/courses/{course_id}/pages/{page_url_or_id}/revisions"),
  revision: endpoint(
    "GET",
    "/api/v1/courses/{course_id}/pages/{page_url_or_id}/revisions/{revision_id}",
  ),
  create: endpoint("POST", "/api/v1/courses/{course_id}/pages"),
  update: endpoint("PUT", "/api/v1/courses/{course_id}/pages/{page_url_or_id}"),
};
export const discussions = {
  announcements: endpoint("GET", "/api/v1/announcements"),
  list: endpoint("GET", "/api/v1/courses/{course_id}/discussion_topics"),
  get: endpoint("GET", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}"),
  view: endpoint("GET", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/view"),
  entries: endpoint("GET", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries"),
  replies: endpoint(
    "GET",
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries/{entry_id}/replies",
  ),
  post: endpoint("POST", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries"),
  reply: endpoint(
    "POST",
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries/{entry_id}/replies",
  ),
  update: endpoint(
    "PUT",
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries/{entry_id}",
  ),
  delete: endpoint(
    "DELETE",
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries/{entry_id}",
  ),
  read: endpoint("PUT", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/read"),
  readAll: endpoint("PUT", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/read_all"),
  subscribe: endpoint("PUT", "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/subscribed"),
  unsubscribe: endpoint(
    "DELETE",
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/subscribed",
  ),
  rate: endpoint(
    "POST",
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries/{entry_id}/rating",
  ),
};
export const files = {
  userFiles: endpoint("GET", "/api/v1/users/self/files"),
  courseFiles: endpoint("GET", "/api/v1/courses/{course_id}/files"),
  folderFiles: endpoint("GET", "/api/v1/folders/{folder_id}/files"),
  userFolders: endpoint("GET", "/api/v1/users/self/folders"),
  courseFolders: endpoint("GET", "/api/v1/courses/{course_id}/folders"),
  folder: endpoint("GET", "/api/v1/folders/{folder_id}"),
  file: endpoint("GET", "/api/v1/files/{file_id}"),
  quota: endpoint("GET", "/api/v1/users/self/files/quota"),
  upload: endpoint("POST", "/api/v1/users/self/files"),
  createFolder: endpoint("POST", "/api/v1/users/self/folders"),
  update: endpoint("PUT", "/api/v1/files/{file_id}"),
  copy: endpoint("POST", "/api/v1/folders/{folder_id}/copy_file"),
  delete: endpoint("DELETE", "/api/v1/files/{file_id}"),
  deleteFolder: endpoint("DELETE", "/api/v1/folders/{folder_id}"),
};
export const calendar = {
  list: endpoint("GET", "/api/v1/calendar_events"),
  get: endpoint("GET", "/api/v1/calendar_events/{event_id}"),
  groups: endpoint("GET", "/api/v1/appointment_groups"),
  group: endpoint("GET", "/api/v1/appointment_groups/{appointment_group_id}"),
  create: endpoint("POST", "/api/v1/calendar_events"),
  update: endpoint("PUT", "/api/v1/calendar_events/{event_id}"),
  reserve: endpoint("POST", "/api/v1/calendar_events/{event_id}/reservations"),
  delete: endpoint("DELETE", "/api/v1/calendar_events/{event_id}"),
};
export const planner = {
  items: endpoint("GET", "/api/v1/planner/items"),
  notes: endpoint("GET", "/api/v1/planner_notes"),
  note: endpoint("GET", "/api/v1/planner_notes/{note_id}"),
  overrides: endpoint("GET", "/api/v1/planner/overrides"),
  create: endpoint("POST", "/api/v1/planner_notes"),
  update: endpoint("PUT", "/api/v1/planner_notes/{note_id}"),
  overrideCreate: endpoint("POST", "/api/v1/planner/overrides"),
  overrideUpdate: endpoint("PUT", "/api/v1/planner/overrides/{override_id}"),
  delete: endpoint("DELETE", "/api/v1/planner_notes/{note_id}"),
};
export const conversations = {
  list: endpoint("GET", "/api/v1/conversations"),
  get: endpoint("GET", "/api/v1/conversations/{conversation_id}"),
  unread: endpoint("GET", "/api/v1/conversations/unread_count"),
  recipients: endpoint("GET", "/api/v1/search/recipients"),
  create: endpoint("POST", "/api/v1/conversations"),
  reply: endpoint("POST", "/api/v1/conversations/{conversation_id}/add_message"),
  update: endpoint("PUT", "/api/v1/conversations/{conversation_id}"),
  delete: endpoint("DELETE", "/api/v1/conversations/{conversation_id}"),
  deleteMessage: endpoint("POST", "/api/v1/conversations/{conversation_id}/remove_messages"),
};

export const studentOperations = Object.values({
  assignments,
  submissions,
  grades,
  modules,
  pages,
  discussions,
  files,
  calendar,
  planner,
  conversations,
}).flatMap(Object.values);
