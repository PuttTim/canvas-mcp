import { describe, expect, it } from "vitest";
import { CanvasClient } from "../../src/canvas/client.ts";
import { CanvasError } from "../../src/canvas/errors.ts";
import { NoopThrottleStore } from "../../src/canvas/throttle.ts";
import { mockFetch } from "../helpers/mock-fetch.ts";

const base = "https://school.instructure.com";
function client(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof CanvasClient>[0]> = {},
) {
  return new CanvasClient({
    baseUrl: base,
    token: "tok",
    fetch: fetchImpl,
    throttle: new NoopThrottleStore(),
    sleep: async () => {},
    ...extra,
  });
}

describe("CanvasClient", () => {
  it("sends bearer auth, JSON bodies, and rails-encoded queries", async () => {
    const m = mockFetch([{ method: "POST", path: "/api/v1/courses/1/x", json: { ok: true } }]);
    const res = await client(m.fetch).post<{ ok: boolean }>("/api/v1/courses/1/x", {
      query: { include: ["a"] },
      body: { name: "n" },
    });
    expect(res.data).toEqual({ ok: true });
    const call = m.calls[0];
    expect(call?.headers.get("authorization")).toBe("Bearer tok");
    expect(call?.headers.get("content-type")).toBe("application/json");
    expect(call?.url.search).toBe("?include%5B%5D=a");
    expect(call?.body).toBe('{"name":"n"}');
  });

  it("refuses to send credentials to another origin", async () => {
    const m = mockFetch([]);
    await expect(client(m.fetch).get("https://evil.example/api/v1/users/self")).rejects.toThrow(
      /Refusing/,
    );
    expect(m.calls).toHaveLength(0);
  });

  it("normalises errors and hints", async () => {
    const m = mockFetch([
      {
        path: "/api/v1/nope",
        status: 404,
        json: { errors: [{ message: "The specified resource does not exist." }] },
      },
    ]);
    const err = await client(m.fetch)
      .get("/api/v1/nope")
      .catch((e) => e);
    expect(err).toBeInstanceOf(CanvasError);
    expect(err.status).toBe(404);
    expect(err.messages).toEqual(["The specified resource does not exist."]);
  });

  it("retries rate-limited 403s then succeeds", async () => {
    const m = mockFetch([
      {
        path: "/api/v1/users/self",
        status: 403,
        text: "403 Forbidden (Rate Limit Exceeded)",
        headers: { "x-rate-limit-remaining": "0" },
        times: 2,
      },
      {
        path: "/api/v1/users/self",
        json: { id: 1 },
        headers: { "x-request-cost": "1.5", "x-rate-limit-remaining": "690" },
      },
    ]);
    const res = await client(m.fetch).get<{ id: number }>("/api/v1/users/self");
    expect(res.data.id).toBe(1);
    expect(res.cost).toBe(1.5);
    expect(res.remaining).toBe(690);
    expect(m.calls).toHaveLength(3);
  });

  it("gives up after maxRetries with rateLimited set", async () => {
    const m = mockFetch([{ path: "/api/v1/users/self", status: 429, text: "slow down" }]);
    const err = await client(m.fetch, { maxRetries: 1 })
      .get("/api/v1/users/self")
      .catch((e) => e);
    expect(err).toBeInstanceOf(CanvasError);
    expect(err.rateLimited).toBe(true);
    expect(m.calls).toHaveLength(2);
  });

  it("collects pages via Link headers and returns a resume cursor", async () => {
    const m = mockFetch([
      {
        path: "/api/v1/courses?per_page=2",
        json: [{ id: 1 }, { id: 2 }],
        headers: { link: `<${base}/api/v1/courses?page=2&per_page=2>; rel="next"` },
      },
      {
        path: "/api/v1/courses?page=2&per_page=2",
        json: [{ id: 3 }],
        headers: { link: `<${base}/api/v1/courses?page=3&per_page=2>; rel="next"` },
      },
      { path: "/api/v1/courses?page=3&per_page=2", json: [] },
    ]);
    const c = client(m.fetch);
    const one = await c.collect<{ id: number }>("/api/v1/courses", undefined, { perPage: 2 });
    expect(one.items.map((i) => i.id)).toEqual([1, 2]);
    expect(one.nextPageUrl).toBe(`${base}/api/v1/courses?page=2&per_page=2`);
    const rest = await c.collect<{ id: number }>("/api/v1/courses", undefined, {
      pageUrl: one.nextPageUrl ?? undefined,
      maxPages: 5,
    });
    expect(rest.items.map((i) => i.id)).toEqual([3]);
    expect(rest.nextPageUrl).toBeNull();
    expect(rest.pagesFetched).toBe(2);
  });
});
