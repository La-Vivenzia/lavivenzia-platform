/**
 * Pure helpers for environment parsing.
 *
 * Kept separate from `src/lib/env.ts` because that module validates on import —
 * a deliberate fail-fast side effect, but one that makes anything living
 * alongside it impossible to unit test without a fully populated environment.
 */

/**
 * Treat an empty variable as absent.
 *
 * A `.env` file written from `.env.example` leaves unused optional variables
 * present but empty (`EMAIL_FROM=`). To Zod that is a set value of `""`, which
 * fails `.optional()` and every format check — so a developer who has not yet
 * configured email cannot boot the app at all. Stripping empties makes
 * "declared but blank" mean the same thing as "not declared", which is what a
 * reader of the file expects.
 *
 * Genuinely required variables still fail, because they fail as missing.
 */
export function withoutEmptyValues(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const entries = Object.entries(source).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "",
  );

  return Object.fromEntries(entries);
}
