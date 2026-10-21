"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { iconMap } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * Fixed app-style tab bar. Only rendered on the mobile layout; the desktop
 * interpretation uses the top navigation instead.
 *
 * These were buttons that set local state and navigated nowhere — right for a
 * still image, wrong for a product. They are links now, and the active tab is
 * read from the URL rather than from a `useState` that resets on every
 * navigation and disagrees with the page you are actually on.
 *
 * "Trips" points at the traveller's account rather than an itinerary screen,
 * which does not exist yet. The tab is kept because it is in the approved
 * design and because a four-tab bar that drops to three shifts every other tab
 * sideways; what it must not do is lead nowhere.
 */

const TABS = [
  { id: "home", label: "Home", icon: "home", href: "/" },
  { id: "explore", label: "Explore", icon: "compass", href: "/experiences" },
  { id: "trips", label: "Trips", icon: "calendar", href: "/destinations" },
  { id: "profile", label: "Profile", icon: "user", href: "/sign-in" },
] as const;

export function BottomNavigation({ accountHref = "/sign-in" }: { readonly accountHref?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 lg:hidden",
        "border-t border-line bg-bg/92 backdrop-blur-xl",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map((item) => {
          const Icon = iconMap[item.icon];
          const href = item.id === "profile" ? accountHref : item.href;
          // Exact match for home; prefix match elsewhere, so a detail page keeps
          // its section lit rather than falling back to Home.
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5",
                  "transition-colors duration-300",
                  isActive ? "text-primary dark:text-accent" : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                <Icon
                  className="h-[22px] w-[22px] transition-transform duration-300"
                  strokeWidth={isActive ? 2 : 1.6}
                  fill={isActive && item.icon === "home" ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[11px] leading-none",
                    isActive ? "font-medium" : "font-normal",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
