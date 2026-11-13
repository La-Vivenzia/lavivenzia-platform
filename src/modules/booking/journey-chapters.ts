/**
 * Chapter numbering for journeys, shared by the pass, the companion map and
 * the confirmation email. A plain module with no directive, so server and
 * client may both import it (tests/unit/client-boundary.test.ts).
 */

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

/** "I", "II", "III" for a zero-based act index; plain digits past ten. */
export function chapterNumeral(index: number): string {
  return NUMERALS[index] ?? String(index + 1);
}

/** "Ready to Depart · Chapter I Sunset at the Terrace". */
export function departureStatus(firstActTitle: string): string {
  return `Ready to Depart · Chapter I ${firstActTitle}`;
}
