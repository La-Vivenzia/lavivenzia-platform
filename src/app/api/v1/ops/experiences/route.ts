import { jsonResponse, parseQuery, withRoute } from "@/lib/http";
import { requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";
import { normalisePaging } from "@/modules/operations/service";
import { experienceQuerySchema } from "../_schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ops/experiences — the review queue (FR-14).
 *
 * Filtering and paging happen in PostgreSQL. `normalisePaging` clamps the page
 * size, so a caller cannot ask for the whole table by sending a large one.
 */
export const GET = withRoute(async (request) => {
  const principal = await requirePrincipal();
  const query = parseQuery(request, experienceQuerySchema);
  const paging = normalisePaging(query);

  const page = await getOperationsService().listExperiences(principal, { ...query, ...paging });
  return jsonResponse(page);
});
