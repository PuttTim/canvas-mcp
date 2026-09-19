import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasClient } from "../../src/canvas/client.ts";
import { NoopThrottleStore } from "../../src/canvas/throttle.ts";
import { parseFeatures, parseToolsets, type ServerContext } from "../../src/context.ts";
import { allTools } from "../../src/tools/index.ts";
import { isEnabled } from "../../src/tools/registry.ts";
import { mockFetch } from "../helpers/mock-fetch.ts";

const base = "https://school.instructure.com";
function context(fetchImpl: typeof fetch, overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    canvas: new CanvasClient({
      baseUrl: base,
      token: "test-token",
      fetch: fetchImpl,
      throttle: new NoopThrottleStore(),
      maxRetries: 0,
    }),
    toolsets: parseToolsets("all"),
    readOnly: false,
    allowDestructive: true,
    features: parseFeatures("submit"),
    identity: { userId: 42, baseUrl: base },
    ...overrides,
  };
}

function tool(name: string) {
  const definition = allTools.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Missing tool ${name}`);
  return definition;
}

async function call(name: string, args: Record<string, unknown>, ctx: ServerContext) {
  const definition = tool(name);
  return definition.handler(definition.input.parse(args), ctx);
}

interface Fixture {
  name: string;
  args: Record<string, unknown>;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  response: unknown;
  body?: unknown;
}

const attempt = { attempt: 1, validation_token: "validation-token" };
const fixtures: Fixture[] = [
  {
    name: "canvas_quizzes_list",
    args: { course_id: 1 },
    method: "GET",
    path: "/api/v1/courses/1/quizzes",
    response: [{ id: 2, title: "Quiz" }],
  },
  {
    name: "canvas_quizzes_get",
    args: { course_id: 1, quiz_id: 2 },
    method: "GET",
    path: "/api/v1/courses/1/quizzes/2",
    response: { id: 2, title: "Quiz" },
  },
  {
    name: "canvas_quizzes_submissions_mine",
    args: { course_id: 1, quiz_id: 2 },
    method: "GET",
    path: "/api/v1/courses/1/quizzes/2/submissions",
    response: { quiz_submissions: [{ id: 3, attempt: 1 }] },
  },
  {
    name: "canvas_quizzes_submission_questions",
    args: { quiz_submission_id: 3 },
    method: "GET",
    path: "/api/v1/quiz_submissions/3/questions",
    response: [{ id: 4, flagged: false }],
  },
  {
    name: "canvas_quizzes_submission_time",
    args: { course_id: 1, quiz_id: 2, quiz_submission_id: 3 },
    method: "GET",
    path: "/api/v1/courses/1/quizzes/2/submissions/3/time",
    response: { time_left: 300 },
  },
  {
    name: "canvas_quizzes_submission_start",
    args: { course_id: 1, quiz_id: 2 },
    method: "POST",
    path: "/api/v1/courses/1/quizzes/2/submissions",
    response: { id: 3, attempt: 1 },
    body: {},
  },
  {
    name: "canvas_quizzes_submission_answer",
    args: { quiz_submission_id: 3, ...attempt, quiz_questions: [{ id: 4, answer: "A" }] },
    method: "POST",
    path: "/api/v1/quiz_submissions/3/questions",
    response: [{ id: 4, answer: "A" }],
    body: { ...attempt, quiz_questions: [{ id: 4, answer: "A" }] },
  },
  {
    name: "canvas_quizzes_submission_flag",
    args: { quiz_submission_id: 3, question_id: 4, ...attempt },
    method: "PUT",
    path: "/api/v1/quiz_submissions/3/questions/4/flag",
    response: {},
    body: attempt,
  },
  {
    name: "canvas_quizzes_submission_unflag",
    args: { quiz_submission_id: 3, question_id: 4, ...attempt },
    method: "PUT",
    path: "/api/v1/quiz_submissions/3/questions/4/unflag",
    response: {},
    body: attempt,
  },
  {
    name: "canvas_quizzes_submission_complete",
    args: { course_id: 1, quiz_id: 2, quiz_submission_id: 3, ...attempt, confirmed: true },
    method: "POST",
    path: "/api/v1/courses/1/quizzes/2/submissions/3/complete",
    response: { id: 3, workflow_state: "complete" },
    body: attempt,
  },
  {
    name: "canvas_groups_list_mine",
    args: {},
    method: "GET",
    path: "/api/v1/users/self/groups",
    response: [{ id: 5, name: "Study group" }],
  },
  {
    name: "canvas_groups_get",
    args: { group_id: 5 },
    method: "GET",
    path: "/api/v1/groups/5",
    response: { id: 5, name: "Study group" },
  },
  {
    name: "canvas_groups_members",
    args: { group_id: 5 },
    method: "GET",
    path: "/api/v1/groups/5/users",
    response: [{ id: 42, name: "Ada" }],
  },
  {
    name: "canvas_groups_activity_stream",
    args: { group_id: 5 },
    method: "GET",
    path: "/api/v1/groups/5/activity_stream",
    response: [],
  },
  {
    name: "canvas_groups_discussions_list",
    args: { group_id: 5 },
    method: "GET",
    path: "/api/v1/groups/5/discussion_topics",
    response: [{ id: 6, title: "Hello" }],
  },
  {
    name: "canvas_groups_files_list",
    args: { group_id: 5 },
    method: "GET",
    path: "/api/v1/groups/5/files",
    response: [{ id: 7, display_name: "notes.pdf" }],
  },
  {
    name: "canvas_groups_pages_list",
    args: { group_id: 5 },
    method: "GET",
    path: "/api/v1/groups/5/pages",
    response: [{ page_id: 8, title: "Notes" }],
  },
  {
    name: "canvas_groups_join",
    args: { group_id: 5 },
    method: "POST",
    path: "/api/v1/groups/5/memberships",
    response: { id: 9 },
    body: {},
  },
  {
    name: "canvas_groups_invite",
    args: { group_id: 5, invitees: ["friend@example.com"] },
    method: "POST",
    path: "/api/v1/groups/5/invite",
    response: {},
    body: { invitees: ["friend@example.com"] },
  },
  {
    name: "canvas_groups_discussion_post",
    args: { group_id: 5, topic_id: 6, message: "Hello" },
    method: "POST",
    path: "/api/v1/groups/5/discussion_topics/6/entries",
    response: { id: 10, message: "Hello" },
    body: { message: "Hello" },
  },
  {
    name: "canvas_groups_leave",
    args: { group_id: 5 },
    method: "DELETE",
    path: "/api/v1/groups/5/memberships/self",
    response: {},
  },
  {
    name: "canvas_people_user_get",
    args: { user_id: 42 },
    method: "GET",
    path: "/api/v1/users/42",
    response: { id: 42, name: "Ada" },
  },
  {
    name: "canvas_people_search_course_users",
    args: { course_id: 1, search_term: "Ada" },
    method: "GET",
    path: "/api/v1/courses/1/search_users",
    response: [{ id: 42, name: "Ada" }],
  },
  {
    name: "canvas_people_sections_list",
    args: { course_id: 1 },
    method: "GET",
    path: "/api/v1/courses/1/sections",
    response: [{ id: 11, name: "Tutorial" }],
  },
  {
    name: "canvas_people_enrollments_mine",
    args: { course_id: 1 },
    method: "GET",
    path: "/api/v1/users/self/enrollments",
    response: [{ id: 12, course_id: 1, user_id: 42 }],
  },
  {
    name: "canvas_outcomes_results_mine",
    args: { course_id: 1 },
    method: "GET",
    path: "/api/v1/courses/1/outcome_results",
    response: { outcome_results: [{ id: 13, score: 4 }] },
  },
  {
    name: "canvas_outcomes_rollups_mine",
    args: { course_id: 1 },
    method: "GET",
    path: "/api/v1/courses/1/outcome_rollups",
    response: { rollups: [{ scores: [{ score: 4 }] }] },
  },
  {
    name: "canvas_outcomes_get",
    args: { outcome_id: 14 },
    method: "GET",
    path: "/api/v1/outcomes/14",
    response: { id: 14, title: "Explain recursion" },
  },
  {
    name: "canvas_bookmarks_list",
    args: {},
    method: "GET",
    path: "/api/v1/users/self/bookmarks",
    response: [{ id: 15, name: "Course", url: "/courses/1" }],
  },
  {
    name: "canvas_bookmarks_get",
    args: { bookmark_id: 15 },
    method: "GET",
    path: "/api/v1/users/self/bookmarks/15",
    response: { id: 15, name: "Course", url: "/courses/1" },
  },
  {
    name: "canvas_bookmarks_create",
    args: { name: "Course", url: "/courses/1" },
    method: "POST",
    path: "/api/v1/users/self/bookmarks",
    response: { id: 15 },
    body: { name: "Course", url: "/courses/1" },
  },
  {
    name: "canvas_bookmarks_update",
    args: { bookmark_id: 15, name: "Class" },
    method: "PUT",
    path: "/api/v1/users/self/bookmarks/15",
    response: { id: 15, name: "Class" },
    body: { name: "Class" },
  },
  {
    name: "canvas_bookmarks_delete",
    args: { bookmark_id: 15 },
    method: "DELETE",
    path: "/api/v1/users/self/bookmarks/15",
    response: {},
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("M3 student tools", () => {
  it("has a fixture for every non-api M3 tool and unique names", () => {
    const names = allTools
      .filter((candidate) =>
        ["quizzes", "groups", "people", "outcomes", "bookmarks"].includes(candidate.toolset),
      )
      .map((candidate) => candidate.name)
      .sort();
    expect(fixtures.map((fixture) => fixture.name).sort()).toEqual(names);
    expect(new Set(allTools.map((candidate) => candidate.name)).size).toBe(allTools.length);
  });

  for (const fixture of fixtures) {
    it(`${fixture.name}: endpoint, payload and response`, async () => {
      const mock = mockFetch([
        { path: fixture.path, method: fixture.method, json: fixture.response },
      ]);
      const result = await call(fixture.name, fixture.args, context(mock.fetch));
      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]?.method).toBe(fixture.method);
      expect(mock.calls[0]?.url.pathname).toBe(fixture.path);
      expect(mock.calls[0]?.headers.get("authorization")).toBe("Bearer test-token");
      if (fixture.body !== undefined)
        expect(JSON.parse(mock.calls[0]?.body ?? "null")).toEqual(fixture.body);
      expect(result.structured).toBeDefined();
    });

    if (fixture.method !== "GET") {
      it(`${fixture.name}: dry run is side-effect-free`, async () => {
        const mock = mockFetch([]);
        const result = await call(
          fixture.name,
          { ...fixture.args, confirmed: false, dry_run: true },
          context(mock.fetch),
        );
        expect(mock.calls).toHaveLength(0);
        expect(result.structured).toMatchObject({
          dry_run: true,
          request: { method: fixture.method },
        });
        expect(JSON.stringify(result)).not.toContain("test-token");
      });
    }
  }

  it("restricts outcome queries to the connected user", async () => {
    const mock = mockFetch([
      { path: "/api/v1/courses/1/outcome_results", json: { outcome_results: [] } },
    ]);
    await call("canvas_outcomes_results_mine", { course_id: 1 }, context(mock.fetch));
    expect(mock.calls[0]?.url.searchParams.getAll("user_ids[]")).toEqual(["42"]);
  });

  it("requires confirmation before completing a quiz", async () => {
    const mock = mockFetch([]);
    await expect(
      call(
        "canvas_quizzes_submission_complete",
        { course_id: 1, quiz_id: 2, quiz_submission_id: 3, ...attempt },
        context(mock.fetch),
      ),
    ).rejects.toThrow(/confirmed=true/);
    expect(mock.calls).toHaveLength(0);
  });

  it("gates quiz actions behind submit, destructive group/bookmark tools, and all API tools", () => {
    const ctx = context(mockFetch([]).fetch, {
      toolsets: parseToolsets("default"),
      features: new Set(),
      allowDestructive: false,
    });
    expect(isEnabled(tool("canvas_quizzes_submission_start"), ctx)).toBe(false);
    expect(isEnabled(tool("canvas_groups_leave"), ctx)).toBe(false);
    expect(isEnabled(tool("canvas_bookmarks_delete"), ctx)).toBe(false);
    expect(isEnabled(tool("canvas_api_request"), ctx)).toBe(false);
  });
});

describe("generic API tools", () => {
  it("finds committed spec endpoints", async () => {
    const result = await call(
      "canvas_api_find_endpoint",
      { query: "list quizzes", method: "GET" },
      context(mockFetch([]).fetch),
    );
    expect(result.structured).toMatchObject({ count: expect.any(Number) });
    expect((result.structured as { count: number }).count).toBeGreaterThan(0);
  });

  it("allows only documented same-instance GET paths", async () => {
    const mock = mockFetch([{ path: "/api/v1/courses/1", json: { id: 1, name: "Course" } }]);
    const result = await call(
      "canvas_api_request",
      { path: "/api/v1/courses/1", query: {} },
      context(mock.fetch),
    );
    expect(result.structured).toMatchObject({ data: { id: 1 }, next_page_url: null });
    await expect(
      call(
        "canvas_api_request",
        { path: "https://evil.example/api/v1/courses" },
        context(mock.fetch),
      ),
    ).rejects.toThrow(/Only \/api\/v1/);
    await expect(
      call("canvas_api_request", { path: "/api/v1/not-a-real-endpoint" }, context(mock.fetch)),
    ).rejects.toThrow(/No documented GET/);
    await expect(
      call(
        "canvas_api_request",
        { path: "/api/v1/courses/1", query: { invented: true } },
        context(mock.fetch),
      ),
    ).rejects.toThrow(/not documented/);
    await expect(
      call("canvas_api_request", { path: "/api/v1/courses/%2e%2e/users" }, context(mock.fetch)),
    ).rejects.toThrow(/traversal/);
  });

  it("accepts only same-instance continuation URLs", async () => {
    const next = `${base}/api/v1/courses?page=2&per_page=1`;
    const mock = mockFetch([{ path: "/api/v1/courses?page=2&per_page=1", json: [{ id: 2 }] }]);
    const result = await call("canvas_api_request", { page_url: next }, context(mock.fetch));
    expect(result.structured).toMatchObject({ data: [{ id: 2 }] });
    await expect(
      call(
        "canvas_api_request",
        { page_url: "https://evil.example/api/v1/courses?page=2" },
        context(mock.fetch),
      ),
    ).rejects.toThrow(/Refusing to send Canvas credentials/);
  });
});
