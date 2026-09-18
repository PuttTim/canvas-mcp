import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildServer } from "../server.ts";
import { contextFromEnv } from "./env.ts";

/** Local single-user server over stdio. Config comes from the environment. */
export function startStdio(env: NodeJS.ProcessEnv = process.env) {
  const ctx = contextFromEnv(env);
  return serveStdio(() => buildServer(ctx), {
    onerror: (err) => console.error(`[canvas-mcp] ${err.message}`),
  });
}
