import type { ReactNode } from "react";

import { SiteShell } from "@/components/SiteShell";
import { getPrincipal } from "@/lib/auth-context";
import { destinationForRoles } from "@/lib/destinations";
import { initialsFor } from "@/lib/home-content";

/**
 * The traveller-facing shell.
 *
 * A route group, so the URLs stay `/experiences`, `/destinations`,
 * `/categories` while the chrome is declared once. The console layouts stay
 * separate: they guard on a session, and this one deliberately does not —
 * discovery is public.
 *
 * The chrome is the approved one, the same components the home screen uses.
 * Until this milestone these pages carried an older header, so the navigation
 * changed shape one tap away from the home screen.
 *
 * The principal is read only to decide what the account control offers.
 * Nothing on these pages depends on it, so an anonymous visitor gets the full
 * site.
 */
export default async function SiteLayout({ children }: { readonly children: ReactNode }) {
  const principal = await getPrincipal();

  return (
    <SiteShell
      signedIn={principal !== null}
      accountHref={principal ? destinationForRoles(principal.roles) : "/sign-in"}
      {...(principal?.email ? { initials: initialsFor(principal.email) } : {})}
    >
      {children}
    </SiteShell>
  );
}
