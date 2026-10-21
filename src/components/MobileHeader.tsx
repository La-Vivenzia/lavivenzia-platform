import Link from "next/link";

import { Logo } from "@/components/Logo";
import { PaletteToggle } from "@/components/PaletteToggle";
import { NotificationButton, ProfileButton } from "@/components/ProfileButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export function MobileHeader({
  signedIn,
  accountHref,
  initials,
}: {
  readonly signedIn: boolean;
  readonly accountHref: string;
  readonly initials?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-bg/85 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 xs:gap-3 xs:px-5">
        <Link href="/" aria-label="La Vivenzia — home" className="-m-1 shrink-0 p-1">
          <Logo className="h-7 max-w-[112px] xs:h-[34px] xs:max-w-[150px]" priority />
        </Link>

        <div className="flex shrink-0 items-center gap-0.5 xs:gap-1">
          <ThemeToggle />
          <PaletteToggle />
          <NotificationButton signedIn={signedIn} accountHref={accountHref} />
          <ProfileButton signedIn={signedIn} accountHref={accountHref} initials={initials} />
        </div>
      </div>
    </header>
  );
}
