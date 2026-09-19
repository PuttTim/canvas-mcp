# canvas-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for Canvas LMS, built for
students first. Bring your own Canvas instance and a personal access token; get a wide,
safety-annotated set of tools for courses, assignments, grades, modules, discussions, files,
calendar, inbox, and more.

Primary deployment target is Cloudflare Workers. A local stdio mode is included.
See [PLAN.md](./PLAN.md) for the design and roadmap.

## Status

- M0 (foundation): client core, spec pipeline, `me` and `courses` toolsets, stdio adapter. Done.
- M1 (hosted): OAuth consent flow on Cloudflare Workers, encrypted token storage, per-token
  throttle Durable Object, deployed at `https://canvas-mcp.putt.workers.dev`. Implemented;
  the real Claude connector login and two-student live flow still need verification.
- M2: the remaining student toolsets. Next.

## Connect a client to the hosted server

Add `https://canvas-mcp.putt.workers.dev/mcp` as a remote MCP server in your client
(Claude: Settings → Connectors → Add custom connector). The client will open a consent
page; paste your Canvas URL and a personal access token (Canvas → Account → Settings →
Approved Integrations → New Access Token) and choose what the connection may do:

| Consent checkbox | OAuth scope | Effect |
|---|---|---|
| Read (always on) | `canvas:read` | Read tools |
| Make changes | `canvas:write` | Write tools (post, reply, upload, notes) |
| Allow deletions | `canvas:destructive` | Delete/remove/leave tools |
| Allow submitting | `canvas:submit` | Assignment submit and quiz complete |

Your Canvas token is verified against your instance before anything is stored, then sealed
with AES-GCM under a Worker secret and stored inside the OAuth grant (which the provider
encrypts again). It is only ever sent to the Canvas host you named. Revoke by deleting the
token in Canvas or disconnecting the connector.

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

## Cloudflare Workers

```bash
cp .dev.vars.example .dev.vars       # set PROPS_KEY (any 32-byte base64url key)
pnpm dev                             # wrangler dev → http://127.0.0.1:8787/mcp
```

With `ALLOW_DIRECT_BEARER=1` in `.dev.vars`, `POST /direct/mcp` accepts
`Authorization: Bearer <canvas token>` plus `X-Canvas-Base-URL` for MCP Inspector and
scripts, bypassing OAuth. It is off in production.

Deploy:

```bash
npx wrangler kv namespace create OAUTH_KV      # once; put the id in wrangler.jsonc
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put PROPS_KEY
pnpm deploy
```

Routes: `/mcp` (protected), `/authorize` (consent), `/oauth/token`, `/oauth/register`,
`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`,
`/health`.

## Configuration

| Variable | Meaning |
|---|---|
| `CANVAS_BASE_URL` | Canvas instance, e.g. `https://school.instructure.com` |
| `CANVAS_TOKEN` | Personal access token (stdio / Node only) |
| `PROPS_KEY` | Worker secret sealing Canvas tokens in grants (Workers only) |
| `ALLOW_DIRECT_BEARER` | `1` enables `/direct/mcp` bearer passthrough (dev only) |
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
