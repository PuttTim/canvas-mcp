/**
 * Every Canvas path the service layer calls must be documented in the
 * committed spec manifest. Network-free.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { studentOperations } from "../src/canvas/services/student.ts";

interface Endpoint {
  method: string;
  path: string;
}

const root = path.resolve(import.meta.dirname, "..");
const endpoints: Endpoint[] = [
  ...JSON.parse(readFileSync(path.join(root, "spec/endpoints.json"), "utf8")),
  ...JSON.parse(readFileSync(path.join(root, "spec/overrides.json"), "utf8")),
];

/** `{id}` in the spec and `${expr}` in code both become a wildcard segment. Literal segments must match exactly, except that a literal may match a spec wildcard (e.g. `self`). */
function segments(p: string): string[] {
  return p.replace(/\?.*$/, "").split("/").filter(Boolean);
}
function matches(specPath: string, usedPath: string): boolean {
  const a = segments(specPath);
  const b = segments(usedPath);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const s = a[i] ?? "";
    const u = b[i] ?? "";
    const specWild = s.startsWith("{");
    const usedWild = u.includes("${");
    if (specWild) continue; // anything (including a literal like `self`) may fill a spec param
    if (usedWild) return false; // code passes a variable where the spec has a literal
    if (s !== u) return false;
  }
  return true;
}

const METHOD_FOR = {
  get: "GET",
  collect: "GET",
  pages: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
} as const;

function harvest(): Array<{ file: string; method: string; path: string }> {
  const dir = path.join(root, "src/canvas/services");
  const out: Array<{ file: string; method: string; path: string }> = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const src = readFileSync(path.join(dir, f), "utf8");
    const re = /\.(get|collect|pages|post|put|delete)(?:<[^(]*>)?\(\s*`(\/api\/[^`]+)`/g;
    for (const m of src.matchAll(re)) {
      const verb = m[1] as keyof typeof METHOD_FOR;
      out.push({ file: f, method: METHOD_FOR[verb], path: m[2] ?? "" });
    }
  }
  return out;
}

describe("spec contract", () => {
  const used = [...harvest(), ...studentOperations.map((o) => ({ ...o, file: "student.ts" }))];
  it("harvests at least one endpoint from the service layer", () => {
    expect(used.length).toBeGreaterThan(0);
  });
  for (const u of used) {
    it(`${u.method} ${u.path} (${u.file}) is documented`, () => {
      const hit = endpoints.some((e) => e.method === u.method && matches(e.path, u.path));
      expect(hit, `no documented endpoint for ${u.method} ${u.path}`).toBe(true);
    });
  }
});
