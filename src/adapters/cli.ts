#!/usr/bin/env node
import { parseArgs } from "node:util";
import { users } from "../canvas/services/users.ts";
import { allTools } from "../tools/index.ts";
import { annotationsFor, isEnabled } from "../tools/registry.ts";
import { contextFromEnv } from "./env.ts";
import { startStdio } from "./stdio.ts";

const USAGE = `canvas-mcp <command>

Commands:
  stdio     Run the MCP server over stdio (needs CANVAS_BASE_URL and CANVAS_TOKEN)
  tools     Print the tool catalogue as JSON (respects toolset/safety env vars)
  doctor    Check the token against Canvas and print who you are

Environment:
  CANVAS_BASE_URL             https://school.instructure.com
  CANVAS_TOKEN                personal access token
  CANVAS_MCP_TOOLSETS         default | all | comma list (me,courses,…)
  CANVAS_MCP_READ_ONLY        1 to expose only read tools
  CANVAS_MCP_ALLOW_DESTRUCTIVE 1 to expose delete/remove tools
  CANVAS_MCP_FEATURES         comma list of feature flags (submit)
`;

async function main() {
  const { positionals } = parseArgs({ allowPositionals: true, strict: false });
  const cmd = positionals[0];
  switch (cmd) {
    case "stdio":
      startStdio();
      return;
    case "tools": {
      const env = {
        ...process.env,
        CANVAS_BASE_URL: process.env.CANVAS_BASE_URL ?? "https://example.instructure.com",
        CANVAS_TOKEN: process.env.CANVAS_TOKEN ?? "x",
      };
      const ctx = contextFromEnv(env);
      const list = allTools.map((t) => ({
        name: t.name,
        toolset: t.toolset,
        kind: t.kind,
        feature: t.feature,
        enabled: isEnabled(t, ctx),
        annotations: annotationsFor(t),
        description: t.description,
      }));
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    case "doctor": {
      const ctx = contextFromEnv(process.env);
      const me = await users.self(ctx.canvas);
      console.log(
        `OK: ${ctx.canvas.baseUrl} as ${me.data.name} (id ${me.data.id}); rate-limit remaining ${me.remaining ?? "?"}`,
      );
      return;
    }
    default:
      console.error(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
