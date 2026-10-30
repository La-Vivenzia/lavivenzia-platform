/**
 * Cross-component signal: "show this journey". The taste finder dispatches it,
 * every mounted `JourneyArcView` listens.
 *
 * A window event rather than shared state because the mobile and desktop home
 * trees are rendered side by side and swapped by CSS — each holds its own arc,
 * and both should follow the traveller's match.
 *
 * A plain module, not a `"use client"` one, so the constant is a real string on
 * both sides of the boundary (tests/unit/client-boundary.test.ts).
 */
export const JOURNEY_SELECT_EVENT = "lv:journey-select";

export function selectJourney(journeyId: string): void {
  window.dispatchEvent(new CustomEvent<string>(JOURNEY_SELECT_EVENT, { detail: journeyId }));
}
