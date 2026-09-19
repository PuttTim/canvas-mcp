import { studentOperations } from "../src/canvas/services/student.ts";
import { type SpecEndpoint, specEndpoints } from "../src/canvas/spec.ts";

const STUDENT_V1_RESOURCES = new Set([
  "announcements",
  "assignments",
  "appointment_groups",
  "bookmarks",
  "calendar_events",
  "conversations",
  "courses",
  "discussion_topics",
  "enrollments",
  "files",
  "folders",
  "group_memberships",
  "groups",
  "modules",
  "outcome_results",
  "outcomes",
  "pages",
  "planner",
  "quiz_submission_questions",
  "quiz_submissions",
  "quizzes",
  "sections",
  "submissions",
  "users",
]);

function segments(path: string): string[] {
  return path.split("?")[0]?.split("/").filter(Boolean) ?? [];
}

function matches(specPath: string, usedPath: string): boolean {
  const expected = segments(specPath);
  const actual = segments(usedPath);
  if (expected.length !== actual.length) return false;
  return expected.every((part, index) => {
    const value = actual[index];
    if (value === undefined) return false;
    return part.startsWith("{") || part === value || value.startsWith("{");
  });
}

function implemented(endpoint: SpecEndpoint): boolean {
  return studentOperations.some(
    (operation) => operation.method === endpoint.method && matches(endpoint.path, operation.path),
  );
}

interface ResourceCoverage {
  resource: string;
  documented: number;
  implemented: number;
  unimplemented: number;
}

const api = specEndpoints.filter((endpoint) => endpoint.path.startsWith("/api/v1/"));
const byResource = new Map<string, ResourceCoverage>();
for (const endpoint of api) {
  const row = byResource.get(endpoint.resource) ?? {
    resource: endpoint.resource,
    documented: 0,
    implemented: 0,
    unimplemented: 0,
  };
  row.documented++;
  if (implemented(endpoint)) row.implemented++;
  else row.unimplemented++;
  byResource.set(endpoint.resource, row);
}

const rows = [...byResource.values()].sort((a, b) => a.resource.localeCompare(b.resource));
const studentRows = rows.filter(
  (row) => STUDENT_V1_RESOURCES.has(row.resource) || row.implemented > 0,
);
const outsideRows = rows.filter(
  (row) => !STUDENT_V1_RESOURCES.has(row.resource) && row.implemented === 0,
);
const summary = {
  documented_api_v1: api.length,
  implemented_operations: api.filter(implemented).length,
  student_surface_resources: studentRows.length,
  outside_student_v1_resources: outsideRows.length,
  outside_student_v1_endpoints: outsideRows.reduce((sum, row) => sum + row.documented, 0),
};

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { summary, student_surface: studentRows, outside_student_v1: outsideRows },
      null,
      2,
    ),
  );
} else {
  console.log("Canvas API coverage (committed spec)");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nStudent-v1 surface by resource");
  console.table(studentRows);
  console.log(
    "Unimplemented counts inside these resources are review candidates, not automatically missing features: Canvas groups student, teacher and admin endpoints under shared resources.",
  );
  console.log(
    `\nIntentionally outside student v1: ${outsideRows.length} resources / ${summary.outside_student_v1_endpoints} endpoints. Use --json for the full list.`,
  );
}
