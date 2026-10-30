"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Crown } from "lucide-react";

import { JOURNEY_SELECT_EVENT } from "@/components/journeys/events";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration, formatMoneyMinor } from "@/lib/format";
import type { Journey, JourneyChapter } from "@/modules/journeys/data";

const NUMERALS = ["I", "II", "III"] as const;

/**
 * A curated journey as a three-chapter arc: a journey picker, then Prelude →
 * Centerpiece → Epilogue as a timeline.
 *
 * Horizontal from `lg`, vertical below — one tree, so the mobile and desktop
 * homes share the component and differ only in the space around it.
 *
 * Everything priced here is copied from the listings. Booking stays per
 * chapter: there is no multi-stop checkout, so each chapter links to its own
 * listing rather than the journey offering a "book all" it cannot honour.
 */
export function JourneyArcView({
  journeys,
  className,
}: {
  readonly journeys: readonly Journey[];
  readonly className?: string;
}) {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState(journeys[0]?.id);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (journeys.some((journey) => journey.id === id)) setSelectedId(id);
    };
    window.addEventListener(JOURNEY_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(JOURNEY_SELECT_EVENT, onSelect);
  }, [journeys]);

  const selected = journeys.find((journey) => journey.id === selectedId) ?? journeys[0];
  if (!selected) return null;

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  // Arrow-key movement between tabs, per the WAI-ARIA tabs pattern.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = journeys[(index + step + journeys.length) % journeys.length]!;
    setSelectedId(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Curated journeys"
        className="rail -mx-5 flex gap-2 px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
      >
        {journeys.map((journey, index) => {
          const active = journey.id === selected.id;
          return (
            <button
              key={journey.id}
              id={tabId(journey.id)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelectedId(journey.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "rail-item min-h-11 shrink-0 rounded-pill border px-4 text-[12.5px] whitespace-nowrap transition-colors duration-300 sm:px-5 sm:text-[13px]",
                active
                  ? "border-primary bg-primary text-text-inverse dark:border-accent dark:bg-accent dark:text-accent-fg"
                  : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {journey.title}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selected.id)}
        className="mt-6 lg:mt-10"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="max-w-[60ch]">
            <p className="eyebrow text-[10px] text-accent-ink lg:text-[11px]">
              {selected.mood} · Three chapters
            </p>
            <h3 className="mt-2 font-display text-[22px] leading-[1.2] text-heading xs:text-[24px] lg:text-[32px]">
              {selected.title}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed font-light text-fg-muted lg:text-[15px]">
              {selected.tagline}
            </p>
          </div>

          <dl className="flex shrink-0 gap-8 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <div>
              <dt className="eyebrow text-[10px] text-fg-subtle">Evening</dt>
              <dd className="mt-1 text-[15px] text-fg">
                {formatDuration(selected.totalDurationMinutes)}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-[10px] text-fg-subtle">Combined, per person</dt>
              <dd className="mt-1 font-display text-[20px] text-heading">
                {formatMoneyMinor(selected.totalPriceMinor, selected.currency)}
              </dd>
            </div>
          </dl>
        </div>

        <ol className="relative mt-8 grid gap-5 lg:mt-10 lg:grid-cols-3 lg:gap-6">
          {/* The arc: a hairline joining the chapters, vertical then horizontal. */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[11px] w-px bg-accent/40 lg:top-[11px] lg:right-[16%] lg:bottom-auto lg:left-[16%] lg:h-px lg:w-auto"
          />
          {selected.chapters.map((chapter, index) => (
            <ChapterCard
              key={chapter.role}
              chapter={chapter}
              numeral={NUMERALS[index]!}
              currency={selected.currency}
            />
          ))}
        </ol>

        <p className="mt-6 text-[12px] leading-relaxed font-light text-fg-muted lg:text-[13px]">
          A suggested running order, not a reservation. Each chapter is booked on its own listing at
          the price shown, subject to that listing&apos;s availability.
        </p>
      </div>
    </div>
  );
}

function ChapterCard({
  chapter,
  numeral,
  currency,
}: {
  readonly chapter: JourneyChapter;
  readonly numeral: string;
  readonly currency: string;
}) {
  const { privilege } = chapter;

  return (
    <li className="relative pl-9 lg:pt-9 lg:pl-0">
      <span
        aria-hidden="true"
        className="absolute top-1 left-[5px] h-[13px] w-[13px] rounded-full border border-accent bg-bg lg:top-[5px] lg:left-1/2 lg:-translate-x-1/2"
      />

      <article className="flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card lg:p-6">
        <div>
          <p className="eyebrow text-[10px] text-fg-subtle">
            Chapter {numeral} · {chapter.label}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-fg tabular-nums">
            <Clock
              className="h-[14px] w-[14px] text-fg-muted"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            {formatClock(chapter.startMinute)} – {formatClock(chapter.endMinute)}
          </p>
          <h4 className="mt-2 font-display text-[16px] leading-snug text-heading lg:text-[17px]">
            <Link
              href={`/experiences/${chapter.experienceSlug}`}
              className="group inline-flex items-start gap-1 hover:text-primary dark:hover:text-accent"
            >
              {chapter.experienceTitle}
              <ArrowUpRight
                className="mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </Link>
          </h4>
          <p className="mt-1 text-[12px] leading-snug font-light text-fg-muted">
            {chapter.addressLine}
          </p>
          <p className="mt-3 text-[13px] text-fg">
            {formatMoneyMinor(chapter.priceMinor, currency)}
            <span className="text-fg-muted">
              {" "}
              per person · {formatDuration(chapter.durationMinutes)}
            </span>
          </p>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="eyebrow flex items-center gap-1.5 text-[10px] text-accent-ink dark:text-accent">
            <Crown className="h-[13px] w-[13px]" strokeWidth={1.6} aria-hidden="true" />
            La Vivenzia VIP Privilege
          </p>
          <p className="mt-2 text-[13.5px] font-medium text-fg">{privilege.title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed font-light text-fg-muted">
            {privilege.detail}
          </p>
          {privilege.confirmed ? null : (
            <p className="mt-2 text-[11.5px] text-fg-muted italic">
              Requested on your behalf — subject to the venue&apos;s confirmation.
            </p>
          )}
        </div>
      </article>
    </li>
  );
}
