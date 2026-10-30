import Link from "next/link";
import { ArrowUpRight, BedDouble } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import { CuratorScore } from "@/components/trips/CuratorScore";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import type { Trip } from "@/modules/trips/data";

const ARCHITECT_HREF = "/trips/architect";

/**
 * "Curated End-to-End Trips" on the home screen — one card per trip, each
 * opening the Trip Architect on that trip.
 *
 * One component for both homes: a rail on mobile, a three-column grid on
 * desktop, differing only in spacing and type size.
 */
export function CuratedTripsSection({
  trips,
  variant,
  id,
  className,
}: {
  readonly trips: readonly Trip[];
  readonly variant: "mobile" | "desktop";
  readonly id: string;
  readonly className?: string;
}) {
  if (trips.length === 0) return null;
  const desktop = variant === "desktop";
  const headingId = `${id}-heading`;

  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-24", className)}>
      <Reveal>
        <SectionHeader
          id={headingId}
          title="Curated End-to-End Trips"
          action="Open Trip Architect"
          href={ARCHITECT_HREF}
          {...(desktop ? { size: "lg" as const } : {})}
        />
      </Reveal>
      <Reveal delay={80}>
        <p
          className={cn(
            "font-light text-fg-muted",
            desktop
              ? "mt-4 max-w-[56ch] text-[15px] leading-relaxed"
              : "mt-2 text-[13px] leading-relaxed",
          )}
        >
          The stay, two days of experiences and the full price, planned end to end — from the Mulshi
          rain forest to the shore of Pawna Lake.
        </p>
      </Reveal>

      <ul
        className={cn(
          desktop
            ? "mt-12 grid grid-cols-3 gap-6 xl:gap-7"
            : "rail -mx-5 mt-5 flex gap-4 px-5 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible",
        )}
      >
        {trips.map((trip, index) => (
          <Reveal
            as="li"
            key={trip.id}
            delay={index * 70}
            className={cn(!desktop && "rail-item w-[82%] shrink-0 sm:w-auto")}
          >
            <Link
              href={`${ARCHITECT_HREF}?trip=${trip.id}`}
              className="group flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors duration-300 hover:border-accent/50 lg:p-6"
            >
              <p className="eyebrow text-[10px] text-accent-ink">{trip.region}</p>
              <h3
                className={cn(
                  "mt-2 font-display leading-snug text-heading",
                  desktop ? "text-[20px] xl:text-[22px]" : "text-[17px]",
                )}
              >
                {trip.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed font-light text-fg-muted">
                {trip.tagline}
              </p>
              <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-fg">
                <BedDouble
                  className="h-3.5 w-3.5 text-fg-muted"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                {trip.stay.title} · 2 days
              </p>
              <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                <CuratorScore score={trip.minCuratorScore} verified={trip.fullyVerified} />
                <span className="flex items-center gap-1 text-[13px] text-heading">
                  {formatMoneyMinor(trip.perPersonPriceMinor, trip.currency)}
                  <span className="text-[11px] text-fg-muted">per person</span>
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
