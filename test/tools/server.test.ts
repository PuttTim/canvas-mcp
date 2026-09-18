import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { CanvasClient } from "../../src/canvas/client.ts";
import { NoopThrottleStore } from "../../src/canvas/throttle.ts";
import { parseFeatures, parseToolsets, type ServerContext } from "../../src/context.ts";
import { buildServer } from "../../src/server.ts";
import { mockFetch } from "../helpers/mock-fetch.ts";

const base = "https://school.instructure.com";

function makeCtx(fetchImpl: typeof fetch, overrides: Partial<ServerContext> = {}): ServerContext {
  return {
    canvas: new CanvasClient({
      baseUrl: base,
      token: "t",
      fetch: fetchImpl,
      throttle: new NoopThrottleStore(),
      sleep: async () => {},
    }),
    toolsets: parseToolsets("default"),
    readOnly: false,
    allowDestructive: false,
    features: parseFeatures(""),
    ...overrides,
  };
}

async function connect(ctx: ServerContext) {
  const server = buildServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return { client, server };
}

describe("buildServer", () => {
  it("lists read and write tools but hides irreversible ones by default", async () => {
    const { client } = await connect(makeCtx(mockFetch([]).fetch));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("canvas_me");
    expect(names).toContain("canvas_courses_favorite_add");
    expect(names).not.toContain("canvas_courses_favorite_remove");
    const me = tools.find((t) => t.name === "canvas_me");
    expect(me?.annotations?.readOnlyHint).toBe(true);
    const add = tools.find((t) => t.name === "canvas_courses_favorite_add");
    expect(add?.annotations?.readOnlyHint).toBe(false);
    expect(add?.annotations?.destructiveHint).toBeUndefined();
  });

  it("read-only mode exposes only read tools; allowDestructive adds irreversible ones with destructiveHint", async () => {
    const ro = await connect(makeCtx(mockFetch([]).fetch, { readOnly: true }));
    const roNames = (await ro.client.listTools()).tools.map((t) => t.name);
    expect(
      roNames.every(
        (n) =>
          !n.endsWith("_add") &&
          !n.endsWith("_set") &&
          !n.endsWith("_remove") &&
          !n.endsWith("_hide"),
      ),
    ).toBe(true);

    const d = await connect(makeCtx(mockFetch([]).fetch, { allowDestructive: true }));
    const tools = (await d.client.listTools()).tools;
    const rm = tools.find((t) => t.name === "canvas_courses_favorite_remove");
    expect(rm?.annotations?.destructiveHint).toBe(true);
  });

  it("respects toolset selection", async () => {
    const { client } = await connect(
      makeCtx(mockFetch([]).fetch, { toolsets: parseToolsets("me") }),
    );
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names.every((n) => n.startsWith("canvas_me"))).toBe(true);
  });

  it("canvas_me and canvas_courses_list call Canvas and return projections", async () => {
    const m = mockFetch([
      {
        path: "/api/v1/users/self/profile",
        json: {
          id: 7,
          name: "Ada",
          primary_email: "ada@x.edu",
          time_zone: "Asia/Singapore",
          extra: "hidden",
        },
      },
      {
        path: "/api/v1/courses",
        json: [
          {
            id: 1,
            name: "Algorithms",
            course_code: "CS3230",
            workflow_state: "available",
            term: { id: 3, name: "AY25/26 S1" },
            enrollments: [
              {
                type: "student",
                role: "StudentEnrollment",
                enrollment_state: "active",
                computed_current_score: 88.5,
                computed_current_grade: "A-",
              },
            ],
            is_favorite: true,
            syllabus_body: "<p>Hello <b>world</b></p>",
          },
        ],
        headers: { link: `<${base}/api/v1/courses?page=2&per_page=25>; rel="next"` },
      },
    ]);
    const { client } = await connect(makeCtx(m.fetch));

    const me = await client.callTool({ name: "canvas_me", arguments: {} });
    expect(me.isError).toBeFalsy();
    expect(me.structuredContent).toMatchObject({ id: 7, name: "Ada", email: "ada@x.edu" });
    expect(me.structuredContent).not.toHaveProperty("extra");

    const courses = await client.callTool({
      name: "canvas_courses_list",
      arguments: { include: ["term", "total_scores", "syllabus_body"] },
    });
    expect(courses.isError).toBeFalsy();
    const sc = courses.structuredContent as {
      items: Array<Record<string, unknown>>;
      next_page_url: string | null;
    };
    expect(sc.items[0]).toMatchObject({
      id: 1,
      name: "Algorithms",
      term: { name: "AY25/26 S1" },
      syllabus_markdown: "Hello **world**",
    });
    const enrollments = (sc.items[0]?.enrollments ?? []) as Array<Record<string, unknown>>;
    expect(enrollments[0]).toMatchObject({
      current_score: 88.5,
      current_grade: "A-",
    });
    expect(sc.next_page_url).toContain("page=2");
    const q = m.calls[1]?.url.searchParams;
    expect(q?.getAll("include[]")).toEqual(["term", "total_scores", "syllabus_body"]);
    expect(q?.get("per_page")).toBe("25");
  });

  it("surfaces Canvas errors as tool errors with hints", async () => {
    const m = mockFetch([
      {
        path: "/api/v1/users/self/profile",
        status: 401,
        json: { errors: [{ message: "Invalid access token." }] },
      },
    ]);
    const { client } = await connect(makeCtx(m.fetch));
    const res = await client.callTool({ name: "canvas_me", arguments: {} });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    expect(text).toMatch(/token/i);
    expect(text).toMatch(/Invalid access token/);
  });
});
