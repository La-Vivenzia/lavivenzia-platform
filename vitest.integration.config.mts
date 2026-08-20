import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests — these require a live PostgreSQL.
 *
 * Kept in a separate config from the unit suite on purpose. `npm test` must stay
 * fast and runnable with no infrastructure at all (it is what proves the domain
 * layer is genuinely decoupled), so database-dependent tests never join it.
 *
 * They run against a dedicated database, not the development one, so a test run
 * can truncate tables without destroying local work.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Tests share one database. Running files in parallel would let one file's
    // cleanup truncate another's fixtures mid-assertion.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
