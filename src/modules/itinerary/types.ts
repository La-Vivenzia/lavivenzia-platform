import { z } from "zod";

import { COPILOT_MOODS, COPILOT_TEXT_LIMITS, type CopilotMood } from "@/modules/copilot/types";

/**
 * Itinerary engine — request and response shapes.
 *
 * The engine answers "plan my evening": a few pilot listings, in an order that
 * fits a time window, a party and a budget. Every fact on a stop — title,
 * address, duration, price, coordinates — is copied from `PILOT_EXPERIENCES`,
 * and every money figure is the booking quote's integer arithmetic. Times are a
 * suggested running order, never reserved slots: availability stays with each
 * listing's own booking flow (CLAUDE.md §7).
 *
 * The browser sends preferences and slugs, never a price or a time; the server
 * derives both.
 */

export const ITINERARY_CURRENCY = "INR";

export const ITINERARY_PARTY = { min: 1, max: 12, default: 2 } as const;
export const ITINERARY_STOPS = { min: 1, max: 4, default: 3 } as const;
export const ITINERARY_BUDGET_RUPEES = { min: 1, max: 100_000 } as const;
export const ITINERARY_MAX_MOODS = 3;

/** The window a plan may occupy, minutes after midnight. Plans end by midnight. */
export const ITINERARY_WINDOW = {
  earliestStart: 6 * 60,
  latestEnd: 24 * 60,
  minLength: 60,
  defaultStart: 16 * 60,
  defaultEnd: 23 * 60 + 30,
} as const;

/** "HH:MM" on a 24-hour clock, or "24:00" for midnight as an end time. */
const CLOCK = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

export function parseClock(value: string): number | null {
  if (value === "24:00") return 24 * 60;
  const match = CLOCK.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const clockMinutes = z
  .string()
  .regex(CLOCK, "Use a 24-hour time such as 16:30.")
  .transform((value) => parseClock(value)!);

const slug = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9-]+$/, "Not a listing slug.");

const moods = z
  .array(z.enum(COPILOT_MOODS))
  .max(ITINERARY_MAX_MOODS)
  .default([])
  .transform((values): CopilotMood[] => [...new Set(values)]);

/** Free text, trimmed; empty means absent rather than a filter. */
const intent = z
  .string()
  .max(COPILOT_TEXT_LIMITS.query)
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

/**
 * What a traveller wants from the plan. Shared by generation and swap so a
 * swapped plan is held to exactly the constraints the original was.
 */
export const ItineraryPreferences = z
  .object({
    intent,
    moods,
    partySize: z
      .number()
      .int()
      .min(ITINERARY_PARTY.min)
      .max(ITINERARY_PARTY.max)
      .default(ITINERARY_PARTY.default),
    /** Whole rupees per person. Absent means no cap. */
    budgetPerPersonRupees: z
      .number()
      .int()
      .min(ITINERARY_BUDGET_RUPEES.min)
      .max(ITINERARY_BUDGET_RUPEES.max)
      .optional(),
    startTime: clockMinutes.default(ITINERARY_WINDOW.defaultStart),
    endTime: clockMinutes.default(ITINERARY_WINDOW.defaultEnd),
    stops: z
      .number()
      .int()
      .min(ITINERARY_STOPS.min)
      .max(ITINERARY_STOPS.max)
      .default(ITINERARY_STOPS.default),
    /** Listings the traveller has ruled out. */
    exclude: z.array(slug).max(32).default([]),
  })
  .superRefine((value, context) => {
    if (value.startTime < ITINERARY_WINDOW.earliestStart) {
      context.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Plans start from 06:00.",
      });
    }
    if (value.endTime - value.startTime < ITINERARY_WINDOW.minLength) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Leave at least an hour between the start and end times.",
      });
    }
  });
export type ItineraryPreferences = z.output<typeof ItineraryPreferences>;

/**
 * Replace one stop of a plan the engine produced. The current stops travel as
 * slugs only; their times and prices are recomputed, not trusted.
 */
export const ItinerarySwap = z.object({
  stops: z.array(slug).min(1).max(ITINERARY_STOPS.max),
  index: z
    .number()
    .int()
    .min(0)
    .max(ITINERARY_STOPS.max - 1),
});
export type ItinerarySwap = z.output<typeof ItinerarySwap>;

export const ItineraryRequest = z.object({
  preferences: ItineraryPreferences,
  swap: ItinerarySwap.optional(),
});
export type ItineraryRequest = z.output<typeof ItineraryRequest>;
export type ItineraryRequestInput = z.input<typeof ItineraryRequest>;

export type TransferMode = "walk" | "ride";

export interface ItineraryTransfer {
  readonly mode: TransferMode;
  /** Straight-line, between stored coordinates. */
  readonly distanceMetres: number;
  /** Planning buffer, rounded up to five minutes. */
  readonly minutes: number;
}

export interface ItineraryStop {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly categoryKey: string;
  readonly addressLine: string;
  readonly venue: { readonly lat: number; readonly lng: number };
  /** Suggested, minutes after midnight. Not a reserved slot. */
  readonly startMinute: number;
  readonly endMinute: number;
  readonly durationMinutes: number;
  /** From the previous stop. Null on the first stop. */
  readonly transfer: ItineraryTransfer | null;
  /** Unscheduled time before this stop, after the transfer. */
  readonly idleBeforeMinutes: number;
  readonly unitPriceMinor: number;
  readonly pricingUnit: "PER_PERSON" | "PER_GROUP";
  /** `quoteBooking` total for the party. */
  readonly partyTotalMinor: number;
  /** The vocabulary that matched, in listing order. Empty when none did. */
  readonly matched: readonly string[];
  /** Deterministic rationale, built only from the listing and the match. */
  readonly why: string;
}

export interface Itinerary {
  readonly stops: readonly ItineraryStop[];
  readonly startMinute: number;
  readonly endMinute: number;
  readonly idleMinutes: number;
  readonly partySize: number;
  readonly currency: string;
  /** Exact sum of the stops' party totals. */
  readonly totalMinor: number;
  /** `totalMinor / partySize`, rounded up — what each guest contributes. */
  readonly perPersonMinor: number;
  readonly budgetPerPersonMinor: number | null;
}

export interface ItineraryInterpretation {
  readonly moods: readonly CopilotMood[];
  readonly terms: readonly string[];
}

export type ItineraryOutcome =
  | { readonly status: "planned"; readonly itinerary: Itinerary }
  | {
      readonly status: "partial";
      readonly itinerary: Itinerary;
      /** Why fewer stops than requested fit. */
      readonly reason: string;
    }
  | { readonly status: "unfulfillable"; readonly reason: string };

export type ItineraryResult = ItineraryOutcome & {
  readonly interpretation: ItineraryInterpretation;
  readonly requestedStops: number;
  /** For a swap: the stop that was replaced. */
  readonly swappedOut?: string;
  readonly notice: string;
};

export const ITINERARY_NOTICE =
  "A suggested running order. Times are not reserved — availability is confirmed when you book each experience.";
