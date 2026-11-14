import { cookies } from "next/headers";
import { z } from "zod";

import { env, isProduction } from "@/lib/env";
import { assertSameOrigin, getPrincipal } from "@/lib/auth-context";
import { sendCuratedItineraryEmail } from "@/lib/container";
import { NotFoundError, RateLimitedError } from "@/lib/errors";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import {
  SAVED_CURATIONS_COOKIE,
  isJourneyId,
  parseSavedCurationsCookie,
  savedCurationsCookieAttributes,
  serialiseSavedCurations,
  toCurationSummary,
  withCuration,
  type SavedCurationSummary,
} from "@/lib/saved-curations";
import { JOURNEY_PARTY_MAX } from "@/modules/booking/journey-pass-contract";
import { findJourney } from "@/modules/journeys/data";
import { emailSchema } from "../../auth/_schemas";

export const dynamic = "force-dynamic";

const SaveBody = z
  .object({
    journeyId: z.string().trim().refine(isJourneyId, "Unknown journey."),
    partySize: z.number().int().min(1).max(JOURNEY_PARTY_MAX).optional(),
    /** Where a guest wants the itinerary. Ignored when signed in. */
    email: emailSchema.optional(),
  })
  .strict();

async function savedIds(): Promise<string[]> {
  return parseSavedCurationsCookie((await cookies()).get(SAVED_CURATIONS_COOKIE)?.value);
}

/** Ids that still name a catalogue journey, resolved; retired ones drop out silently. */
function summaries(ids: readonly string[]): SavedCurationSummary[] {
  return ids.flatMap((id) => {
    const journey = findJourney(id);
    return journey ? [toCurationSummary(journey)] : [];
  });
}

/**
 * GET /api/v1/user/curations — the journeys saved on this device.
 *
 * Saved curations live in the `lv_saved_curations` cookie, not in PostgreSQL,
 * so guests can keep them without an account. Each id is resolved against the
 * catalogue here; the cookie never supplies a title or anything else shown.
 */
export const GET = withRoute(async () => {
  return jsonResponse({ curations: summaries(await savedIds()) });
});

/**
 * POST /api/v1/user/curations — save a journey and send its itinerary.
 *
 * The itinerary goes to the signed-in account's own address, or — for a guest
 * — to the address in the body. A signed-in caller cannot redirect it
 * elsewhere. The email holds catalogue content only, so there is nothing for a
 * caller to inject; the per-IP dispatch limit bounds how much of it one client
 * can send; over that limit the journey is still saved, without an email.
 * The send is fire-and-forget: a mail provider failure is logged and
 * never fails the save.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);
  await enforceIpRateLimit("curationSavePerIp");

  const body = await parseJsonBody(request, SaveBody);
  const journey = findJourney(body.journeyId);
  if (!journey) throw new NotFoundError("That journey is not in our curations.");

  const ids = withCuration(await savedIds(), journey.id);

  const principal = await getPrincipal();
  let recipient = principal?.email ?? body.email ?? null;

  if (recipient) {
    try {
      await enforceIpRateLimit("curationDispatchPerIp");
    } catch (error) {
      // Over the email budget: still save, just do not send.
      if (!(error instanceof RateLimitedError)) throw error;
      recipient = null;
    }
  }

  if (recipient) {
    void sendCuratedItineraryEmail(recipient, journey, body.partySize ?? null).catch(
      (error: unknown) => {
        getLogger().warn(
          {
            journey: journey.id,
            reason: error instanceof Error ? error.message : "unknown error",
          },
          "curated itinerary email was not sent",
        );
      },
    );
  }

  const response = jsonResponse(
    {
      curation: toCurationSummary(journey),
      curations: summaries(ids),
      itineraryEmailed: recipient !== null,
    },
    201,
  );
  response.cookies.set({
    name: SAVED_CURATIONS_COOKIE,
    value: serialiseSavedCurations(ids),
    ...savedCurationsCookieAttributes(isProduction),
  });
  return response;
});
