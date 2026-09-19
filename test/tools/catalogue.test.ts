import { describe, expect, it } from "vitest";
import { handleLanding, toolCatalogue } from "../../src/adapters/landing.ts";
import { ALL_SCOPES, SCOPES, safetyFromScopes } from "../../src/auth/grant.ts";
import { CanvasClient } from "../../src/canvas/client.ts";
import { parseToolsets } from "../../src/context.ts";
import { allTools } from "../../src/tools/index.ts";
import { isEnabled, requiredScopesForTool } from "../../src/tools/registry.ts";

const request = (query = "") => new Request(`https://canvas-mcp.test/${query}`);
const rows = (html: string) => [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);

describe("tool catalogue", () => {
  it("derives every tool and its scopes from the registry", () => {
    const catalogue = toolCatalogue({});
    expect(catalogue.map((tool) => tool.name)).toEqual(allTools.map((tool) => tool.name));
    for (const tool of allTools) {
      expect(catalogue.find((item) => item.name === tool.name)).toMatchObject({
        description: tool.description,
        toolset: tool.toolset,
        requiredScopes: requiredScopesForTool(tool),
      });
    }
  });

  it("automatically includes a newly registered tool without a second catalogue definition", () => {
    const first = allTools[0];
    if (!first) throw new Error("Expected a registered tool");
    const added = { ...first, name: "canvas_me_new_tool", description: "A future tool" };
    const catalogue = toolCatalogue({}, [...allTools, added]);
    expect(catalogue.at(-1)).toMatchObject({ name: added.name, description: added.description });
    expect(catalogue).toHaveLength(allTools.length + 1);
  });

  it("honours the same deployment toolset filter as the protected route", async () => {
    const env = { CANVAS_MCP_TOOLSETS: "files,me" };
    expect(toolCatalogue(env).every((tool) => ["files", "me"].includes(tool.toolset))).toBe(true);
    const html = await handleLanding(request(), env).text();
    expect(rows(html)).toEqual(toolCatalogue(env).map((tool) => tool.name));
    expect(html).toContain("disabled by deployment configuration");
    expect(html).not.toContain('data-tool="canvas_courses_list"');
  });

  it("documents exactly the scopes that enable every tool, for every valid scope combination", () => {
    const optional = ALL_SCOPES.filter((scope) => scope !== SCOPES.read);
    const canvas = new CanvasClient({ baseUrl: "https://school.instructure.com", token: "unused" });
    for (let mask = 0; mask < 2 ** optional.length; mask++) {
      const scopes: string[] = [SCOPES.read, ...optional.filter((_, i) => mask & (1 << i))];
      const ctx = { canvas, toolsets: parseToolsets("all"), ...safetyFromScopes(scopes) };
      for (const tool of allTools) {
        expect(
          requiredScopesForTool(tool).every((scope) => scopes.includes(scope)),
          `${tool.name} with ${scopes.join(",")}`,
        ).toBe(isEnabled(tool, ctx));
      }
    }
  });

  it("shows read + write + the extra opt-in scope for destructive and submit tools", () => {
    const catalogue = toolCatalogue({});
    expect(
      catalogue.find((tool) => tool.name === "canvas_files_file_delete")?.requiredScopes,
    ).toEqual([SCOPES.read, SCOPES.write, SCOPES.destructive]);
    expect(
      catalogue.find((tool) => tool.name === "canvas_submissions_submit")?.requiredScopes,
    ).toEqual([SCOPES.read, SCOPES.write, SCOPES.submit]);
  });
});

describe("public landing page", () => {
  it("renders all available tools without credentials or JavaScript", async () => {
    const response = handleLanding(request(), {});
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(rows(html).sort()).toEqual(allTools.map((tool) => tool.name).sort());
    expect(html).toContain(
      `Showing <strong>${allTools.length}</strong> of ${allTools.length} tools`,
    );
    expect(html).toContain("https://canvas-mcp.test/mcp");
    expect(html).not.toContain("<script");
    expect(html).toContain("not your current connection’s permissions");
  });

  it("combines a case-insensitive search with toolset and permission filters", async () => {
    const html = await handleLanding(
      request("?q=FILE&toolset=files&scope=canvas%3Adestructive"),
      {},
    ).text();
    expect(rows(html).sort()).toEqual(["canvas_files_file_delete", "canvas_files_folder_delete"]);
    expect(html).toContain('value="files" selected');
    expect(html).toContain('value="canvas:destructive" selected');
  });

  it("distinguishes read-only tools from mutations that also require the read scope", async () => {
    const html = await handleLanding(request("?scope=canvas%3Aread"), {}).text();
    expect(rows(html).sort()).toEqual(
      allTools
        .filter((tool) => tool.kind === "read")
        .map((tool) => tool.name)
        .sort(),
    );
    expect(html).not.toContain('data-tool="canvas_files_upload"');
  });

  it("shows the submission gate without hiding it from the public catalogue", async () => {
    const html = await handleLanding(request("?scope=canvas%3Asubmit"), {}).text();
    expect(rows(html)).toEqual(["canvas_submissions_submit"]);
    expect(html).toContain("confirmed=true");
  });

  it("renders an empty state and escapes reflected filter values", async () => {
    const query = '"><script>alert(1)</script>';
    const html = await handleLanding(request(`?q=${encodeURIComponent(query)}`), {}).text();
    expect(rows(html)).toHaveLength(0);
    expect(html).toContain("No tools match these filters");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(html).not.toContain(query);
  });

  it("ignores invalid group/scope values and renders an empty deployment safely", async () => {
    const html = await handleLanding(request("?toolset=unknown&scope=invalid"), {}).text();
    expect(rows(html)).toHaveLength(allTools.length);
    const empty = await handleLanding(request(), { CANVAS_MCP_TOOLSETS: "api" }).text();
    expect(rows(empty)).toHaveLength(0);
    expect(empty).toContain("<strong>0</strong> tools available");
  });
});
