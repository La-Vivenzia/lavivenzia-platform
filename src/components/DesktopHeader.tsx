"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Radar } from "lucide-react";

import { CopilotTrigger, LiveMapTrigger } from "@/components/copilot/CopilotProvider";
import { Logo } from "@/components/Logo";
import { LiveDot } from "@/components/map/LiveDot";
import { PaletteToggle } from "@/components/PaletteToggle";
import { NotificationButton, ProfileButton } from "@/components/ProfileButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { desktopNav } from "@/data/content";
import { cn } from "@/lib/cn";

/**
 * Desktop navigation. Sits flush on the page ground at rest and picks up a
 * hairline and a blur once the hero scrolls beneath it.
 */
export function DesktopHeader({
  signedIn,
  accountHref,
  initials,
}: {
  readonly signedIn: boolean;
  readonly accountHref: string;
  readonly initials?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  // `noUncheckedIndexedAccess` is on in this project, so an index read is
  // `T | undefined` even on a literal array. The fallback is unreachable and
  // costs nothing; widening the compiler settings to avoid it would not be.
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-500",
        scrolled
          ? "border-line bg-bg/88 shadow-card backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-[86px] w-full max-w-[1440px] items-center gap-8 px-8 xl:px-12 3xl:max-w-[1680px]">
        <a href="#d-top" aria-label="La Vivenzia — home" className="-m-2 shrink-0 p-2">
          <Logo className="h-[38px] max-w-[190px] xl:h-10 xl:max-w-[210px]" priority />
        </a>

        <nav aria-label="Primary" className="min-w-0 flex-1">
          <ul className="flex items-center justify-center gap-1 xl:gap-2">
            {desktopNav.map((item) => {
              // From the URL, not from click state: a `useState` here disagrees
              // with the page after any navigation that did not start on it.
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative block rounded-md px-3 py-2 text-[13.5px] whitespace-nowrap transition-colors duration-300 xl:px-3.5 xl:text-sm",
                      isActive
                        ? "font-medium text-heading"
                        : "font-normal text-fg-muted hover:text-heading",
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-3 -bottom-0.5 h-px origin-left bg-accent transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        isActive ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Icon-only until `xl`, where the label fits beside "Plan My Journey". */}
          <LiveMapTrigger
            aria-label="Open the live map tracker"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-pill border border-line-strong px-3 text-[13.5px] font-medium whitespace-nowrap text-fg xl:px-4",
              "transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:-translate-y-px hover:bg-surface-2 active:translate-y-0",
            )}
          >
            <span aria-hidden="true" className="relative">
              <Radar className="h-[18px] w-[18px] text-accent-ink" strokeWidth={1.8} />
              <LiveDot className="absolute -top-0.5 -right-1 ring-2 ring-bg" />
            </span>
            <span aria-hidden="true" className="hidden xl:inline">
              Live Map
            </span>
          </LiveMapTrigger>
          <CopilotTrigger
            className={cn(
              "hidden rounded-pill bg-cta px-5 py-2.5 text-[13.5px] font-medium whitespace-nowrap text-cta-fg xl:inline-block",
              "transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:bg-cta-hover hover:-translate-y-px active:translate-y-0",
            )}
          >
            Plan My Journey
          </CopilotTrigger>
          <NotificationButton signedIn={signedIn} accountHref={accountHref} />
          <ProfileButton signedIn={signedIn} accountHref={accountHref} initials={initials} />
          <ThemeToggle className="ml-1" />
          <PaletteToggle />
        </div>
      </div>
    </header>
  );
}
