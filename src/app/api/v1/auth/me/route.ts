import { jsonResponse, withRoute } from "@/lib/http";
import { requirePrincipal } from "@/lib/auth-context";
import { requiresMfaForRoles } from "@/modules/auth/service";

export const dynamic = "force-dynamic";

/** GET /api/v1/auth/me — the current principal. */
export const GET = withRoute(async () => {
  const principal = await requirePrincipal();

  // Returns the caller's own identity and capabilities only. Permissions are
  // included so a client can hide actions it cannot perform — a usability aid,
  // never the enforcement point, which stays at the service layer.
  return jsonResponse({
    userId: principal.userId,
    roles: principal.roles,
    permissions: [...principal.permissions].sort(),
    mfaSatisfied: principal.mfaSatisfied,
    mfaRequired: requiresMfaForRoles(principal.roles) && !principal.mfaSatisfied,
  });
});
