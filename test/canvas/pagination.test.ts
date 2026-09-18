import { describe, expect, it } from "vitest";
import { parseLinkHeader } from "../../src/canvas/pagination.ts";

describe("parseLinkHeader", () => {
  it("parses Canvas-style Link headers", () => {
    const h =
      '<https://c.edu/api/v1/courses?page=2&per_page=10>; rel="current",<https://c.edu/api/v1/courses?page=3&per_page=10>; rel="next",<https://c.edu/api/v1/courses?page=1&per_page=10>; rel="first",<https://c.edu/api/v1/courses?page=9&per_page=10>; rel="last"';
    expect(parseLinkHeader(h)).toEqual({
      current: "https://c.edu/api/v1/courses?page=2&per_page=10",
      next: "https://c.edu/api/v1/courses?page=3&per_page=10",
      first: "https://c.edu/api/v1/courses?page=1&per_page=10",
      last: "https://c.edu/api/v1/courses?page=9&per_page=10",
    });
  });
  it("handles missing header and unknown rels", () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader('<https://x/y>; rel="bogus"')).toEqual({});
  });
});
