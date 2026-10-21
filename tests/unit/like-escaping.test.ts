import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "@/adapters/persistence/prisma/discovery-repositories";

/**
 * `LIKE` pattern escaping.
 *
 * Binding a value as a parameter stops it being read as SQL. It does **not**
 * stop it being read as a pattern — `%` and `_` keep their wildcard meaning
 * inside the bound string either way. That is a different class of problem from
 * injection, and parameterisation is not the fix for it.
 *
 * Verified against a real query in `tests/integration/discovery.test.ts`; these
 * pin the transformation itself, which is where the escape ordering can go
 * wrong invisibly.
 */

describe("escapeLikePattern", () => {
  it("escapes the per cent wildcard, so a literal per cent can be searched for", () => {
    // "50% off" previously meant "anything, 50, anything, off, anything", and
    // could never match a listing that actually says "50%".
    expect(escapeLikePattern("50% off")).toBe("50\\% off");
  });

  it("escapes the single-character wildcard", () => {
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("escapes backslashes first, so it does not re-escape its own escapes", () => {
    // Getting the order wrong turns a backslash into an escape for the
    // character after it, which changes what the pattern matches rather than
    // failing loudly.
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("hand-block printing")).toBe("hand-block printing");
    expect(escapeLikePattern("")).toBe("");
  });

  it("neutralises a term made only of wildcards", () => {
    // On an unauthenticated endpoint this is the shape that builds a
    // pathological backtracking pattern.
    expect(escapeLikePattern("%%%%%")).toBe("\\%\\%\\%\\%\\%");
  });
});
