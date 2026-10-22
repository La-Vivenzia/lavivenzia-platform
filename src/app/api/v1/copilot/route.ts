import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getCopilotService } from "@/lib/container";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { CopilotRequest } from "@/modules/copilot/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/copilot — mood-based suggestions near a point.
 *
 * Unauthenticated, like discovery: everything it can return is already
 * published. Rate limited by client address because each request fans out to
 * several reads and may reach a billed model.
 *
 * Unlike browsing, malformed coordinates are a 400 rather than silently
 * dropped — the copilot has nothing to offer without a location.
 */
export const POST = withRoute(async (request) => {
  await enforceIpRateLimit("copilotPerIp");

  const input = await parseJsonBody(request, CopilotRequest);
  const result = await getCopilotService().suggest(input);

  return jsonResponse(result);
});
