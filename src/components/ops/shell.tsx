"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark, GoldRule } from "@/components/ui/wordmark";

/**
 * The operations console frame.
 *
 * The same structure as the host console — dark rail, ivory working canvas
 * (ADR-0012) — deliberately, so the two feel like one product. What separates
 * them is the label and the queue counts in the rail, which is where an
 * operator's attention starts.
 *
 * A client component only because the active link depends on the path.
 */

interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Outstanding work, shown beside the link. Omitted when there is none. */
  readonly count?: number;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/ops" ? pathname === href : pathname.startsWith(href);
}

function NavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center justify-between gap-3 py-2.5 text-[12px] font-medium tracking-[0.14em] uppercase transition-colors duration-200 ease-[var(--ease-out-soft)] ${
        active ? "text-gold-light" : "text-text-inverse-muted hover:text-text-inverse"
      }`}
    >
      <span className="flex items-center">
        <span
          aria-hidden="true"
          className={`absolute top-1/2 -left-5 h-4 w-px -translate-y-1/2 bg-gold-light transition-opacity duration-200 ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        />
        {item.label}
      </span>

      {item.count !== undefined && item.count > 0 ? (
        <span
          // Announced as work outstanding rather than as a bare number, which
          // reads as meaningless out of context.
          aria-label={`${item.count} awaiting review`}
          className="bg-gold-light/15 text-gold-light rounded-xs px-1.5 py-0.5 text-[10px] tabular-nums"
        >
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

export interface OpsShellProps {
  readonly operatorEmail: string;
  readonly roleLabel: string;
  readonly pendingHosts: number;
  readonly pendingExperiences: number;
  readonly children: ReactNode;
}

export function OpsShell({
  operatorEmail,
  roleLabel,
  pendingHosts,
  pendingExperiences,
  children,
}: OpsShellProps) {
  const pathname = usePathname();

  const nav: readonly NavItem[] = [
    { href: "/ops", label: "Overview" },
    { href: "/ops/experiences", label: "Experiences", count: pendingExperiences },
    { href: "/ops/hosts", label: "Hosts", count: pendingHosts },
  ];

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="bg-ink text-text-inverse hidden shrink-0 flex-col justify-between px-9 py-10 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[248px]">
        <div className="flex flex-col gap-10">
          <Link href="/ops" className="block">
            <Wordmark size="md" tone="gold" />
            <span className="text-text-inverse-muted mt-2 block text-[10px] tracking-[0.24em] uppercase">
              Operations
            </span>
          </Link>

          <nav aria-label="Operations sections" className="flex flex-col">
            {nav.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </nav>
        </div>

        <div className="border-line-inverse flex flex-col gap-3 border-t pt-6">
          <GoldRule />
          <p className="text-text-inverse text-[13px] leading-snug break-all">{operatorEmail}</p>
          <p className="text-text-inverse-muted text-[10px] tracking-[0.16em] uppercase">
            {roleLabel}
          </p>
          <form action="/host/sign-out" method="post">
            <button
              type="submit"
              className="text-text-inverse-muted hover:text-gold-light text-[11px] tracking-[0.14em] uppercase transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <header className="bg-ink text-text-inverse sticky top-0 z-20 lg:hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/ops">
            <Wordmark size="sm" tone="gold" />
          </Link>
          <form action="/host/sign-out" method="post">
            <button
              type="submit"
              className="text-text-inverse-muted text-[11px] tracking-[0.14em] uppercase"
            >
              Sign out
            </button>
          </form>
        </div>
        <nav
          aria-label="Operations sections"
          className="border-line-inverse flex gap-6 overflow-x-auto border-t px-5"
        >
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 py-3 text-[11px] font-medium tracking-[0.14em] uppercase transition-colors ${
                  active
                    ? "border-gold-light text-gold-light"
                    : "border-transparent text-text-inverse-muted"
                }`}
              >
                {item.label}
                {item.count !== undefined && item.count > 0 ? (
                  <span className="bg-gold-light/15 text-gold-light rounded-xs px-1.5 text-[10px] tabular-nums">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/** Standard page padding, so every operations screen breathes identically. */
export function OpsPage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
      {children}
    </div>
  );
}
