import { jsonResponse, withRoute } from "@/lib/http";
import { getMapsPort } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Same ceiling as autocomplete: a place id is opaque, not unbounded. */
const MAX_PLACE_ID_LENGTH = 512;

/**
 * GET /api/v1/places/resolve?placeId= — turn a chosen suggestion into a point.
 *
 * The second half of location search, and only ever reached for a provider that
 * does not return coordinates with its suggestions. The catalogue provider
 * does, so in the current deployment this endpoint is effectively unused —
 * it exists because Google does not, and swapping provider must not require a
 * new endpoint.
 *
 * A place that resolves to nothing returns 404 through the shared error mapper,
 * which is the honest answer: unlike autocomplete, there is no degraded result
 * to offer, because the caller asked about one specific place.
 */
export const GET = withRoute(async (request) => {
  await enforceIpRateLimit("placesAutocompletePerIp");

  const placeId = (new URL(request.url).searchParams.get("placeId") ?? "").trim();

  if (placeId === "" || placeId.length > MAX_PLACE_ID_LENGTH) {
    throw new ValidationError("A place identifier is required.");
  }

  return jsonResponse(await getMapsPort().geocode(placeId));
});
