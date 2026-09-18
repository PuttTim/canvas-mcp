import { defineConfig } from "vitest/config";

// Node-side unit tests (client core, tools, spec contract). Workers-runtime tests
// live under test/worker and get their own config in M1 (@cloudflare/vitest-pool-workers).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/worker/**", "test/integration/**"],
    environment: "node",
  },
});
