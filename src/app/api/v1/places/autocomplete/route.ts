import { jsonResponse, withRoute } from "@/lib/http";
import { getMapsPort } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { getLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/places/autocomplete?q= — location suggestions (FR-03).
 *
 * Unauthenticated, because choosing where to go happens before anyone signs in.
 * That makes it the one public endpoint whose backing provider is billed per
 * call, so it is rate limited by client address — a budget control before it is
 * an abuse control.
 *
 * A suggestion may carry its coordinates inline. When it does, the client can
 * search immediately and never calls geocode at all; the catalogue provider
 * always does, which is why location search costs nothing in the common case.
 */

/** Enough to choose from, few enough to render without a scroll on a phone. */
const MAX_SUGGESTIONS = 6;

/** Bounds what reaches the provider. Nobody types a 200-character place name. */
const MAX_QUERY_LENGTH = 120;

export const GET = withRoute(async (request) => {
  await enforceIpRateLimit("placesAutocompletePerIp");

  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

  if (query.length < 2) return jsonResponse({ suggestions: [] });

  const maps = getMapsPort();

  try {
    const suggestions = await maps.autocomplete(query, MAX_SUGGESTIONS);
    return jsonResponse({ suggestions, provider: maps.provider });
  } catch (caught) {
    // Autocomplete is an assist, never a gate. A provider outage must not turn
    // into an error banner on a search box the traveller can still type into
    // and submit — the keyword and filter paths do not depend on this at all.
    // Logged rather than swallowed silently, so the outage is still visible.
    getLogger().warn(
      { code: caught instanceof AppError ? caught.code : "unknown", provider: maps.provider },
      "place autocomplete failed; returning no suggestions",
    );

    return jsonResponse({ suggestions: [], provider: maps.provider, degraded: true });
  }
});
