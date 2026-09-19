import { ALL_SCOPES, SCOPES } from "../auth/grant.ts";
import { type EnvConfig, parseToolsets } from "../context.ts";
import { allTools } from "../tools/index.ts";
import { requiredScopesForTool, type ToolDef } from "../tools/registry.ts";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

type CatalogueEnv = Pick<EnvConfig, "CANVAS_MCP_TOOLSETS">;

/** Derived from the actual registry and the same deployment toolset config as /mcp. */
export function toolCatalogue(env: CatalogueEnv, definitions: readonly ToolDef[] = allTools) {
  const toolsets = parseToolsets(env.CANVAS_MCP_TOOLSETS);
  return definitions
    .filter((tool) => toolsets.has(tool.toolset))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      toolset: tool.toolset,
      kind: tool.kind,
      requiredScopes: requiredScopesForTool(tool),
    }));
}

const styles = `
*{box-sizing:border-box}body{font:16px/1.55 system-ui,sans-serif;color:#202124;background:#fff;margin:0}
main{max-width:72rem;margin:3rem auto;padding:0 1.5rem 3rem}h1{font-size:1.75rem;line-height:1.2;margin:0 0 1rem}
h2{font-size:1.3rem;margin:2rem 0 .75rem}h3{font-size:1.1rem;margin:0}h4{font-size:.9rem;margin:0}
p{margin:.6rem 0}a{color:#145a9c;text-underline-offset:3px}a:hover{color:#0b3761}code{font-size:.88em;background:#f2f3f4;border-radius:3px;padding:.12rem .3rem;overflow-wrap:anywhere}
.intro{max-width:49rem}.muted{color:#5e6268;font-size:.9rem}.endpoint{display:block;padding:.8rem 1rem;background:#f6f7f8;border:1px solid #ddd;border-radius:5px;overflow-wrap:anywhere}
.endpoint code{background:none;padding:0}.stats{border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:.85rem 0;margin:1.5rem 0;display:flex;gap:.6rem 1.8rem;flex-wrap:wrap}
.stats span{white-space:nowrap}.legend{display:grid;grid-template-columns:10.5rem 1fr;gap:.6rem 1rem;margin:1rem 0}.legend dt,.legend dd{margin:0}
.filters{display:grid;grid-template-columns:minmax(10rem,2fr) minmax(9rem,1fr) minmax(12rem,1.3fr) auto;gap:.8rem;align-items:end;margin:1.25rem 0}
label{display:block;font-size:.9rem;font-weight:600;margin-bottom:.3rem}input,select,button{font:inherit;min-height:2.7rem;border:1px solid #b7bbc0;border-radius:4px;padding:.45rem .65rem;width:100%;background:#fff;color:inherit}
button{background:#202124;color:white;border-color:#202124;cursor:pointer;padding-inline:1.1rem}input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #8ab4f8;outline-offset:3px}
.results{display:flex;gap:1rem;justify-content:space-between;align-items:baseline;margin:1rem 0}.group{margin:1.75rem 0}.group-header{display:flex;align-items:baseline;gap:.75rem;border-bottom:2px solid #30343a;padding-bottom:.5rem}
.tool{display:grid;grid-template-columns:minmax(0,1fr) 18rem;gap:1.5rem;padding:1.1rem 0;border-bottom:1px solid #e2e4e7}.tool p{font-size:.92rem;margin:.45rem 0 0}.tool h4 a{color:inherit;text-decoration:none}.tool h4 a:hover{text-decoration:underline}
.tool h4 code{background:none;padding:0;font-size:1em}.scope-list{list-style:none;display:flex;flex-wrap:wrap;gap:.3rem;margin:.4rem 0 0;padding:0}.scope-list code{font-size:.8rem;white-space:nowrap}.kind{font-size:.75rem;font-weight:650;text-transform:uppercase;letter-spacing:.04em;color:#52565c}
.empty{padding:2rem 0;border-top:1px solid #ddd}footer{border-top:1px solid #ddd;margin-top:2rem;padding-top:1rem}
@media(max-width:760px){main{margin-top:1.75rem;padding-inline:1rem}.filters{grid-template-columns:1fr 1fr}.search{grid-column:1/-1}.filters button{grid-column:1/-1}.tool{grid-template-columns:1fr;gap:.65rem}.legend{grid-template-columns:1fr;gap:.2rem}.legend dd{margin-bottom:.6rem}.stats{gap:.4rem 1rem}}
@media(max-width:420px){.filters{grid-template-columns:1fr}.results{align-items:flex-start}.stats{font-size:.9rem}}
`;

const scopeFilters = [
  ["", "All permissions"],
  [SCOPES.read, "Read only"],
  [SCOPES.write, "Requires write"],
  [SCOPES.destructive, "Requires destructive"],
  [SCOPES.submit, "Requires submit"],
] as const;

export function handleLanding(request: Request, env: CatalogueEnv): Response {
  const catalogue = toolCatalogue(env);
  const groups = [...new Set(catalogue.map((tool) => tool.toolset))];
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const requestedGroup = url.searchParams.get("toolset") ?? "";
  const group = groups.find((value) => value === requestedGroup) ?? "";
  const requestedScope = url.searchParams.get("scope") ?? "";
  const scope = ALL_SCOPES.find((value) => value === requestedScope) ?? "";
  const matches = catalogue.filter(
    (tool) =>
      (!group || tool.toolset === group) &&
      (!scope ||
        (scope === SCOPES.read
          ? tool.requiredScopes.length === 1
          : tool.requiredScopes.some((value) => value === scope))) &&
      `${tool.name} ${tool.description} ${tool.toolset} ${tool.requiredScopes.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const readCount = catalogue.filter((tool) => tool.kind === "read").length;
  const options = (items: ReadonlyArray<readonly [string, string]>, selected: string) =>
    items
      .map(
        ([value, label]) =>
          `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`,
      )
      .join("");
  const sections = groups
    .map((toolset) => {
      const tools = matches.filter((tool) => tool.toolset === toolset);
      if (!tools.length) return "";
      return `<section class="group" aria-labelledby="group-${escapeHtml(toolset)}">
<div class="group-header"><h3 id="group-${escapeHtml(toolset)}">${escapeHtml(toolset)}</h3><span class="muted">${tools.length} tools</span></div>
${tools
  .map(
    (
      tool,
    ) => `<article class="tool" id="${escapeHtml(tool.name)}" data-tool="${escapeHtml(tool.name)}">
<div><h4><a href="#${escapeHtml(tool.name)}"><code>${escapeHtml(tool.name)}</code></a></h4><p>${escapeHtml(tool.description)}</p></div>
<div><span class="kind">${tool.kind === "read" ? "Read" : tool.kind === "write" ? "Write" : "Destructive"}</span>
<ul class="scope-list" aria-label="Required scopes">${tool.requiredScopes.map((value) => `<li><code>${escapeHtml(value)}</code></li>`).join("")}</ul></div>
</article>`,
  )
  .join("")}
</section>`;
    })
    .join("");
  const disabledCount = allTools.length - catalogue.length;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas MCP — tools &amp; permissions</title><style>${styles}</style></head>
<body><main>
<header class="intro"><h1>Canvas MCP</h1>
<p>A Model Context Protocol server for your own Canvas LMS account. Add this endpoint to your MCP client, then connect with your Canvas URL and personal access token.</p>
<p class="endpoint"><code>${escapeHtml(url.origin)}/mcp</code></p>
<p class="muted">Your Canvas token is stored encrypted and only sent to your Canvas instance. Revoke it in Canvas → Account → Settings → Approved Integrations.</p></header>
<div class="stats" aria-label="Deployment catalogue totals"><span><strong>${catalogue.length}</strong> tools available</span><span><strong>${groups.length}</strong> toolsets</span><span><strong>${readCount}</strong> read tools</span><span><strong>${catalogue.length - readCount}</strong> mutation tools</span></div>
<section aria-labelledby="permissions"><h2 id="permissions">Permissions</h2>
<p>Each tool lists <strong>all</strong> the scopes your connection needs. These are this MCP server’s permissions, not a guarantee of access in Canvas; course and file restrictions still apply.</p>
<dl class="legend">
<dt><code>canvas:read</code></dt><dd>Read data. Included in every connection.</dd>
<dt><code>canvas:write</code></dt><dd>Make changes. Enable “Make changes on my behalf” when connecting.</dd>
<dt><code>canvas:destructive</code></dt><dd>Delete or remove data. Enable “Allow deletions” <strong>and</strong> “Make changes”.</dd>
<dt><code>canvas:submit</code></dt><dd>Submit academic work. Enable “Allow submitting” <strong>and</strong> “Make changes”. Assignment submissions also require explicit confirmation.</dd>
</dl><p class="muted">Write tools support <code>dry_run</code>, but previews require the same scopes. This public catalogue shows deployment capabilities, not your current connection’s permissions.</p></section>
<section aria-labelledby="tools"><h2 id="tools">Available tools</h2>
<p class="muted">Generated from the running server’s tool registry and enabled toolsets. New tools appear here when their code is deployed; no separate list to maintain.${disabledCount ? ` ${disabledCount} tools in this build are disabled by deployment configuration and are not listed.` : ""}</p>
<form class="filters" method="get" action="/#tools" role="search">
<div class="search"><label for="q">Search tools</label><input id="q" name="q" type="search" maxlength="200" value="${escapeHtml(query)}" placeholder="Name, description or scope"></div>
<div><label for="toolset">Toolset</label><select id="toolset" name="toolset">${options([["", "All toolsets"], ...groups.map((value) => [value, value] as const)], group)}</select></div>
<div><label for="scope">Permission filter</label><select id="scope" name="scope">${options(scopeFilters, scope)}</select></div>
<button type="submit">Filter tools</button></form>
<div class="results"><p id="result-count">Showing <strong>${matches.length}</strong> of ${catalogue.length} tools</p><a href="/#tools">Reset filters</a></div>
${sections || '<p class="empty">No tools match these filters. Try a different search or reset the filters.</p>'}
</section><footer class="muted">This page does not access your Canvas account or call any tools. File tools return metadata and download URLs; they do not extract document contents.</footer>
</main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    },
  });
}
