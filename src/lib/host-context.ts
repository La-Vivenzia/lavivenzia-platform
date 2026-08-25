import { requirePrincipal } from "@/lib/auth-context";
import { getHostService } from "@/lib/container";
import type { Principal } from "@/modules/auth/authorization";
import type { HostRecord } from "@/modules/hosts/ports";

/**
 * Resolving "who is this host" for the host surface.
 *
 * Every host route needs the same two things — the principal, and the host
 * record that principal owns. Doing it here means no route ever reads a host ID
 * from a URL or a body, which is what closes the direct-object-reference class
 * of bug at the level of the codebase rather than per-endpoint.
 */

export interface HostContext {
  readonly principal: Principal;
  readonly host: HostRecord;
}

/**
 * The signed-in host, or a refusal.
 *
 * Throws `UnauthenticatedError` for an anonymous caller, and `ForbiddenError`
 * for a signed-in user with no host profile — which is also what a traveller
 * gets, since a traveller has no host record and could not create one without
 * the `host:manage:own` permission their role does not carry.
 */
export async function requireHostContext(): Promise<HostContext> {
  const principal = await requirePrincipal();
  const host = await getHostService().requireOwnHost(principal);

  return { principal, host };
}

/** Request metadata the host services record on audit entries. */
export interface HostAuditContext {
  readonly ipAddress: string | null;
  readonly correlationId: string | null;
}
