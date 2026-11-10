import { createHash, timingSafeEqual } from "node:crypto";
import { jsonResponse, parseJsonBody, parseQuery, withRoute } from "@/lib/http";
import { env, isProduction } from "@/lib/env";
import { InternalError, UnauthenticatedError } from "@/lib/errors";
import { getMeteringService } from "@/modules/metering/service";
import { meteringEventSchema, meteringQuerySchema } from "@/app/api/v1/ops/_schemas";

export const dynamic = "force-dynamic";

const DEFAULT_RECENT_EVENTS = 50;

/**
 * Compare digests rather than the raw strings: `timingSafeEqual` needs equal
 * lengths, and hashing first means the comparison leaks neither the secret's
 * content nor its length.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

function presentedSecret(request: Request): string | undefined {
  const header = request.headers.get("x-metering-secret");
  if (header) return header;

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

/**
 * Service-to-service access.
 *
 * The callers are internal workers (CRM, WhatsApp bot), not people, so this is
 * a shared secret rather than a session. Without a configured secret the
 * endpoint is open outside production and closed in it: a production deploy
 * that forgets the variable must not publish its cost data.
 */
function assertMeteringAccess(request: Request): void {
  const expected = env.METERING_SECRET_KEY;

  if (!expected) {
    if (isProduction) {
      throw new InternalError("Metering endpoint is not configured (METERING_SECRET_KEY).");
    }
    return;
  }

  const presented = presentedSecret(request);
  if (!presented || !secretsMatch(presented, expected)) {
    throw new UnauthenticatedError("A valid metering secret is required.");
  }
}

/** GET /api/v1/ops/metering — cost summary and the most recent events. */
export const GET = withRoute(async (request) => {
  assertMeteringAccess(request);
  const query = parseQuery(request, meteringQuerySchema);
  const metering = getMeteringService();

  return jsonResponse({
    success: true,
    summary: metering.getSummary(query.period ?? "this_month"),
    recentEvents: metering.getRecentEvents(query.limit ?? DEFAULT_RECENT_EVENTS),
  });
});

/** POST /api/v1/ops/metering — ingest one usage event from an internal service. */
export const POST = withRoute(async (request) => {
  assertMeteringAccess(request);
  const input = await parseJsonBody(request, meteringEventSchema);

  const event = getMeteringService().record(input);
  if (!event) {
    // The schema mirrors the service's checks, so this is a defect, not bad input.
    throw new InternalError("Usage event could not be recorded.");
  }

  return jsonResponse({ success: true, event }, 201);
});
