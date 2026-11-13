"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Logo } from "@/components/Logo";
import { brand } from "@/data/content";

/**
 * Every href here resolves to a real page. The pilot areas link to a keyword
 * search rather than `?destination=`: a destination is a city slug, and every
 * pilot listing is in Pune, so `?destination=amanora` would always return an
 * empty page. Search matches the address line, which names the area.
 */
const footerNav = [
  {
    title: "The Curation",
    items: [
      { label: "The Collection", href: "/experiences" },
      { label: "Signature Journeys", href: "/journeys" },
      { label: "VivenIQ Concierge", href: "/viveniq" },
      { label: "Curated Corridors", href: "/destinations" },
    ],
  },
  {
    title: "Patronage",
    items: [
      { label: "Patron Profile", href: "/profile" },
      { label: "Member Access", href: "/sign-in" },
      { label: "Become a Host", href: "/become-a-host" },
    ],
  },
  {
    title: "Pilot Triangle",
    items: [
      { label: "Amanora Park Town", href: "/experiences?search=Amanora" },
      { label: "Seasons Corridor", href: "/experiences?search=Seasons" },
      { label: "Magarpatta City", href: "/experiences?search=Magarpatta" },
    ],
  },
] as const;

/**
 * The site footer.
 *
 * Below `lg` — the same breakpoint at which the home screen switches to its
 * mobile layout — the link groups collapse into an accordion, so a phone shows
 * three tappable rows rather than three desktop columns stacked into a long,
 * gappy list. From `lg` up the groups are always open and the toggle is not
 * rendered.
 *
 * `pb-28 sm:pb-32 lg:pb-16` reserves room for the fixed mobile tab bar. The
 * footer is the last thing on every page, so it owns that clearance; without
 * it the copyright line sits underneath the bar.
 */
export function Footer() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <footer className="border-t border-line bg-white dark:bg-surface">
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-12 pb-28 sm:px-8 sm:pt-16 sm:pb-32 lg:pt-20 lg:pb-16 xl:px-12 3xl:max-w-[1680px]">
        <div className="grid grid-cols-12 lg:gap-x-12">
          <div className="col-span-12 pb-10 lg:col-span-5 lg:pb-0">
            <Logo className="h-10 max-w-[210px] lg:h-11 lg:max-w-[230px]" />
            <p className="mt-6 max-w-[38ch] text-[14px] leading-[1.7] font-light text-fg-muted lg:mt-7 lg:text-[14.5px]">
              Choreographed multi-venue evenings and verified experiences across Pune — reserved in
              one touch with VIP privileges.
            </p>
          </div>

          {footerNav.map((col, index) => {
            const expanded = open === col.title;
            const panelId = `footer-nav-${index}`;

            return (
              <nav
                key={col.title}
                aria-label={col.title}
                className={[
                  "col-span-12 border-b border-line lg:col-span-2 lg:border-b-0",
                  index === 0 ? "border-t lg:col-start-7 lg:border-t-0" : "",
                ].join(" ")}
              >
                <h2 className="font-sans text-[11px] font-medium tracking-[0.2em] text-heading uppercase">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : col.title)}
                    className="flex min-h-14 w-full items-center justify-between text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
                  >
                    <span>{col.title}</span>
                    <ChevronDown
                      aria-hidden
                      className={[
                        "h-4 w-4 text-fg-muted transition-transform duration-300",
                        expanded ? "rotate-180 text-accent" : "",
                      ].join(" ")}
                    />
                  </button>
                  <span className="hidden lg:inline">{col.title}</span>
                </h2>

                <div
                  id={panelId}
                  className={[
                    "grid transition-[grid-template-rows,visibility] duration-300 ease-out lg:visible lg:grid-rows-[1fr]",
                    expanded ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
                  ].join(" ")}
                >
                  <ul className="min-h-0 space-y-1 overflow-hidden lg:mt-5 lg:space-y-3">
                    {col.items.map((item, itemIndex) => (
                      <li
                        key={item.label}
                        className={itemIndex === col.items.length - 1 ? "pb-4 lg:pb-0" : undefined}
                      >
                        <Link
                          href={item.href}
                          className="inline-flex min-h-10 items-center text-[14px] font-light text-fg-muted transition-colors duration-300 hover:text-heading focus-visible:text-heading lg:min-h-0"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-4 pt-10 text-center lg:mt-16 lg:flex-row lg:justify-between lg:gap-6 lg:border-t lg:border-line lg:pt-10 lg:text-left">
          <p className="text-[10px] tracking-[0.16em] text-fg-muted uppercase sm:text-[10.5px] sm:tracking-[0.26em]">
            Curate <span className="mx-1.5 text-accent sm:mx-2.5">&middot;</span> Reserve
            <span className="mx-1.5 text-accent sm:mx-2.5">&middot;</span> Experience
            <span className="mx-1.5 text-accent sm:mx-2.5">&middot;</span> Belong
          </p>
          <p className="font-display text-[13px] text-fg-muted">{brand.tagline}</p>
          <p className="text-[12px] font-light text-fg-muted">
            &copy; {new Date().getFullYear()} {brand.name}. Pune Pilot Corridor.
          </p>
        </div>
      </div>
    </footer>
  );
}
