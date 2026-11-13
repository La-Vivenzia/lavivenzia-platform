import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { safeNextPath, signInHref } from "@/lib/destinations";

const SRC = join(process.cwd(), "src");

describe("safeNextPath", () => {
  it("keeps same-origin paths, query included", () => {
    expect(safeNextPath("/profile")).toBe("/profile");
    expect(safeNextPath("/experiences/tea?slot=abc&guests=2")).toBe(
      "/experiences/tea?slot=abc&guests=2",
    );
  });

  it("refuses anything a browser would take off-site", () => {
    for (const raw of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/foo\\bar",
      "javascript:alert(1)",
      "/\tfoo",
      "profile",
      "",
      null,
      undefined,
      `/${"a".repeat(2048)}`,
    ]) {
      expect(safeNextPath(raw)).toBeNull();
    }
  });

  it("round-trips through the sign-in URL", () => {
    const next = "/journeys/x?map=1";
    const url = new URL(signInHref(next), "https://lavivenzia.test");
    expect(url.pathname).toBe("/sign-in");
    expect(safeNextPath(url.searchParams.get("next"))).toBe(next);
  });
});

describe("transaction endpoints", () => {
  // Browsing is public; reserving is not. The buttons only decide what is
  // offered, so the gate that matters is the route refusing anonymous calls.
  it.each([
    ["app/api/v1/experiences/[slug]/checkout/route.ts"],
    ["app/api/v1/experiences/[slug]/checkout/confirm/route.ts"],
    ["app/api/v1/journeys/[id]/pass/route.ts"],
  ])("%s requires a signed-in principal", (file) => {
    expect(readFileSync(join(SRC, file), "utf8")).toContain("await requirePrincipal()");
  });
});
