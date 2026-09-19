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
- M2 (deployed): 98 new student tools across assignments, submissions, grades,
  modules, pages, announcements, discussions, files, calendar, planner and conversations.
  The catalogue now has 117 tools before safety filtering.
- M3: quizzes, groups, people, outcomes, bookmarks, generic API tools and further safety
  hardening. Next.

## Connect a client to the hosted server

The [live tool catalogue](https://canvas-mcp.putt.workers.dev/) lists this deployment's
tools, descriptions, and every required OAuth scope. Search by name/description or filter
by toolset and permission. Read tools need `canvas:read`; mutations also need
`canvas:write`, with `canvas:destructive` or `canvas:submit` where shown. These are MCP
permissions; Canvas still enforces your course and file access.

The page is generated directly from `allTools` and `CANVAS_MCP_TOOLSETS`, not a manually
maintained list. Register a new tool with its `kind` and optional `feature`, then deploy:
the page updates with the running build. Scope-mapping tests keep the catalogue aligned
with the actual access gates. No login, Canvas requests, or JavaScript is needed to browse it.

If a client is given the homepage URL without `/mcp`, MCP-style requests to `/` receive
a same-origin `307` redirect to `/mcp`, preserving their method, body, and query string.
This covers POST/DELETE, JSON or event-stream Accept headers, MCP protocol/session
headers, and bearer-authenticated requests. Ordinary browser visits still show the
catalogue. `/mcp` remains the recommended connector URL, especially for clients that
do not follow redirects or keep the original URL for strict OAuth resource validation
(the current TypeScript MCP SDK does the latter). The normal OAuth checks still apply
after the redirect; the canonical protected resource remains `/mcp`.

Add `https://canvas-mcp.putt.workers.dev/mcp` as a remote MCP server in your client
(Claude: Customize → Connectors → + → Add custom connector). The client will open a consent
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
token in Canvas or disconnecting the connector. During file uploads, file bytes are sent
to the signed storage URL returned by Canvas; the Canvas token is never sent to that URL.

## Test the MCP

### On a website: Claude

1. Open [Claude's connectors page](https://claude.ai/settings/connectors) and add a custom
   connector named **Canvas**, with URL `https://canvas-mcp.putt.workers.dev/mcp`.
2. Leave optional OAuth client ID/secret fields blank; this server supports automatic
   client registration. Connect and enter your Canvas URL/token on the consent page.
3. For a first read-only test, uncheck **Make changes**, **Allow deletions**, and
   **Allow submitting**.
4. Enable Canvas in a chat and ask: “Use Canvas to identify my account and list my courses.”
   This exercises `canvas_me` and `canvas_courses_list` on the hosted server.

See [Claude's custom connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
Claude's remote connector reaches the server from the cloud, so a localhost URL must
be tested with a local MCP client such as Inspector.

### Browser debugging: MCP Inspector

The [official MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) runs a
browser UI on your machine. With Node 22.19 or later:

```bash
npx @modelcontextprotocol/inspector --server-url https://canvas-mcp.putt.workers.dev/mcp --transport http
```

Open the session URL printed by Inspector. Connect using **Streamable HTTP**, finish the
OAuth consent flow, then list tools and call `canvas_me` with `{}` and
`canvas_courses_list` with `{}`. Use OAuth for `/mcp`: its bearer is an MCP access token,
not your raw Canvas personal token. A direct unauthenticated request returning **401**
with `WWW-Authenticate` is expected.

To test **local changes** before deploying, start `pnpm dev` using the local setup below, then run:

```bash
npx @modelcontextprotocol/inspector --server-url http://127.0.0.1:8787/mcp --transport http
```

After connecting, try these read tools using IDs from your own account:

| Tool | Example arguments |
|---|---|
| `canvas_planner_items_list` | `{"start_date":"2026-09-19","end_date":"2026-09-26"}` |
| `canvas_assignments_list` | `{"course_id":123,"bucket":"upcoming"}` |
| `canvas_assignments_get` | `{"course_id":123,"assignment_id":456}` |
| `canvas_conversations_list` | `{"scope":"unread"}` |
| `canvas_conversations_get` | `{"conversation_id":789}` |

Replace the sample dates/IDs. Lists return `next_page_url`; pass it as `page_url` to
continue, or set bounded `max_pages` (up to 20). Reading a conversation does not mark it
read. Enable **Make changes** to test a write preview, for example
`canvas_planner_note_create` with
`{"title":"Test note","todo_date":"2026-09-26","dry_run":true}`. A preview makes no
Canvas requests and changes nothing.

### Automated checks (no real Canvas account needed)

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
```

Tests cover every M2 tool with fixtures, request payloads, write previews, pagination,
Markdown projections, upload redirects/token isolation, and the MCP workflow for due
items → assignment → text submission → discussion reply → inbox. Workers tests exercise
OAuth consent, instance isolation and submission scope gates against mocked Canvas.
They do not establish a successful real Claude login or real institution write behavior.

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

Every mutation supports `dry_run: true`. Assignment submission additionally requires
the `submit` feature/scope and `confirmed: true` after the user approves the exact payload;
client elicitation is still scheduled for M3. A dry run does not submit anything:

```json
{
  "course_id": 123,
  "assignment_id": 456,
  "submission": { "submission_type": "online_text_entry", "body": "<p>My answer</p>" },
  "dry_run": true
}
```

The submission tool also accepts `online_url`, `online_upload` (file IDs), and
`media_recording`, each with its required fields. Upload tools accept `name`,
`content_type` and `content_base64` (at most **5 MiB** decoded). They buffer that bounded
JSON payload and use Canvas's multipart upload/confirmation flow; larger files should be
uploaded through Canvas. Uploading does **not** submit an assignment. Duplicate filenames
are renamed instead of overwritten.

Writes are not automatically retried after network/server errors. Check Canvas before
retrying an ambiguous failure to avoid duplicate messages, posts or submissions. Canvas
still enforces course permissions; student page edits, peer reviews and other optional
features may be unavailable at your institution.

## Spec pipeline

```bash
pnpm spec:sync      # snapshot Canvas's Swagger 1.2 docs from a live host into spec/swagger12/
pnpm spec:derive    # → spec/endpoints.json + spec/models.json
pnpm gen:types      # → src/canvas/types.gen.ts
pnpm test           # includes the contract test: every service path must be documented
```

`spec/overrides.json` records source-linked corrections where the Swagger operation list
omits an endpoint that the accompanying Canvas documentation explicitly describes
(currently DELETE for marking a module item not done). The original manifest is preserved.

## Development

```bash
pnpm lint && pnpm typecheck && pnpm test
```

License: MIT.
