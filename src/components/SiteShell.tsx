import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/AuthContext";
import { CopilotProvider } from "@/components/copilot/CopilotProvider";
import { BottomNavigation } from "@/components/BottomNavigation";
import { DesktopHeader } from "@/components/DesktopHeader";
import { Footer } from "@/components/Footer";
import { MobileHeader } from "@/components/MobileHeader";

/**
 * The chrome every public page wears.
 *
 * The home screen composes its own header because `MobileHome` and
 * `DesktopHome` are two separate layouts with different content order. Every
 * other page is one document, so it gets both headers here and lets the
 * breakpoint decide which is visible — the same components, so the navigation
 * is identical everywhere rather than merely similar.
 *
 * That was the problem this replaces. `/` used the approved header while
 * `/experiences`, `/destinations` and `/categories` used an older one: two
 * different navigations, two different logos, two different account controls,
 * on pages one tap apart.
 *
 * The room the fixed mobile tab bar needs is reserved by `Footer`, which is
 * the last element on every page. Padding `main` as well left a ~7rem blank
 * band between the content and the footer on phones.
 */
export function SiteShell({
  signedIn,
  accountHref,
  initials,
  children,
}: {
  readonly signedIn: boolean;
  readonly accountHref: string;
  readonly initials?: string;
  readonly children: ReactNode;
}) {
  return (
    <AuthProvider value={{ signedIn, accountHref, ...(initials ? { initials } : {}) }}>
      <CopilotProvider>
        <div className="flex min-h-dvh flex-col">
          <div className="lg:hidden">
            <MobileHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />
          </div>
          <div className="hidden lg:block">
            <DesktopHeader signedIn={signedIn} accountHref={accountHref} initials={initials} />
          </div>

          <main className="flex-1">{children}</main>

          <Footer />
          <BottomNavigation accountHref={accountHref} />
        </div>
      </CopilotProvider>
    </AuthProvider>
  );
}
