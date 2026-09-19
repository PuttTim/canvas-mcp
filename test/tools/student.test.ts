import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasClient } from "../../src/canvas/client.ts";
import { NoopThrottleStore } from "../../src/canvas/throttle.ts";
import { parseFeatures, parseToolsets, type ServerContext } from "../../src/context.ts";
import { buildServer } from "../../src/server.ts";
import { allTools } from "../../src/tools/index.ts";
import { isEnabled } from "../../src/tools/registry.ts";
import { studentFixtures, uploadFixtures } from "../fixtures/student-tools.ts";
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
    toolsets: parseToolsets("default"),
    readOnly: false,
    allowDestructive: true,
    features: parseFeatures("submit"),
    identity: { userId: 42, baseUrl: base },
    ...overrides,
  };
}
function tool(name: string) {
  const definition = allTools.find((t) => t.name === name);
  if (!definition) throw new Error(`Missing tool ${name}`);
  return definition;
}
async function call(name: string, args: Record<string, unknown>, ctx: ServerContext) {
  const definition = tool(name);
  return definition.handler(definition.input.parse(args), ctx);
}

afterEach(() => vi.unstubAllGlobals());

describe("student tool fixtures", () => {
  it("covers every M2 tool, with unique names", () => {
    const names = allTools
      .filter((t) => !["me", "courses"].includes(t.toolset))
      .map((t) => t.name)
      .sort();
    const fixtures = [...studentFixtures, ...uploadFixtures].map((t) => t.name).sort();
    expect(fixtures).toEqual(names);
    expect(new Set(allTools.map((t) => t.name)).size).toBe(allTools.length);
  });

  for (const fixture of studentFixtures) {
    it(`${fixture.name}: endpoint, payload and response`, async () => {
      const mock = mockFetch([
        { path: fixture.path, method: fixture.method, json: fixture.response },
      ]);
      const result = await call(fixture.name, fixture.args, context(mock.fetch));
      expect(mock.calls).toHaveLength(1);
      const req = mock.calls[0];
      expect(req?.method).toBe(fixture.method);
      expect(req?.url.pathname).toBe(fixture.path);
      expect(req?.headers.get("authorization")).toBe("Bearer test-token");
      if (fixture.body !== undefined) expect(JSON.parse(req?.body ?? "null")).toEqual(fixture.body);
      for (const [key, value] of Object.entries(fixture.query ?? {})) {
        expect(
          Array.isArray(value) ? req?.url.searchParams.getAll(key) : req?.url.searchParams.get(key),
        ).toEqual(value);
      }
      if (fixture.expected) expect(result.structured).toMatchObject(fixture.expected);
      expect(result.structured).toBeDefined();
    });
    if (fixture.method !== "GET") {
      it(`${fixture.name}: dry run sends no request and previews the real payload`, async () => {
        const mock = mockFetch([]);
        const result = await call(
          fixture.name,
          { ...fixture.args, dry_run: true },
          context(mock.fetch),
        );
        expect(mock.calls).toHaveLength(0);
        expect(result.structured).toMatchObject({
          dry_run: true,
          request: {
            method: fixture.method,
            ...(fixture.body === undefined ? {} : { body: fixture.body }),
          },
        });
        const request = (result.structured as { request: { url: string } }).request;
        expect(new URL(request.url).pathname).toBe(fixture.path);
        expect(JSON.stringify(result)).not.toContain("test-token");
      });
    }
  }

  for (const fixture of uploadFixtures) {
    it(`${fixture.name}: uploads using its scoped ticket and never submits`, async () => {
      const mock = mockFetch([
        {
          method: "POST",
          path: fixture.path,
          json: { upload_url: "https://storage.example/upload", upload_params: { key: "signed" } },
        },
      ]);
      const storageFetch = vi.fn<typeof fetch>(async (_url, init) => {
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        expect(init?.redirect).toBe("manual");
        const data = init?.body as FormData;
        expect(data.get("key")).toBe("signed");
        expect(await (data.get("file") as File).text()).toBe("hello");
        return Response.json({ id: 7, display_name: "hello.txt" }, { status: 201 });
      });
      vi.stubGlobal("fetch", storageFetch);
      const result = await call(fixture.name, fixture.args, context(mock.fetch));
      expect(result.structured).toMatchObject({ id: 7 });
      expect(mock.calls).toHaveLength(1);
      expect(storageFetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mock.calls[0]?.body ?? "null")).toMatchObject({
        name: "hello.txt",
        size: 5,
        on_duplicate: "rename",
      });
    });
    it(`${fixture.name}: dry run does not request an upload ticket`, async () => {
      const mock = mockFetch([]);
      const fetchSpy = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchSpy);
      const result = await call(
        fixture.name,
        { ...fixture.args, dry_run: true },
        context(mock.fetch),
      );
      expect(mock.calls).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.structured).toMatchObject({
        dry_run: true,
        request: { url: `${base}${fixture.path}`, body: { size: 5 } },
        file: { sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
      });
    });
  }
});

describe("student tool boundaries", () => {
  it("supports dry runs for the original M0 writes too", async () => {
    const mock = mockFetch([]);
    for (const [name, args, method, path] of [
      [
        "canvas_courses_favorite_add",
        { course_id: 1 },
        "POST",
        "/api/v1/users/self/favorites/courses/1",
      ],
      [
        "canvas_courses_favorite_remove",
        { course_id: 1 },
        "DELETE",
        "/api/v1/users/self/favorites/courses/1",
      ],
      [
        "canvas_courses_nickname_set",
        { course_id: 1, nickname: "My course" },
        "PUT",
        "/api/v1/users/self/course_nicknames/1",
      ],
      [
        "canvas_courses_nickname_remove",
        { course_id: 1 },
        "DELETE",
        "/api/v1/users/self/course_nicknames/1",
      ],
      [
        "canvas_me_activity_stream_hide",
        { item_id: 2 },
        "DELETE",
        "/api/v1/users/self/activity_stream/2",
      ],
    ] as const) {
      const result = await call(name, { ...args, dry_run: true }, context(mock.fetch));
      expect(result.structured).toMatchObject({ dry_run: true, request: { method } });
      expect(
        new URL((result.structured as { request: { url: string } }).request.url).pathname,
      ).toBe(path);
    }
    expect(mock.calls).toHaveLength(0);
  });
  it("keeps submit opt-in and every mutation hidden for read-only connections", () => {
    const ctx = context(mockFetch([]).fetch, { features: new Set(), allowDestructive: false });
    expect(isEnabled(tool("canvas_submissions_submit"), ctx)).toBe(false);
    expect(isEnabled(tool("canvas_planner_note_delete"), ctx)).toBe(false);
    for (const definition of allTools)
      expect(isEnabled(definition, { ...ctx, readOnly: true })).toBe(definition.kind === "read");
  });

  it("requires confirmation before submitting and rejects mismatched submission fields", async () => {
    const mock = mockFetch([]);
    const args = {
      course_id: 1,
      assignment_id: 2,
      submission: { submission_type: "online_text_entry", body: "Answer" },
    };
    await expect(call("canvas_submissions_submit", args, context(mock.fetch))).rejects.toThrow(
      /confirmed=true/,
    );
    await expect(
      call("canvas_submissions_submit", { ...args, dry_run: true }, context(mock.fetch)),
    ).resolves.toMatchObject({ structured: { dry_run: true } });
    for (const submission of [
      { submission_type: "online_text_entry" },
      { submission_type: "online_upload", file_ids: [] },
      { submission_type: "online_url", url: "javascript:alert(1)" },
      { submission_type: "media_recording", media_comment_id: "id" },
    ]) {
      expect(
        tool("canvas_submissions_submit").input.safeParse({ ...args, submission }).success,
      ).toBe(false);
    }
    expect(mock.calls).toHaveLength(0);
  });

  it("preserves verbose HTML, projects normal results, and follows pagination cursors", async () => {
    const fixture = studentFixtures.find((f) => f.name === "canvas_assignments_list");
    const next = `${base}/api/v1/courses/1/assignments?page=2`;
    const raw = { id: 2, description: "<p>Text</p>", internal_extra: "not in projection" };
    const mock = mockFetch([
      {
        path: "/api/v1/courses/1/assignments?page=2",
        json: [{ id: 3, description: "<p>Second</p>" }],
      },
      {
        path: "/api/v1/courses/1/assignments",
        json: [raw],
        headers: { link: `<${next}>; rel="next"` },
      },
    ]);
    const ctx = context(mock.fetch);
    const first = await call("canvas_assignments_list", fixture?.args ?? {}, ctx);
    expect(first.structured).toEqual({
      items: [{ id: 2, description_markdown: "Text" }],
      count: 1,
      next_page_url: next,
    });
    const second = await call("canvas_assignments_list", { course_id: 1, page_url: next }, ctx);
    expect(second.structured).toMatchObject({ count: 1, items: [{ id: 3 }], next_page_url: null });
    const verbose = await call(
      "canvas_assignments_get",
      { course_id: 1, assignment_id: 2, verbose: true },
      context(mockFetch([{ path: "/api/v1/courses/1/assignments/2", json: raw }]).fetch),
    );
    expect(verbose.structured).toEqual(raw);
  });

  it("handles alternate file scopes and updates an existing planner override", async () => {
    for (const [name, args, path] of [
      ["canvas_files_folders_list", { course_id: 1 }, "/api/v1/courses/1/folders"],
      ["canvas_files_files_list", { course_id: 1 }, "/api/v1/courses/1/files"],
      ["canvas_files_files_list", { folder_id: 8 }, "/api/v1/folders/8/files"],
    ] as const) {
      const mock = mockFetch([{ path, json: [] }]);
      await call(name, args, context(mock.fetch));
      expect(mock.calls[0]?.url.pathname).toBe(path);
    }
    const mock = mockFetch([
      {
        path: "/api/v1/planner/overrides/14",
        method: "PUT",
        json: { id: 14, marked_complete: false },
      },
    ]);
    await call(
      "canvas_planner_override_set",
      { override_id: 14, marked_complete: false },
      context(mock.fetch),
    );
    expect(JSON.parse(mock.calls[0]?.body ?? "null")).toEqual({ marked_complete: false });
  });

  it("encodes page slugs and rejects path traversal and another user's calendar", async () => {
    const mock = mockFetch([
      { path: "/api/v1/courses/1/pages/week%201%2Fnotes%3Fx%3D1", json: { title: "Notes" } },
    ]);
    await call(
      "canvas_pages_get",
      { course_id: 1, page_url_or_id: "week 1/notes?x=1" },
      context(mock.fetch),
    );
    expect(mock.calls).toHaveLength(1);
    await expect(
      call("canvas_pages_get", { course_id: 1, page_url_or_id: ".." }, context(mock.fetch)),
    ).rejects.toThrow(/Invalid path/);
    await expect(
      call(
        "canvas_calendar_event_create",
        { context_code: "user_99", title: "No", dry_run: true },
        context(mock.fetch),
      ),
    ).rejects.toThrow(/own personal/);
  });

  it("executes the M2 acceptance workflow through the MCP SDK", async () => {
    const names = [
      "canvas_planner_items_list",
      "canvas_assignments_get",
      "canvas_submissions_submit",
      "canvas_discussions_entry_reply",
      "canvas_conversations_get",
    ];
    const fixtures = names.map((name) => {
      const fixture = studentFixtures.find((f) => f.name === name);
      if (!fixture) throw new Error(name);
      return fixture;
    });
    const mock = mockFetch(
      fixtures.map((f) => ({ method: f.method, path: f.path, json: f.response })),
    );
    const server = buildServer(context(mock.fetch));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "student-workflow", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      for (const fixture of fixtures) {
        const result = await client.callTool({ name: fixture.name, arguments: fixture.args });
        expect(result.isError, JSON.stringify(result)).toBeFalsy();
        if (fixture.expected) expect(result.structuredContent).toMatchObject(fixture.expected);
      }
      expect(mock.calls).toHaveLength(5);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
