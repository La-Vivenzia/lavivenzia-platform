import { z } from "zod";
import { LATITUDE_RANGE, LONGITUDE_RANGE } from "@/modules/discovery/geo";

/**
 * AI Travel Copilot — request and response shapes.
 *
 * The copilot answers "what should I do near here, in this mood?" for the Pune
 * pilot corridor. Everything a suggestion states as fact — where it is, how far
 * it is, what it costs — is read from the published catalogue. The only field a
 * model may author is `whyYouWillLoveIt`, and even that has a deterministic
 * fallback (ADR-0007, CLAUDE.md §7).
 */

export const COPILOT_MOODS = [
  "gaming",
  "nightlife",
  "cafe",
  "dining",
  "spa",
  "adventure",
  "peaceful",
] as const;
export type CopilotMood = (typeof COPILOT_MOODS)[number];

export function isCopilotMood(value: string): value is CopilotMood {
  return (COPILOT_MOODS as readonly string[]).includes(value);
}

/**
 * Radius bounds, in kilometres.
 *
 * Tighter than general discovery on purpose: the copilot is for "near me, now",
 * and fifteen kilometres already spans the whole pilot corridor.
 */
export const COPILOT_RADIUS_KM = { min: 0.5, default: 3, max: 15 } as const;

/** Bounds on free text. Every value here reaches ranking, and possibly a prompt. */
export const COPILOT_TEXT_LIMITS = { mood: 40, budget: 40, query: 200 } as const;

export function clampRadiusKm(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return COPILOT_RADIUS_KM.default;
  return Math.min(Math.max(value, COPILOT_RADIUS_KM.min), COPILOT_RADIUS_KM.max);
}

/** Trim, and treat an empty string as absent rather than as a filter. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    });

/**
 * A copilot request.
 *
 * Coordinates are rejected when out of range — unlike browsing, the copilot
 * cannot do anything useful without a location. The radius, by contrast, is
 * clamped rather than rejected: an oversized radius is a preference, not an
 * error.
 */
export const CopilotRequest = z.object({
  lat: z.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max),
  lng: z.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max),
  radiusKm: z.number().optional().transform(clampRadiusKm),
  mood: optionalText(COPILOT_TEXT_LIMITS.mood).transform((value) => value?.toLowerCase()),
  budget: optionalText(COPILOT_TEXT_LIMITS.budget),
  query: optionalText(COPILOT_TEXT_LIMITS.query),
});
export type CopilotRequest = z.output<typeof CopilotRequest>;

export interface CopilotSuggestion {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly category: string;
  readonly summary: string;
  readonly distanceMeters: number;
  /** e.g. "350 m away". */
  readonly distanceText: string;
  readonly priceFormatted: string;
  readonly whyYouWillLoveIt: string;
  /** Directions to the listing's stored coordinates. */
  readonly googleMapsUrl: string;
  readonly imageUrl?: string;
}

export interface CopilotResponse {
  readonly queryEcho: {
    readonly lat: number;
    readonly lng: number;
    readonly radiusKm: number;
    readonly mood?: string;
  };
  readonly suggestions: readonly CopilotSuggestion[];
  readonly count: number;
  /**
   * True when any rationale came from the deterministic path rather than the
   * model — because no model is configured, it failed, or its output was
   * rejected. Facts are identical either way; only the prose differs.
   */
  readonly fallback: boolean;
}
