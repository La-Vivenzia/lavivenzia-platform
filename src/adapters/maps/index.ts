import type { MapsPort } from "@/ports/maps";
import { env } from "@/lib/env";
import { getLogger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { slugify } from "@/modules/experiences/slug";
import { GoogleMapsAdapter } from "@/adapters/maps/google";
import { createLocalPlacesAdapter } from "@/adapters/maps/local";
import { FallbackMapsAdapter } from "@/adapters/maps/fallback";
import { resolveMapsProvider } from "@/adapters/maps/provider";

/**
 * Location provider selection (FR-03).
 *
 * The only place that reads maps configuration from the environment. The
 * decision itself lives in `resolveMapsProvider`, which is pure and tested.
 */

/**
 * Build the location provider.
 *
 * With no `GOOGLE_MAPS_API_KEY` the catalogue provider is used alone — which is
 * the current state of this deployment, and is why location search works today
 * without an account having been arranged.
 */
export function createMapsAdapter(): MapsPort {
  const local = createLocalPlacesAdapter(prisma, slugify);

  const plan = resolveMapsProvider({
    apiKey: env.GOOGLE_MAPS_API_KEY,
    languageCode: undefined,
  });

  if (plan.kind === "local") return local;

  // `getLogger` is passed rather than called, so each provider log line carries
  // the correlation ID of the request that caused it.
  const google = new GoogleMapsAdapter(plan.config, { logger: getLogger });

  return new FallbackMapsAdapter(google, local, getLogger);
}

export { FallbackMapsAdapter } from "@/adapters/maps/fallback";
export { resolveMapsProvider } from "@/adapters/maps/provider";
export type { MapsProviderKind, MapsProviderPlan } from "@/adapters/maps/provider";
