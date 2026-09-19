import { describe, expect, it } from "vitest";
import { isCanvasUserId } from "../../src/auth/canvas-id.ts";
import { isGrantProps } from "../../src/auth/grant.ts";

describe("Canvas user IDs", () => {
  it.each([42, Number.MAX_SAFE_INTEGER, "42", "9007199254740993"])(
    "accepts valid ID %s in profiles and stored grants",
    (userId) => {
      expect(isCanvasUserId(userId)).toBe(true);
      expect(
        isGrantProps({
          v: 1,
          baseUrl: "https://school.instructure.com",
          sealedToken: "sealed",
          tokenId: "fingerprint",
          userId,
          name: "Ada",
          scopes: ["canvas:read"],
        }),
      ).toBe(true);
    },
  );

  it.each([
    null,
    undefined,
    true,
    {},
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "",
    "0",
    "-1",
    "1.5",
    "abc",
    " 42",
    "42\n",
  ])("rejects invalid or imprecise ID %s", (value) => {
    expect(isCanvasUserId(value)).toBe(false);
  });
});
