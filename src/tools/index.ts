import { courseTools } from "./courses.ts";
import { meTools } from "./me.ts";
import type { ToolDef } from "./registry.ts";

/** Every tool the server knows about, in registration order. Filtering happens in registerTools. */
export const allTools: readonly ToolDef[] = [...meTools, ...courseTools];
