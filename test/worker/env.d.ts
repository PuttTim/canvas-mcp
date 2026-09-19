import type { ThrottleDurableObject } from "../../src/state/throttle-do.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      OAUTH_KV: KVNamespace;
      THROTTLE: DurableObjectNamespace<ThrottleDurableObject>;
      PROPS_KEY: string;
      ALLOW_DIRECT_BEARER?: string;
    }
  }
}
