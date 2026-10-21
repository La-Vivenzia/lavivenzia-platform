"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark, GoldRule } from "@/components/ui/wordmark";

/**
 * The host console frame.
 *
 * A dark rail against an ivory canvas: this is the "anchor rather than flood"
 * idea from ADR-0012 made structural. The navigation is the one permanently
 * dark surface, so the brand is present on every screen without the working
 * area — where a host reads and types for an hour at a time — being dark.
 *
 * A client component only because the active link depends on the current path.
 * Everything it wraps stays a server component.
 */

interface NavItem {
  readonly href: string;
  readonly label: string;
}

const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/host", label: "Overview" },
  { href: "/host/experiences", label: "Experiences" },
  { href: "/host/profile", label: "Profile" },
];

/**
 * Shown, muted and inert.
 *
 * These are the rest of the host navigation from DESIGN.md §22. Rendering them
 * as disabled rather than omitting them tells a host what is coming; rendering
 * them as links would tell them the product is broken.
 */
const FORTHCOMING: readonly string[] = ["Availability", "Bookings", "Guests", "Revenue", "Reviews"];

function isActive(pathname: string, href: string): boolean {
  // Exact match for the overview, prefix match for sections — otherwise
  // /host would light up on every page beneath it.
  return href === "/host" ? pathname === href : pathname.startsWith(href);
}

function NavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center py-2.5 text-[12px] font-medium tracking-[0.14em] uppercase transition-colors duration-200 ease-[var(--ease-out-soft)] ${
        active ? "text-gold-light" : "text-text-inverse-muted hover:text-text-inverse"
      }`}
    >
      {/* The active marker is a gold hairline, not a filled pill. */}
      <span
        aria-hidden="true"
        className={`absolute top-1/2 -left-5 h-4 w-px -translate-y-1/2 bg-gold-light transition-opacity duration-200 ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
        }`}
      />
      {item.label}
    </Link>
  );
}

export interface HostShellProps {
  readonly hostName: string;
  readonly children: ReactNode;
}

export function HostShell({ hostName, children }: HostShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh lg:flex">
      {/* ── Rail (desktop) ────────────────────────────────────────────── */}
      <aside className="bg-ink text-text-inverse hidden shrink-0 flex-col justify-between px-9 py-10 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[248px]">
        <div className="flex flex-col gap-10">
          <Link href="/host" className="block">
            <Wordmark size="md" tone="gold" mark />
            <span className="mt-2 block text-[10px] tracking-[0.24em] text-text-inverse-muted uppercase">
              Host Console
            </span>
          </Link>

          <nav aria-label="Host sections" className="flex flex-col">
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}

            <span className="mt-8 mb-1 text-[10px] tracking-[0.2em] text-text-inverse-muted/60 uppercase">
              Coming next
            </span>
            {FORTHCOMING.map((label) => (
              <span
                key={label}
                aria-disabled="true"
                className="cursor-default py-2 text-[12px] font-medium tracking-[0.14em] text-text-inverse-muted/35 uppercase"
              >
                {label}
              </span>
            ))}
          </nav>
        </div>

        <div className="border-line-inverse flex flex-col gap-3 border-t pt-6">
          <GoldRule />
          <p className="text-[13px] leading-snug text-text-inverse">{hostName}</p>
          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="text-[11px] tracking-[0.14em] text-text-inverse-muted uppercase transition-colors hover:text-gold-light"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Masthead (mobile) ─────────────────────────────────────────── */}
      <header className="bg-ink text-text-inverse sticky top-0 z-20 lg:hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/host">
            <Wordmark size="sm" tone="gold" mark />
          </Link>
          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="text-[11px] tracking-[0.14em] text-text-inverse-muted uppercase"
            >
              Sign out
            </button>
          </form>
        </div>
        {/*
         * A scrolling strip rather than a hamburger. Three destinations do not
         * justify a drawer, and every link stays one tap away.
         */}
        <nav
          aria-label="Host sections"
          className="border-line-inverse flex gap-6 overflow-x-auto border-t px-5"
        >
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 border-b-2 py-3 text-[11px] font-medium tracking-[0.14em] uppercase transition-colors ${
                  active
                    ? "border-gold-light text-gold-light"
                    : "border-transparent text-text-inverse-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/**
 * Standard page padding for the console.
 *
 * One component so every screen breathes identically — DESIGN.md §36 asks each
 * new screen to follow the spacing scale, and the reliable way to achieve that
 * is to not restate it.
 */
export function HostPage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
      {children}
    </div>
  );
}
