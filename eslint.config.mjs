import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * Architectural boundary (ADR-0002).
 *
 * `src/modules` (domain logic) and `src/ports` (provider interfaces the domain
 * owns) must stay framework-independent, so that extracting a standalone API
 * service later is mechanical rather than a rewrite. These layers may not import
 * Next.js, React, or any outward layer (`app`, `components`, `adapters`).
 *
 * This is enforced by lint rather than convention — the boundary is the whole
 * reason the single-deployable topology was acceptable in the first place.
 */
const domainBoundary = {
  files: ["src/modules/**/*.ts", "src/ports/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "next", message: "Domain layer must not depend on Next.js." },
          { name: "react", message: "Domain layer must not depend on React." },
          { name: "server-only", message: "Domain layer must stay runtime-agnostic." },
        ],
        patterns: [
          {
            group: ["next/*", "next/**"],
            message: "Domain layer must not depend on Next.js.",
          },
          {
            group: ["@/app/*", "@/components/*", "@/adapters/*"],
            message:
              "Domain layer must not depend on outward layers. Depend on a port in src/ports instead.",
          },
        ],
      },
    ],
  },
};

/** Adapters implement ports; they must not reach back into HTTP or UI layers. */
const adapterBoundary = {
  files: ["src/adapters/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/app/*", "@/components/*"],
            message: "Adapters must not depend on the HTTP or UI layer.",
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "src/generated/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "prefer-const": "error",
    },
  },
  domainBoundary,
  adapterBoundary,
  {
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: { "no-console": "off" },
  },
  {
    // CLI scripts exist to print. They run under the Prisma CLI or `tsx`, not
    // inside a request, so the structured logger's correlation context does not
    // apply and stdout is the correct output channel.
    files: ["scripts/**/*.ts", "prisma/*.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
);
