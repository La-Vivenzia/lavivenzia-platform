import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Unit suite only. Integration tests live in tests/integration and need a
    // live database; they run via vitest.integration.config.mts. Keeping them
    // out is what lets `npm test` prove the domain layer needs no infrastructure.
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "dist/**", "tests/integration/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/modules/**", "src/lib/**", "src/ports/**"],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
