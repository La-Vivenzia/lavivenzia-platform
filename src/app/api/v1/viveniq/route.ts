import { z } from "zod";

import { getVivenIQService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
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
 * POST /api/v1/viveniq — one conversational turn.
 *
 * Unauthenticated, like discovery: everything it can return is already
 * published. Rate limited by client address because each turn fans out to
 * several trigram scans. The reply and every pick are derived from the
 * published catalogue; nothing about price or availability is invented
 * (CLAUDE.md §7).
 */
export const POST = withRoute(async (request) => {
  await enforceIpRateLimit("viveniqPerIp");

  const input = await parseJsonBody(request, vivenIQRequestSchema);
  const result = await getVivenIQService().respond(input);

  return jsonResponse(result);
});
