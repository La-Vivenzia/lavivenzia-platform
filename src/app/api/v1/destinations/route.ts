import { jsonResponse, withRoute } from "@/lib/http";
import { getDiscoveryService } from "@/lib/container";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/destinations — the places with something published in them.
 *
 * Derived from `experiences.city` rather than stored: there is no destination
 * entity yet, and creating one is a content decision (docs/ASSUMPTIONS.md →
 * A-013). A destination with nothing published never appears, so a traveller
 * cannot follow one into an empty page.
 */
export const GET = withRoute(async () => {
  return jsonResponse({ destinations: await getDiscoveryService().destinations() });
});
