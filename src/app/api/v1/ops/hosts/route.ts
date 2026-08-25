import { jsonResponse, parseQuery, withRoute } from "@/lib/http";
import { requirePrincipal } from "@/lib/auth-context";
import { getOperationsService } from "@/lib/container";
import { normalisePaging } from "@/modules/operations/service";
import { hostQuerySchema } from "../_schemas";

export const dynamic = "force-dynamic";

/** GET /api/v1/ops/hosts — host applications and their verification state (FR-05). */
export const GET = withRoute(async (request) => {
  const principal = await requirePrincipal();
  const query = parseQuery(request, hostQuerySchema);
  const paging = normalisePaging(query);

  return jsonResponse(await getOperationsService().listHosts(principal, { ...query, ...paging }));
});
