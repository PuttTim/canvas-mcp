import { describe, expect, it } from "vitest";
import { CanvasError, extractErrorMessages } from "../../src/canvas/errors.ts";

describe("extractErrorMessages", () => {
  it("handles array, keyed, and flat shapes", () => {
    expect(extractErrorMessages({ errors: [{ message: "a" }, "b"] })).toEqual(["a", "b"]);
    expect(
      extractErrorMessages({ errors: { name: [{ message: "is required" }], size: "too big" } }),
    ).toEqual(["name: is required", "size: too big"]);
    expect(extractErrorMessages({ message: "nope" })).toEqual(["nope"]);
    expect(extractErrorMessages("403 Forbidden (Rate Limit Exceeded)")).toEqual([
      "403 Forbidden (Rate Limit Exceeded)",
    ]);
    expect(extractErrorMessages(null)).toEqual([]);
  });
  it("CanvasError gives hints", () => {
    expect(new CanvasError({ status: 401, messages: [], path: "/x" }).hint).toMatch(/token/i);
    expect(
      new CanvasError({ status: 403, messages: [], path: "/x", rateLimited: true }).hint,
    ).toMatch(/rate limit/i);
  });
});
