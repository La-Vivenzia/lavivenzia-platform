import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/auth-context";
import { getTasteGenomeService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { enforceIpRateLimit } from "@/lib/rate-limit";
import { resolvePatron, withGuestCookie } from "../_identity";
import { telemetryBatchSchema } from "../_schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/taste-genome/telemetry — fold a batch of browsing events in.
 *
 * Accepts `text/plain` as well as JSON: `navigator.sendBeacon` with a string
 * body sends text/plain, and `request.json()` parses either.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);
  await enforceIpRateLimit("tasteGenomePerIp");

  const { events } = await parseJsonBody(request, telemetryBatchSchema);
  const identity = await resolvePatron(request);
  const genome = await getTasteGenomeService().processTelemetry(identity.patronId, events);

  return withGuestCookie(
    jsonResponse({ accepted: events.length, interactionCount: genome.interactionCount }),
    identity,
  );
});
