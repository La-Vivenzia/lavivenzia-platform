import type { CopilotMood } from "@/modules/copilot/types";

/**
 * Plain data and helpers for the Live Travel Copilot drawer.
 *
 * Kept out of the `"use client"` modules on purpose: a client module may export
 * only components and hooks (see `tests/unit/client-boundary.test.ts`).
 */

export interface PilotHotspot {
  readonly id: string;
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Pune pilot corridor hotspots. Amanora Town Centre is the default when the
 * traveller has not shared a location, or the browser could not provide one.
 */
export const PILOT_HOTSPOTS: readonly PilotHotspot[] = [
  { id: "amanora", label: "Amanora", lat: 18.5195, lng: 73.9312 },
  { id: "seasons", label: "Seasons Mall", lat: 18.5192, lng: 73.9318 },
  { id: "magarpatta", label: "Magarpatta Cybercity", lat: 18.5147, lng: 73.9263 },
  { id: "hadapsar", label: "Hadapsar", lat: 18.5089, lng: 73.9259 },
];

export const DEFAULT_HOTSPOT: PilotHotspot = PILOT_HOTSPOTS[0]!;

export function findHotspot(id: string): PilotHotspot {
  return PILOT_HOTSPOTS.find((hotspot) => hotspot.id === id) ?? DEFAULT_HOTSPOT;
}

export interface MoodOption {
  readonly mood: CopilotMood;
  readonly label: string;
  readonly hint: string;
}

/** The moods the drawer offers, in display order. Each maps to a server mood. */
export const MOOD_OPTIONS: readonly MoodOption[] = [
  { mood: "gaming", label: "Gaming & Arcade", hint: "Smaaash, VR" },
  { mood: "nightlife", label: "Craft Beer & Nightlife", hint: "Effingut, microbreweries" },
  { mood: "cafe", label: "Work & Coffee", hint: "Cafe Peter, Third Wave" },
  { mood: "dining", label: "Fine Dining & Rooftops", hint: "Chef-led, skyline views" },
  { mood: "spa", label: "Spa & Wellness", hint: "O2 Spa" },
];

/** Radius stops offered by the slider, in kilometres. */
export const RADIUS_STOPS_KM = [1, 3, 5, 10] as const;
export const DEFAULT_RADIUS_INDEX = 1;

/**
 * Beyond this distance from the corridor centre a GPS fix is almost certainly
 * outside the pilot, so the drawer says so instead of showing a bare empty state.
 */
export const PILOT_CORRIDOR_REACH_KM = 25;

/** Great-circle distance in kilometres. */
export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinPilotCorridor(point: { lat: number; lng: number }): boolean {
  return distanceKm(point, DEFAULT_HOTSPOT) <= PILOT_CORRIDOR_REACH_KM;
}

/**
 * A readable message for a failed copilot response.
 *
 * The route answers with `{ error: { message } }`; anything else (a proxy page,
 * an empty body) falls back to a message chosen by status.
 */
export function copilotErrorMessage(status: number, body: unknown): string {
  if (status === 429) {
    return "You've asked a lot in a short while. Give it a few minutes and try again.";
  }

  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: { message?: unknown } }).error?.message === "string"
      ? (body as { error: { message: string } }).error.message
      : undefined;

  if (status >= 400 && status < 500 && message) return message;
  return "The copilot couldn't put suggestions together just now. Please try again.";
}
