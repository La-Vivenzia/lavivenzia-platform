import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import { ValidationError } from "@/lib/errors";
import { formatClock } from "@/lib/format";
import {
  assembleItinerary,
  assertChronological,
  budgetCapMinor,
  comparePlans,
  interpretPreferences,
  prepareCandidates,
  scheduleSequence,
  scorePlan,
  searchPlans,
  toCandidate,
  type Candidate,
  type Interpretation,
  type ScheduledStop,
} from "@/modules/itinerary/generator";
import {
  ITINERARY_NOTICE,
  type ItineraryOutcome,
  type ItineraryPreferences,
  type ItineraryRequest,
  type ItineraryResult,
  type ItinerarySwap,
} from "@/modules/itinerary/types";

/**
 * Itinerary synthesis and swap.
 *
 * Framework-free and deterministic: the generator does the scheduling, this
 * file turns its answer into an outcome a traveller can act on. "Nothing fits"
 * is an outcome with a reason, not an error — it is a correct answer to the
 * constraints given. Errors are reserved for requests that do not make sense
 * (a swap naming an unknown listing) and for scheduler defects, which the
 * chronology check turns into a loud failure rather than a wrong plan.
 */

const windowOf = (preferences: ItineraryPreferences) => ({
  startMinute: preferences.startTime,
  endMinute: preferences.endTime,
});

function publicInterpretation(interpretation: Interpretation) {
  return { moods: interpretation.moods, terms: interpretation.terms };
}

/** Why nothing, or not enough, fit — in terms of the constraint that bites. */
function shortfallReason(preferences: ItineraryPreferences, candidates: number): string {
  const window = `${formatClock(preferences.startTime)}–${formatClock(preferences.endTime)}`;
  if (candidates === 0) {
    return preferences.budgetPerPersonRupees !== undefined
      ? `No experience fits a party of ${preferences.partySize} within ₹${preferences.budgetPerPersonRupees.toLocaleString("en-IN")} each.`
      : `No experience takes a party of ${preferences.partySize}.`;
  }
  const constraints = [`the ${window} window`];
  if (preferences.budgetPerPersonRupees !== undefined) {
    constraints.push(`₹${preferences.budgetPerPersonRupees.toLocaleString("en-IN")} each`);
  }
  return `Only this much fits ${constraints.join(" and ")}. Widen the window or raise the budget for more.`;
}

function finish(
  stops: ScheduledStop[],
  preferences: ItineraryPreferences,
): ReturnType<typeof assembleItinerary> {
  assertChronological(stops, windowOf(preferences));
  return assembleItinerary(stops, preferences);
}

/** The best plan for these preferences over a catalogue. */
export function synthesizeItinerary(
  preferences: ItineraryPreferences,
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): ItineraryResult {
  const interpretation = interpretPreferences(preferences);
  const candidates = prepareCandidates(catalogue, preferences, interpretation);

  const { best } = searchPlans(candidates, {
    maxStops: preferences.stops,
    window: windowOf(preferences),
    capMinor: budgetCapMinor(preferences),
  });

  let outcome: ItineraryOutcome;
  if (!best) {
    outcome = {
      status: "unfulfillable",
      reason:
        candidates.length === 0
          ? shortfallReason(preferences, 0)
          : `Nothing fits between ${formatClock(preferences.startTime)} and ${formatClock(preferences.endTime)}. Try a wider window.`,
    };
  } else if (best.length < preferences.stops) {
    outcome = {
      status: "partial",
      itinerary: finish(best, preferences),
      reason: shortfallReason(preferences, candidates.length),
    };
  } else {
    outcome = { status: "planned", itinerary: finish(best, preferences) };
  }

  return {
    ...outcome,
    interpretation: publicInterpretation(interpretation),
    requestedStops: preferences.stops,
    notice: ITINERARY_NOTICE,
  };
}

/**
 * Replace one stop, keeping the others and their order.
 *
 * The plan arrives as slugs and is rebuilt from the catalogue: the client's
 * copy of the times and prices is never read. Every alternative is scheduled
 * as a whole sequence — a longer replacement can push later stops — and held
 * to the same window, party and budget as the original.
 */
export function swapItineraryStop(
  preferences: ItineraryPreferences,
  swap: ItinerarySwap,
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): ItineraryResult {
  if (swap.index >= swap.stops.length) {
    throw new ValidationError("There is no stop at that position.");
  }
  if (new Set(swap.stops).size !== swap.stops.length) {
    throw new ValidationError("A plan cannot visit the same experience twice.");
  }

  const interpretation = interpretPreferences(preferences);
  const bySlug = new Map(catalogue.map((listing) => [listing.slug, listing]));

  const fixed: (Candidate | null)[] = swap.stops.map((slug, index) => {
    const listing = bySlug.get(slug);
    if (!listing) throw new ValidationError(`"${slug}" is not an experience we offer.`);
    if (index === swap.index) return null;
    const candidate = toCandidate(listing, preferences, interpretation);
    if (!candidate) {
      throw new ValidationError(
        "This plan no longer fits your party. Synthesize a new one instead.",
      );
    }
    return candidate;
  });

  const swappedOut = swap.stops[swap.index]!;
  const inPlan = new Set(swap.stops);
  const window = windowOf(preferences);
  const capMinor = budgetCapMinor(preferences);
  const fixedSpend = fixed.reduce((sum, candidate) => sum + (candidate?.partyTotalMinor ?? 0), 0);

  const alternatives = prepareCandidates(catalogue, preferences, interpretation).filter(
    (candidate) => !inPlan.has(candidate.listing.slug),
  );

  let best: { stops: ScheduledStop[]; score: ReturnType<typeof scorePlan> } | null = null;
  for (const alternative of alternatives) {
    if (capMinor !== null && fixedSpend + alternative.partyTotalMinor > capMinor) continue;

    const sequence = fixed.map((candidate) => candidate ?? alternative);
    const stops = scheduleSequence(sequence, window);
    if (!stops) continue;

    const score = scorePlan(stops);
    if (!best || comparePlans(score, best.score) < 0) best = { stops, score };
  }

  const outcome: ItineraryOutcome = best
    ? { status: "planned", itinerary: finish(best.stops, preferences) }
    : {
        status: "unfulfillable",
        reason:
          "Nothing else fits that slot without breaking the timing or the budget. Your plan is unchanged.",
      };

  return {
    ...outcome,
    interpretation: publicInterpretation(interpretation),
    requestedStops: swap.stops.length,
    swappedOut,
    notice: ITINERARY_NOTICE,
  };
}

/** One entry point for the HTTP layer: generate, or swap when asked. */
export function handleItineraryRequest(
  request: ItineraryRequest,
  catalogue: readonly PilotExperienceInput[] = PILOT_EXPERIENCES,
): ItineraryResult {
  return request.swap
    ? swapItineraryStop(request.preferences, request.swap, catalogue)
    : synthesizeItinerary(request.preferences, catalogue);
}
