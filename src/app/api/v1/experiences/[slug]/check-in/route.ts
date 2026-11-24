import { requirePrincipal } from "@/lib/auth-context";
import { getCompanionService, getUserProfileService } from "@/lib/container";
import { jsonResponse, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * POST /api/v1/experiences/:slug/check-in — Check-in to an active experience.
 *
 * Automatically triggers curated recommendations for the active experience zone,
 * delivering both an in-app concierge notification and a luxury butler email
 * with zero manual dispatch required (LA-22).
 */
export const POST = withRoute<RouteContext>(async (_request, { params }) => {
  await enforceIpRateLimit("companionDispatchPerIp");
  const principal = await requirePrincipal();
  const { slug } = await params;

  let patronName: string | undefined;
  let tastePreferences = null;

  try {
    const profile = await getUserProfileService().getProfile(principal);
    patronName = profile.fullName?.split(" ")[0] ?? undefined;
    tastePreferences = profile.preferences ?? null;
  } catch {
    // Non-fatal: recommendations can be computed without profile preferences
  }

  const result = await getCompanionService().autoDispatch({
    to: principal.email,
    userId: principal.userId,
    activeExperienceSlug: slug,
    patronName,
    tastePreferences,
  });

  getLogger().info(
    {
      userId: principal.userId,
      slug,
      zone: result.active.zone,
      recommendationCount: result.recommendations.length,
    },
    "automated check-in recommendations dispatched",
  );

  return jsonResponse({
    success: true,
    checkedIn: true,
    zone: result.active.zone,
    activeExperience: result.active,
    recommendations: result.recommendations,
    butlerNote: result.butlerNote,
  });
});
