import { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "./context.ts";
import { allTools } from "./tools/index.ts";
import { registerTools } from "./tools/registry.ts";

export const SERVER_INFO = { name: "canvas-mcp", version: "0.1.0" } as const;

const INSTRUCTIONS = `Tools for a student's own Canvas LMS account. Start with canvas_me to confirm the connection, canvas_courses_list to find course ids, then course-scoped tools. List tools return at most one page by default; pass next_page_url back as page_url to continue. Tools that change data are annotated; destructive ones are only available when enabled for this connection.`;

export function buildServer(ctx: ServerContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, ctx, allTools);
  return server;
}
