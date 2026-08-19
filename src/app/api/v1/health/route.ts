import { prisma } from "@/lib/db";
import { jsonResponse, withRoute } from "@/lib/http";
import { ProviderUnavailableError } from "@/lib/errors";

/**
 * Liveness and readiness probe for the ALB target group.
 *
 * Checks the database round-trip rather than just returning 200: an instance
 * that cannot reach Postgres is not ready to serve, and should be pulled from
 * the target group rather than serving errors.
 */

// Never cached — a cached health check is not a health check.
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (cause) {
    throw new ProviderUnavailableError("Database is unreachable", {}, { cause });
  }

  return jsonResponse({
    status: "ok",
    checks: {
      database: { status: "ok", latencyMs: Date.now() - startedAt },
    },
  });
});
