import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BedDouble, Star } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import { CuratorScore } from "@/components/trips/CuratorScore";
import { PILOT_EXPERIENCES } from "@/data/pune-pilot";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import type { Trip } from "@/modules/trips/data";

const ARCHITECT_HREF = "/trips/architect";

const PILOT_IMAGE_MAP: ReadonlyMap<string, { readonly src: string; readonly alt: string }> =
  new Map(PILOT_EXPERIENCES.map((exp) => [exp.slug, { src: exp.coverImageKey, alt: exp.altText }]));

const TRIP_IMAGES: Record<string, { readonly src: string; readonly alt: string }> = {
  "mulshi-rainforest-retreat": {
    src:
      PILOT_IMAGE_MAP.get("pottery-and-clay-wheel-workshop-magarpatta")?.src ??
      "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1600&q=80",
    alt: "Artisan clay wheel pottery masterclass in Mulshi",
  },
  "east-pune-nightlife-sprint": {
    src:
      PILOT_IMAGE_MAP.get("smaaash-vr-twilight-bowling-amanora")?.src ??
      "https://images.unsplash.com/photo-1538388149542-5e24932d11a8?auto=format&fit=crop&w=1600&q=80",
    alt: "Twilight bowling and nightlife in East Pune",
  },
  "pawna-stargazing-glamping": {
    src:
      PILOT_IMAGE_MAP.get("amanora-lake-walk-mindful-stroll")?.src ??
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
    alt: "Sunset lake stroll and stargazing at Pawna",
  },
};

function getTripImage(trip: Trip): { readonly src: string; readonly alt: string } | null {
  const mapped = TRIP_IMAGES[trip.id];
  if (mapped) return mapped;
  for (const day of trip.days) {
    for (const line of day.lines) {
      if (line.experienceSlug) {
        const found = PILOT_IMAGE_MAP.get(line.experienceSlug);
        if (found) return found;
      }
    }
  }
  return null;
}

function shortenTripTitle(title: string): string {
  return title
    .replace(/^The (?:48-Hour )?/i, "")
    .replace(/ & Adventure Retreat$/i, " Retreat")
    .replace(/ High-Octane & /i, " ")
    .replace(/ & Acoustic Glamping Escape$/i, " & Glamping")
    .trim();
}

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
          className={
            !desktop
              ? "[&_h2]:text-[13.5px] [&_h2]:xs:text-[15px] [&_h2]:sm:text-[18px] [&_h2]:whitespace-nowrap"
              : undefined
          }
        />
      </Reveal>
      {desktop ? (
        <Reveal delay={80}>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed font-light text-fg-muted">
            The stay, two days of experiences and the full price, planned end to end — from the
            Mulshi rain forest to the shore of Pawna Lake.
          </p>
        </Reveal>
      ) : null}

      <ul
        className={cn(
          desktop
            ? "mt-12 grid grid-cols-3 gap-6 xl:gap-7"
            : "rail -mx-5 mt-5 flex gap-4 px-5 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible",
        )}
      >
        {trips.map((trip, index) => {
          const image = !desktop ? getTripImage(trip) : null;

          if (!desktop) {
            return (
              <Reveal
                as="li"
                key={trip.id}
                delay={index * 70}
                className="rail-item w-[82%] shrink-0 sm:w-auto"
              >
                <Link
                  href={`${ARCHITECT_HREF}?trip=${trip.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-colors duration-300 hover:border-accent/50"
                >
                  {image ? (
                    <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="(max-width: 640px) 82vw, 360px"
                        priority={index === 0}
                        className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                      />
                      <div className="absolute right-2.5 bottom-2.5 z-10 flex items-center gap-1 rounded-pill border border-line/60 bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-heading shadow-sm backdrop-blur-md">
                        <Star
                          className="h-3 w-3 fill-accent text-accent"
                          strokeWidth={1.6}
                          aria-hidden="true"
                        />
                        <span className="tabular-nums">{trip.minCuratorScore.toFixed(1)}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-1 flex-col p-4 xs:p-4.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[15px] font-medium text-heading">
                        {formatMoneyMinor(trip.perPersonPriceMinor, trip.currency)}
                        <span className="text-[11.5px] font-normal text-fg-muted">per person</span>
                      </span>
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        strokeWidth={1.6}
                        aria-hidden="true"
                      />
                    </div>

                    <h3 className="mt-2 font-display text-[16px] leading-snug font-normal text-heading">
                      {shortenTripTitle(trip.title)}
                    </h3>

                    <div className="mt-auto flex flex-col gap-1 border-t border-line/60 pt-3">
                      <p className="eyebrow text-[9.5px] text-accent-ink">{trip.region}</p>
                      <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                        <BedDouble
                          className="h-3.5 w-3.5 shrink-0 text-fg-muted"
                          strokeWidth={1.6}
                          aria-hidden="true"
                        />
                        <span className="truncate">{trip.stay.title} · 2 days</span>
                      </p>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          }

          return (
            <Reveal as="li" key={trip.id} delay={index * 70}>
              <Link
                href={`${ARCHITECT_HREF}?trip=${trip.id}`}
                className="group flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors duration-300 hover:border-accent/50 lg:p-6"
              >
                <p className="eyebrow text-[10px] text-accent-ink">{trip.region}</p>
                <h3 className="mt-2 font-display text-[20px] leading-snug text-heading xl:text-[22px]">
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
                  <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[13px] text-heading">
                    {formatMoneyMinor(trip.perPersonPriceMinor, trip.currency)}
                    <span className="text-[11px] text-fg-muted">per person</span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
