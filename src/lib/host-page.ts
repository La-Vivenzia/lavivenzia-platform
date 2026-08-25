import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth-context";
import { getHostService } from "@/lib/container";
import type { Principal } from "@/modules/auth/authorization";
import type { HostRecord } from "@/modules/hosts/ports";
import type { HostProfileView } from "@/modules/hosts/service";

/**
 * Page-level guards for the host console.
 *
 * These are for *navigation* — sending someone to the right screen. They are
 * not the security boundary. Every API route independently resolves the
 * principal and checks the permission, so a page that forgot to call one of
 * these would render an empty shell rather than leak anything.
 */

export interface HostSession {
  readonly principal: Principal;
  readonly profile: HostProfileView | null;
}

/**
 * The signed-in host, or a redirect.
 *
 * A signed-in user without the host role is sent to the application page rather
 * than shown a bare refusal: they are not doing anything wrong, they simply do
 * not host yet.
 */
export async function loadHostSession(): Promise<HostSession> {
  const principal = await getPrincipal();
  if (!principal) redirect("/sign-in");

  if (!principal.roles.includes("host")) redirect("/become-a-host");

  return { principal, profile: await getHostService().getOwnProfile(principal) };
}

/**
 * A host who has actually started their profile.
 *
 * Inventory screens need a host record to hang listings off, so a host who has
 * not begun onboarding is sent to do that first instead of meeting an error.
 */
export async function requireHostProfile(): Promise<{
  readonly principal: Principal;
  readonly host: HostRecord;
  readonly profile: HostProfileView;
}> {
  const { principal, profile } = await loadHostSession();
  if (!profile) redirect("/host/profile");

  return { principal, host: profile.host, profile };
}
