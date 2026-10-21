import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards a defect that shipped once and was invisible in review and in tests.
 *
 * A `"use client"` module is not an ordinary module. Everything it exports
 * crosses the React Server Components boundary, and across that boundary a
 * non-component export arrives as a **client-reference proxy** rather than as
 * the value itself. A server component that imports an exported array from one
 * and calls `.filter` on it fails at request time with
 * `X.filter is not a function` — a message that names neither the file, the
 * import, nor the boundary that caused it.
 *
 * Nothing catches this earlier. It type-checks, because TypeScript sees a
 * perfectly good array. It lints clean. Every component test passes, because
 * each component is correct in isolation. It only appears when a real request
 * renders a real page — which is how it was found, on `/experiences`, after the
 * whole suite was green.
 *
 * The rule this asserts: **a `"use client"` module may export components and
 * hooks; plain data belongs in a module with no directive.** Shared constants
 * go in the domain or a plain module, which both sides may import freely.
 */

const SRC = join(process.cwd(), "src");

/** Source files, excluding generated Prisma output. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      return entry === "generated" ? [] : sourceFiles(path);
    }

    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

function isClientModule(source: string): boolean {
  // The directive must be the first statement, so only the opening bytes matter.
  return /^\s*(["'])use client\1/.test(source);
}

/**
 * Names a `"use client"` module exports that are not components or hooks.
 *
 * A component is PascalCase and a hook is `use`-prefixed; both are legitimate
 * things to export across the boundary. Anything else is data. Types are erased
 * at compile time and never cross anything, so `export type` and
 * `export interface` are excluded.
 */
function dataExports(source: string): string[] {
  const names: string[] = [];
  const pattern = /^export\s+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm;

  for (const match of source.matchAll(pattern)) {
    const name = match[1]!;
    const isComponent = /^[A-Z]/.test(name) && !/^[A-Z_]+$/.test(name);
    const isHook = /^use[A-Z]/.test(name);

    if (!isComponent && !isHook) names.push(name);
  }

  return names;
}

describe("the client boundary", () => {
  const files = sourceFiles(SRC);
  const clientModules = files.filter((file) => isClientModule(readFileSync(file, "utf8")));

  it("finds the client modules it is meant to check", () => {
    // A guard on the guard: a broken directive check would silently pass.
    expect(clientModules.length).toBeGreaterThan(3);
  });

  it("exports no plain data from a client module", () => {
    const offenders = clientModules
      .map((file) => ({
        file: relative(process.cwd(), file),
        exports: dataExports(readFileSync(file, "utf8")),
      }))
      .filter((entry) => entry.exports.length > 0);

    expect(offenders).toEqual([]);
  });

  it("still detects the arrangement it is meant to catch", () => {
    // The exact shape that broke `/experiences`: a constant array exported from
    // a module carrying the client directive.
    const broken = ['"use client";', "", "export const RADIUS_CHOICES_KM = [5, 10, 25];"].join(
      "\n",
    );

    expect(isClientModule(broken)).toBe(true);
    expect(dataExports(broken)).toEqual(["RADIUS_CHOICES_KM"]);
  });

  it("does not object to components or hooks", () => {
    const fine = [
      '"use client";',
      "",
      "export function LocationField() { return null; }",
      "export function useThing() { return 1; }",
    ].join("\n");

    expect(dataExports(fine)).toEqual([]);
  });
});
