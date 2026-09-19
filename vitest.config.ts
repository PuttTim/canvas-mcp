import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { Response as MfResponse } from "miniflare";
import { defineConfig } from "vitest/config";

/**
 * Stand-in for any Canvas instance during Workers tests. Miniflare routes every
 * outbound fetch from the Worker here.
 */
function mockCanvas(request: { url: string; headers: { get(name: string): string | null } }) {
  const url = new URL(request.url);
  const authed = request.headers.get("authorization") === "Bearer good-token";
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new MfResponse(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  if (url.hostname === "unreachable.example") return new MfResponse("bad gateway", { status: 502 });
  if (!authed) return json(401, { errors: [{ message: "Invalid access token." }] });
  switch (url.pathname) {
    case "/api/v1/users/self":
    case "/api/v1/users/self/profile":
      return json(
        200,
        { id: 42, name: "Ada Lovelace", primary_email: "ada@example.edu" },
        { "x-rate-limit-remaining": "699", "x-request-cost": "0.5" },
      );
    case "/api/v1/courses":
      return json(200, [
        { id: 1, name: "Algorithms", course_code: "CS3230", workflow_state: "available" },
      ]);
    default:
      return json(404, { errors: [{ message: "The specified resource does not exist." }] });
  }
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/worker/**", "test/integration/**"],
          environment: "node",
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: { PROPS_KEY: "test-props-key", ALLOW_DIRECT_BEARER: "1" },
              outboundService: mockCanvas,
            },
          }),
        ],
        test: { name: "workers", include: ["test/worker/**/*.test.ts"] },
      },
    ],
  },
});
