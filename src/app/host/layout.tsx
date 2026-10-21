import type { ReactNode } from "react";
import { HostShell } from "@/components/host/shell";
import { loadHostSession } from "@/lib/host-page";

/**
 * The host console frame.
 *
 * Resolves the session once, here, so every page beneath it renders with a
 * known principal and none of them repeat the check. An anonymous visitor is
 * redirected before any child renders.
 *
 * Route handlers are not wrapped by layouts, which is why `/sign-out`
 * performs its own authentication rather than relying on this.
 */
export default async function HostLayout({ children }: { readonly children: ReactNode }) {
  const { principal, profile } = await loadHostSession();

  return (
    <HostShell hostName={profile?.host.displayName ?? principal.roles.join(", ")}>
      {children}
    </HostShell>
  );
}
