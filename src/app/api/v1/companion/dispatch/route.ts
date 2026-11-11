import { z } from "zod";

import { env } from "@/lib/env";
import { assertSameOrigin, requirePrincipal } from "@/lib/auth-context";
import { getCompanionService, getUserProfileService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { authorize, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { COMPANION_LIMITS } from "@/modules/companion/service";
import { normalizePreferences, type TravelPreferences } from "@/modules/user-profile/profile";
import type { UserProfile } from "@/modules/user-profile/types";
import { emailSchema } from "../../auth/_schemas";
import { travelPreferencesSchema } from "../../user/_schemas";

export const dynamic = "force-dynamic";

const dispatchSchema = z
  .object({
    activeSlug: z.string().trim().min(1).max(120),
    /** Defaults to the signed-in account's own address. */
    email: emailSchema.optional(),
    patronName: z.string().trim().min(1).max(COMPANION_LIMITS.patronName.max).optional(),
    /** Overrides the saved taste profile for this one dispatch. */
    tastePreferences: travelPreferencesSchema.optional(),
  })
  .strict();

/**
 * Who may be written to.
 *
 * A traveller may send the butler to their own inbox. Any other address needs
 * an operations permission — the concierge desk acting for a guest. Without
 * this the endpoint would be an open relay for branded mail from our verified
 * domain, which is a phishing kit rather than a feature.
 */
function resolveRecipient(principal: Principal, requested: string | undefined): string {
  const recipient = requested ?? principal.email;
  if (recipient.toLowerCase() !== principal.email.toLowerCase()) {
    authorize(principal, PERMISSIONS.BOOKING_READ_ALL);
  }
  return recipient;
}

/** The saved profile, when it can be read. Personalisation is never a dependency. */
async function savedProfile(principal: Principal): Promise<UserProfile | null> {
  try {
    return await getUserProfileService().getProfile(principal);
  } catch (error) {
    getLogger().warn(
      { reason: error instanceof Error ? error.message : "unknown error" },
      "companion could not read profile; dispatching without it",
    );
    return null;
  }
}

/**
 * POST /api/v1/companion/dispatch — send the in-journey live butler email.
 *
 * Signed-in only, same-origin only, and rate limited, because every accepted
 * request is a real email (see `companionDispatchPerIp`). Recommendations are
 * read from the published catalogue; nothing about availability is stated.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);
  const principal = await requirePrincipal();
  await enforceIpRateLimit("companionDispatchPerIp");

  const body = await parseJsonBody(request, dispatchSchema);
  const to = resolveRecipient(principal, body.email);

  // Profile defaults apply only to the traveller's own inbox — another guest's
  // email should not be personalised with the operator's taste or name.
  const own = to.toLowerCase() === principal.email.toLowerCase();
  const profile = own ? await savedProfile(principal) : null;

  const tastePreferences: TravelPreferences | null = body.tastePreferences
    ? normalizePreferences(body.tastePreferences)
    : (profile?.preferences ?? null);
  const patronName = body.patronName ?? profile?.fullName?.split(" ")[0] ?? undefined;

  const result = await getCompanionService().dispatch({
    to,
    activeExperienceSlug: body.activeSlug,
    patronName,
    tastePreferences,
  });

  return jsonResponse({
    success: true,
    providerMessageId: result.providerMessageId,
    recommendations: result.recommendations,
  });
});
