import { announcementTools } from "./announcements.ts";
import { assignmentTools } from "./assignments.ts";
import { calendarTools } from "./calendar.ts";
import { conversationTools } from "./conversations.ts";
import { courseTools } from "./courses.ts";
import { discussionTools } from "./discussions.ts";
import { fileTools } from "./files.ts";
import { gradeTools } from "./grades.ts";
import { meTools } from "./me.ts";
import { moduleTools } from "./modules.ts";
import { pageTools } from "./pages.ts";
import { plannerTools } from "./planner.ts";
import type { ToolDef } from "./registry.ts";
import { submissionTools } from "./submissions.ts";

/** Every tool the server knows about, in registration order. Filtering happens in registerTools. */
export const allTools: readonly ToolDef[] = [
  ...meTools,
  ...courseTools,
  ...assignmentTools,
  ...submissionTools,
  ...gradeTools,
  ...moduleTools,
  ...pageTools,
  ...announcementTools,
  ...discussionTools,
  ...fileTools,
  ...calendarTools,
  ...plannerTools,
  ...conversationTools,
];
