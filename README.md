# canvas-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for Canvas LMS, built for
students first. Bring your own Canvas instance and a personal access token; get a wide,
safety-annotated set of tools for courses, assignments, grades, modules, discussions, files,
calendar, inbox, and more.

Primary deployment target is Cloudflare Workers. A local stdio mode is included.
See [PLAN.md](./PLAN.md) for the design and roadmap.

## Status

M0 (foundation) is done: client core, spec pipeline, `me` and `courses` toolsets, stdio and
Workers adapters (bearer passthrough). M1 adds the hosted consent flow; M2 adds the rest of
the student toolsets.

## Local use (stdio)

```bash
pnpm install
export CANVAS_BASE_URL=https://your-school.instructure.com
export CANVAS_TOKEN=...            # Canvas → Account → Settings → New Access Token
pnpm stdio                         # or: npx tsx src/adapters/cli.ts stdio
```

Claude Code:

```bash
claude mcp add canvas -e CANVAS_BASE_URL=https://your-school.instructure.com -e CANVAS_TOKEN=... -- npx tsx /path/to/canvas-mcp/src/adapters/cli.ts stdio
```

Other commands:

```bash
npx tsx src/adapters/cli.ts doctor   # verify the token and print who you are
npx tsx src/adapters/cli.ts tools    # print the tool catalogue with annotations
```

## Cloudflare Workers (dev)

```bash
pnpm dev                             # wrangler dev → http://127.0.0.1:8787/mcp
```

Until the consent flow lands (M1), clients authenticate with headers:

```
Authorization: Bearer <canvas personal access token>
X-Canvas-Base-URL: https://your-school.instructure.com
```

## Configuration

| Variable | Meaning |
|---|---|
| `CANVAS_BASE_URL` | Canvas instance, e.g. `https://school.instructure.com` |
| `CANVAS_TOKEN` | Personal access token (stdio / Node only) |
| `CANVAS_MCP_TOOLSETS` | `default` (everything except `api`), `all`, or a comma list |
| `CANVAS_MCP_READ_ONLY` | `1` to expose only read tools |
| `CANVAS_MCP_ALLOW_DESTRUCTIVE` | `1` to expose delete/remove/leave tools |
| `CANVAS_MCP_FEATURES` | Comma list of opt-in features (`submit`) |

## Safety model

Every tool is classified `read`, `write`, or `irreversible`, which sets the MCP annotations
(`readOnlyHint`, `destructiveHint`, `idempotentHint`). Irreversible tools are hidden unless
destructive operations are enabled. Tools that submit academic work are behind the `submit`
feature flag. Tool names are stable (`canvas_<resource>_<verb>`) so hosts can write exact
allow/deny rules.

## Spec pipeline

```bash
pnpm spec:sync      # snapshot Canvas's Swagger 1.2 docs from a live host into spec/swagger12/
pnpm spec:derive    # → spec/endpoints.json + spec/models.json
pnpm gen:types      # → src/canvas/types.gen.ts
pnpm test           # includes the contract test: every service path must be documented
```

## Development

```bash
pnpm lint && pnpm typecheck && pnpm test
```

License: MIT.
