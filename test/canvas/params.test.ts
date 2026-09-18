import { describe, expect, it } from "vitest";
import { encodeQuery, withQuery } from "../../src/canvas/params.ts";

describe("encodeQuery", () => {
  it("encodes arrays with [] and nested objects with [key]", () => {
    const q = encodeQuery({
      include: ["term", "total_scores"],
      assignment: { name: "HW 1", points: 10 },
      per_page: 50,
      published: true,
      skip: undefined,
      nothing: null,
    });
    expect(q.toString()).toBe(
      "include%5B%5D=term&include%5B%5D=total_scores&assignment%5Bname%5D=HW+1&assignment%5Bpoints%5D=10&per_page=50&published=true",
    );
  });
  it("withQuery appends to existing query strings", () => {
    expect(withQuery("/api/v1/courses?page=2", { per_page: 10 })).toBe(
      "/api/v1/courses?page=2&per_page=10",
    );
    expect(withQuery("/api/v1/courses", {})).toBe("/api/v1/courses");
    expect(withQuery("/api/v1/courses", undefined)).toBe("/api/v1/courses");
  });
});
