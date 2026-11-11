import { z } from "zod";

import { getPrincipal } from "@/lib/auth-context";
import { getUserProfileService, getVivenIQService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import type { TravelPreferences } from "@/modules/user-profile/profile";
import { VIVENIQ_LIMITS } from "@/modules/viveniq/options";

export const dynamic = "force-dynamic";

const turn = z.string().trim().min(1).max(VIVENIQ_LIMITS.message.max);

const vivenIQRequestSchema = z.object({
  message: turn,
  /** Earlier traveller turns, oldest first. Context for a refinement. */
  history: z.array(turn).max(VIVENIQ_LIMITS.history.max).default([]),
  /** Slugs already shown, so "something different" can mean it. */
  seen: z.array(z.string().trim().min(1).max(120)).max(VIVENIQ_LIMITS.seen.max).default([]),
});

/**
 * The signed-in traveller's saved taste profile, or null.
 *
 * Read from the session rather than the request body, so a client cannot
 * claim a profile it does not own. Personalisation is a refinement, never a
 * dependency: an anonymous visitor, an expired session or a database blip all
 * degrade to the same un-personalised reply.
 */
async function savedPreferences(): Promise<TravelPreferences | null> {
  try {
    const principal = await getPrincipal();
    if (!principal) return null;
    return (await getUserProfileService().getProfile(principal)).preferences;
  } catch (error) {
    getLogger().warn(
      { reason: error instanceof Error ? error.message : "unknown error" },
      "viveniq could not read taste profile; replying without it",
    );
    return null;
  }
}

/**
 * POST /api/v1/viveniq — one conversational turn.
 *
 * Unauthenticated, like discovery: everything it can return is already
 * published. A session, when present, only personalises the order. Rate
 * limited by client address because each turn fans out to several trigram
 * scans. The reply and every pick are derived from the published catalogue;
 * nothing about price or availability is invented (CLAUDE.md §7).
 */
export const POST = withRoute(async (request) => {
  await enforceIpRateLimit("viveniqPerIp");

  const input = await parseJsonBody(request, vivenIQRequestSchema);
  const preferences = await savedPreferences();
  const result = await getVivenIQService().respond({ ...input, preferences });

  return jsonResponse(result);
});
