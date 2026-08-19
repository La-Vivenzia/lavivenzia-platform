/**
 * Server startup hook.
 *
 * Environment validation runs here rather than in `next.config.ts` because
 * build time is not run time: a CI build machine legitimately has no production
 * database URL or https origin, and validating runtime invariants during
 * `next build` would force fake production secrets into CI — defeating the
 * point of the check.
 *
 * Next.js calls `register()` once per server process, before the first request
 * is handled. A throw here crashes the process at startup, which is what we
 * want: the container fails its health check and is replaced, rather than
 * serving traffic in a misconfigured state. See ADR-0009.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { env, assertDeploymentInvariants } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");

  assertDeploymentInvariants();

  logger.info(
    { nodeEnv: env.NODE_ENV, appUrl: env.APP_URL, region: env.AWS_REGION },
    "environment validated; server starting",
  );
}
