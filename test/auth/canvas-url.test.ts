import { describe, expect, it } from "vitest";
import { normalizeCanvasUrl } from "../../src/auth/canvas-url.ts";

describe("normalizeCanvasUrl", () => {
  it("normalises pasted URLs to an https origin", () => {
    expect(normalizeCanvasUrl("school.instructure.com")).toBe("https://school.instructure.com");
    expect(normalizeCanvasUrl(" https://School.Instructure.com/courses/1?x=1 ")).toBe(
      "https://school.instructure.com",
    );
    expect(normalizeCanvasUrl("https://canvas.nus.edu.sg:443/")).toBe("https://canvas.nus.edu.sg");
  });
  it("rejects non-public targets", () => {
    for (const bad of [
      "http://school.instructure.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.5",
      "https://[::1]",
      "https://canvas",
      "https://canvas.local",
      "https://a.b.internal",
      "https://user:pw@x.edu",
      "https://x.edu:8443",
      "",
    ]) {
      expect(() => normalizeCanvasUrl(bad), bad).toThrow();
    }
  });
});
