/**
 * Fetch Canvas's Swagger 1.2 API docs (api-docs.json + one file per resource)
 * from a live Canvas host and snapshot them under spec/swagger12/.
 *
 * Usage: pnpm spec:sync [--host https://learn.canvas.net]
 *
 * canvas.instructure.com IP-blocks datacenter requests; learn.canvas.net serves
 * the same docs, so it is the default.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const hostIdx = args.indexOf("--host");
const host = (hostIdx >= 0 ? args[hostIdx + 1] : undefined) ?? "https://learn.canvas.net";
const outDir = path.resolve(import.meta.dirname, "../spec/swagger12");

interface ApiIndex {
  apiVersion: string;
  swaggerVersion: string;
  apis: { path: string; description: string }[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const base = `${host.replace(/\/$/, "")}/doc/api`;
  const index = await fetchJson<ApiIndex>(`${base}/api-docs.json`);
  await writeFile(path.join(outDir, "api-docs.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`index: ${index.apis.length} resources (swagger ${index.swaggerVersion})`);

  let ok = 0;
  const failed: string[] = [];
  // Modest concurrency; these are static files but let's be polite.
  const queue = [...index.apis];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const api = queue.shift();
      if (!api) break;
      const url = `${base}${api.path}`;
      try {
        const doc = await fetchJson<unknown>(url);
        const file = api.path.replace(/^\//, "");
        await writeFile(path.join(outDir, file), `${JSON.stringify(doc, null, 2)}\n`);
        ok++;
      } catch (err) {
        failed.push(`${api.path}: ${(err as Error).message}`);
      }
    }
  });
  await Promise.all(workers);

  const source = [
    "# Spec source",
    "",
    `- Format: Swagger 1.2 (Canvas \`/doc/api\`)`,
    `- Host: ${host}`,
    `- Fetched: ${new Date().toISOString()}`,
    `- Resources: ${ok} of ${index.apis.length}`,
    failed.length ? `- Failed: ${failed.join(", ")}` : "",
    "",
    "Regenerate with `pnpm spec:sync`, then `pnpm spec:derive`.",
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  await writeFile(path.resolve(outDir, "../SOURCE.md"), source);
  console.log(`fetched ${ok}/${index.apis.length}; failed: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
