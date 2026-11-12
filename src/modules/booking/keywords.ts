/**
 * The secret host keyword — two words a traveller says at the door instead of
 * fishing for a confirmation email, e.g. "EMERALD BREEZE".
 *
 * Deterministic: the same booking id always yields the same phrase, so a
 * retried request, a reprinted pass and the companion map all agree without
 * storing it. Plain data and arithmetic with no Node imports, so the browser
 * can render the lexicon too.
 *
 * **A courtesy phrase, not a credential.** A hundred combinations identify a
 * party to a host who already expects them; they prove nothing on their own.
 * The pass's signed QR payload is what a host tool should verify.
 */

export const SECRET_KEYWORD_ADJECTIVES = [
  "EMERALD",
  "GOLDEN",
  "SAPPHIRE",
  "VELVET",
  "AMBER",
  "SOLARIS",
  "NOCTURNE",
  "CELESTIAL",
  "IVORY",
  "OBSIDIAN",
] as const;

export const SECRET_KEYWORD_NOUNS = [
  "BREEZE",
  "HORIZON",
  "RESERVE",
  "CANOPY",
  "MEZZANINE",
  "CROWN",
  "HEIRLOOM",
  "VOYAGE",
  "CREST",
  "HARBOR",
] as const;

/** FNV-1a, 32-bit, seeded — two seeds give two independent word choices. */
function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Final avalanche so neighbouring ids do not share a first word.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

/** "EMERALD BREEZE" for a booking id; stable for the same id. */
export function generateSecretKeyword(bookingId: string): string {
  const id = bookingId.trim().toUpperCase();
  if (id.length === 0) throw new Error("generateSecretKeyword needs a booking id");
  const adjective = SECRET_KEYWORD_ADJECTIVES[fnv1a(id, 0x811c9dc5) % 10]!;
  const noun = SECRET_KEYWORD_NOUNS[fnv1a(id, 0x9e3779b9) % 10]!;
  return `${adjective} ${noun}`;
}
