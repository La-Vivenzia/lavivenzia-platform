import { describe, expect, it } from "vitest";
import { ENV_FILES } from "@/lib/load-env";

/**
 * Guards a counter-intuitive ordering.
 *
 * `process.loadEnvFile` does not overwrite a variable that is already set — the
 * first value to land wins. So reproducing Next.js precedence (`.env.local`
 * beats `.env`, and a real shell variable beats both) requires loading the
 * most-specific file FIRST, not last.
 *
 * Reversing the list would silently make `.env` win, with no error and no
 * visible symptom until a developer's local override stopped taking effect.
 */
describe("env file precedence", () => {
  it("loads .env.local before .env so the local file wins", () => {
    expect(ENV_FILES.indexOf(".env.local")).toBeLessThan(ENV_FILES.indexOf(".env"));
  });

  it("loads exactly the two expected files", () => {
    expect([...ENV_FILES]).toEqual([".env.local", ".env"]);
  });
});
