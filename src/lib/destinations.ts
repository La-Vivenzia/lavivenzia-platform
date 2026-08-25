import type { RoleKey } from "@/modules/auth/permissions";

/**
 * Where a signed-in person belongs.
 *
 * One place, because sign-in, the MFA challenge and the landing page all need
 * the same answer, and three copies of it would drift into three different
 * ideas of where an operations user lands.
 *
 * Order matters: a person may hold several roles, and the most privileged
 * console wins. Someone who is both an operator and a host is here to operate.
 */
const OPERATIONS_ROLES: readonly RoleKey[] = [
  "super_admin",
  "operations",
  "content_admin",
  "finance",
];

export function destinationForRoles(roles: readonly RoleKey[]): string {
  if (roles.some((role) => OPERATIONS_ROLES.includes(role))) return "/ops";
  if (roles.includes("host")) return "/host";
  // Travellers have no console yet. The landing page is honest about that.
  return "/";
}
