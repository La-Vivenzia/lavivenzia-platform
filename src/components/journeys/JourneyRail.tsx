"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";

import { FavouriteButton } from "@/components/FavouriteButton";
import { JOURNEY_SELECT_EVENT } from "@/components/journeys/events";
import { cn } from "@/lib/cn";
import { formatDuration, formatMoneyMinor } from "@/lib/format";
import type { Journey } from "@/modules/journeys/data";

/**
 * Curated journeys as a horizontal rail of photo cards — one card per journey,
 * each linking to its own page (`/journeys/:id`), where the chapters, the
 * running order and the one-pass checkout live.
 *
 * The card keeps to four quiet lines: title and mood, the venue route, the
 * combined price and length, and the centerpiece privilege. Everything priced
 * is copied from the listings (see `modules/journeys/data.ts`).
 *
 * One tree for both homes: touch users swipe, and from `lg` a pair of arrow
 * buttons pages the rail.
 */
export function JourneyRail({
  journeys,
  className,
}: {
  readonly journeys: readonly Journey[];
  readonly className?: string;
}) {
  const railRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setEdges({
      start: rail.scrollLeft <= 1,
      end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    measure();
    rail.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => {
      rail.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, journeys]);

  const behavior = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  // The taste finder asks for a journey: bring its card to the rail's start.
  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const rail = railRef.current;
      const card = rail?.querySelector<HTMLElement>(`[data-journey-id="${CSS.escape(id)}"]`);
      if (!rail || !card) return;
      const inset = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      rail.scrollTo({ left: card.offsetLeft - inset, behavior: behavior() });
    };
    window.addEventListener(JOURNEY_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(JOURNEY_SELECT_EVENT, onSelect);
  }, []);

  const page = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.85, behavior: behavior() });
  };

  if (journeys.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <div className="mb-5 hidden justify-end gap-2 lg:flex">
        <RailButton label="Previous journeys" disabled={edges.start} onClick={() => page(-1)}>
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
        </RailButton>
        <RailButton label="Next journeys" disabled={edges.end} onClick={() => page(1)}>
          <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
        </RailButton>
      </div>

      <ul
        ref={railRef}
        aria-label="Curated journeys"
        className="rail relative -mx-5 scroll-px-5 gap-5 px-5 pb-4 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {journeys.map((journey) => (
          <JourneyCard key={journey.id} journey={journey} />
        ))}
      </ul>
    </div>
  );
}

function RailButton({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-fg shadow-card",
        "transition-[border-color,transform,opacity] duration-300",
        "hover:scale-[1.04] hover:border-line-strong active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}

/** "Effingut Brewhouse: Signature Craft…" → "Effingut Brewhouse". */
const venueName = (title: string): string => title.split(":")[0]!.trim();

function JourneyCard({ journey }: { readonly journey: Journey }) {
  const acts = journey.chapters.length === 2 ? "Two" : "Three";
  const route = journey.chapters.map((chapter) => venueName(chapter.experienceTitle)).join(" → ");
  const duration = formatDuration(journey.totalDurationMinutes);
  const centerpiece =
    journey.chapters.find((chapter) => chapter.role === "centerpiece") ?? journey.chapters[0];
  const privilege = centerpiece?.privilege;

  return (
    <li data-journey-id={journey.id} className="rail-item w-[280px] xs:w-[320px] sm:w-[340px]">
      <article className="group relative">
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-surface-2 shadow-card">
          <Image
            src={journey.coverImage}
            alt={journey.coverAlt}
            fill
            sizes="(max-width: 479px) 280px, (max-width: 639px) 320px, 340px"
            className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
          />
          {/* Fixed translucent treatment over photography, as FavouriteButton. */}
          <span className="absolute top-3 left-3 z-10 rounded-pill bg-black/35 px-3 py-1 text-[11px] font-medium tracking-wide text-white ring-1 ring-white/25 backdrop-blur-[6px] ring-inset">
            Signature Arc · {acts} chapters
          </span>
          <FavouriteButton label={journey.title} size="sm" className="absolute top-3 right-3" />
        </div>

        <div className="mt-3.5 px-0.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 truncate font-display text-[16px] leading-snug font-medium text-heading sm:text-[17px]">
              <Link
                href={`/journeys/${journey.id}`}
                className="outline-none after:absolute after:inset-0 after:z-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-primary"
              >
                {journey.title}
              </Link>
            </h3>
            <span className="shrink-0 text-[12px] text-fg-muted">{journey.mood}</span>
          </div>
          <p className="mt-1 truncate text-[13px] font-light text-fg-muted">{route}</p>
          <p className="mt-1.5 text-[13px] text-fg tabular-nums">
            <span className="font-medium">
              {formatMoneyMinor(journey.totalPriceMinor, journey.currency)}
            </span>
            <span className="text-fg-muted"> / guest{duration ? ` · ${duration}` : ""}</span>
          </p>
          {privilege ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-muted">
              <Crown
                className="h-[13px] w-[13px] shrink-0 text-accent"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              <span className="truncate">
                {privilege.confirmed ? "Includes" : "Privilege on request:"} {privilege.title}
              </span>
            </p>
          ) : null}
        </div>
      </article>
    </li>
  );
}
