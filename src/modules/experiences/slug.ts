import { randomBytes } from "node:crypto";

/**
 * Public slugs for experiences.
 *
 * A slug is generated once, at creation, and never regenerated when the title
 * changes. That is deliberate: the slug is the public URL, and silently
 * changing it breaks every shared link, every bookmark and every search-engine
 * record pointing at the listing.
 */

export const SLUG_MAX_LENGTH = 80;

/**
 * Turn a title into a URL-safe slug.
 *
 * Diacritics are decomposed and stripped rather than dropped, so "Café" becomes
 * "cafe" instead of "caf" — Indian and European experience names carry accents
 * routinely and losing the letter mangles the word.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    // Strip the combining marks left behind by the decomposition above. Written
    // as escapes rather than literal marks, which are invisible in a diff.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    // Slicing can leave a trailing hyphen where the cut landed mid-word.
    .replace(/-+$/g, "");

  return slug;
}

/** Short random suffix used to break a collision. */
export function slugSuffix(): string {
  return randomBytes(3).toString("hex");
}

/**
 * A slug that is not already taken.
 *
 * Tries the plain slug first, then appends a random suffix. Bounded rather than
 * looping forever: with a 6-hex-character suffix, five collisions in a row
 * means something is wrong with the caller, not with luck.
 *
 * This narrows the race but does not close it — two concurrent creations can
 * both see a slug as free. The unique constraint on the column is what actually
 * settles it, and the service retries on that conflict.
 */
export async function buildAvailableSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
  attempts = 5,
): Promise<string> {
  // A title of only punctuation or non-Latin script slugifies to nothing. Fall
  // back to a random identifier rather than creating a row with an empty slug.
  const base = slugify(title) || "experience";

  if (!(await isTaken(base))) return base;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - 7)}-${slugSuffix()}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error("Could not allocate a unique slug after repeated attempts.");
}
