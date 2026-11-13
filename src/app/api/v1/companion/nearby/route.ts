import { z } from "zod";

import { requirePrincipal } from "@/lib/auth-context";
import { getCompanionService, getUserProfileService } from "@/lib/container";
import { ValidationError } from "@/lib/errors";
import { jsonResponse, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import type { Principal } from "@/modules/auth/authorization";
import type { CompanionNearbyResponse } from "@/modules/companion/ports";
import type { TravelPreferences } from "@/modules/user-profile/profile";

export const dynamic = "force-dynamic";

const nearbyQuery = z.object({
  activeSlug: z.string().trim().min(1).max(120),
});

/** The saved taste, when it can be read. Personalisation is never a dependency. */
async function savedTaste(principal: Principal): Promise<TravelPreferences | null> {
  try {
    return (await getUserProfileService().getProfile(principal)).preferences ?? null;
  } catch (error) {
    getLogger().warn(
      { reason: error instanceof Error ? error.message : "unknown error" },
      "companion could not read profile; recommending without it",
    );
    return null;
  }
}

/**
 * GET /api/v1/companion/nearby?activeSlug=… — the live butler's curated gems
 * near the act the traveller is at, for the companion map's "Curated Nearby"
 * drawer.
 *
 * The same ranking as `POST /companion/dispatch`, without the email: nothing is
 * sent, so a read is cheap and limited accordingly. Signed-in only, because
 * the drawer belongs to a booked pass. Recommendations come from the published
 * catalogue; nothing about availability is stated.
 */
export const GET = withRoute(async (request) => {
  await enforceIpRateLimit("companionNearbyPerIp");
  const principal = await requirePrincipal();

  const parsed = nearbyQuery.safeParse({
    activeSlug: new URL(request.url).searchParams.get("activeSlug") ?? "",
  });
  if (!parsed.success) throw new ValidationError("An active experience is required.");

  const result = await getCompanionService().getInJourneyRecommendations({
    activeExperienceSlug: parsed.data.activeSlug,
    tastePreferences: await savedTaste(principal),
    limit: 3,
  });

  const response: CompanionNearbyResponse = {
    butlerNote: result.butlerNote,
    zone: result.active.zone,
    recommendations: result.recommendations,
  };
  return jsonResponse(response);
});
