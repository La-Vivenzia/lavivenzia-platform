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
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/modules/**", "src/lib/**", "src/ports/**"],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
