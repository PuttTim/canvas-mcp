import { describe, expect, it } from "vitest";
import { generateKey, open, seal, tokenFingerprint } from "../../src/auth/crypto.ts";

describe("seal/open", () => {
  it("round-trips with a generated key and with a passphrase", async () => {
    const key = generateKey();
    const sealed = await seal("secret-token", key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("secret-token");
    expect(await open(sealed, key)).toBe("secret-token");
    const sealed2 = await seal("x", "just a passphrase");
    expect(await open(sealed2, "just a passphrase")).toBe("x");
  });
  it("fails with the wrong key or tampered data", async () => {
    const sealed = await seal("t", generateKey());
    await expect(open(sealed, generateKey())).rejects.toThrow();
    await expect(open("v2.a.b", generateKey())).rejects.toThrow(/format/);
  });
  it("fingerprint is stable and not reversible", async () => {
    const a = await tokenFingerprint("abc");
    expect(a).toBe(await tokenFingerprint("abc"));
    expect(a).not.toBe(await tokenFingerprint("abd"));
    expect(a).not.toContain("abc");
  });
});
