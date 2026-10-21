import Link from "next/link";
import Image from "next/image";
import type { ExperienceSummary } from "@/modules/discovery/ports";
import { formatDuration, formatGuestRange, formatMoneyMinor } from "@/lib/format";
import { formatDistance } from "@/modules/discovery/geo";

/**
 * The experience card (FR-01).
 *
 * The single component every discovery surface renders a listing through — the
 * homepage, the browse grid, a destination page and a category page all use
 * this one. That is the point: when the moodboard is approved, a card redesign
 * is this file plus tokens, not four screens.
 *
 * It takes an `ExperienceSummary` and nothing else. No screen passes it layout
 * flags or variant names, so it cannot drift into four slightly different cards
 * behind one import.
 */

export function ExperienceCard({
  experience,
  priority = false,
}: {
  readonly experience: ExperienceSummary;
  /** Set on the first row so the largest contentful paint is not lazy-loaded. */
  readonly priority?: boolean;
}) {
  const price = formatMoneyMinor(experience.basePriceMinor, experience.currency);
  const duration = formatDuration(experience.durationMinutes);
  const place = [experience.city, experience.region].filter(Boolean).join(", ");
  // Present only when the search carried a location, so it never appears on the
  // homepage or on an undirected browse — it is a property of the search.
  const distance = formatDistance(experience.distanceMetres);

  return (
    <article className="group">
      {/*
       * A contained card, not a bare image with text beneath it. The approved
       * references put every listing on a raised surface with an 18px radius
       * (`--radius-card`) and clip the photograph to the top corners — that
       * containment is most of what makes the grid read as editorial rather
       * than as a search-results list.
       */}
      <Link
        href={`/experiences/${experience.slug}`}
        className="border-line bg-surface shadow-raise hover:shadow-panel flex h-full flex-col overflow-hidden rounded-card border transition-shadow duration-300 ease-[var(--ease-out-soft)] focus-visible:outline-none"
      >
        <div className="bg-surface-sunken relative aspect-[4/3] w-full overflow-hidden">
          {experience.coverUrl ? (
            <Image
              src={experience.coverUrl}
              // The host's own description. Empty string when absent so a
              // screen reader skips the image rather than reading a filename —
              // the title beneath already carries the meaning.
              alt={experience.coverAlt ?? ""}
              fill
              priority={priority}
              sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 90vw"
              className="object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
            />
          ) : (
            <div className="text-text-subtle absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] tracking-[0.16em] uppercase">No photograph</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {experience.categoryName ? (
              <span className="bg-surface-sunken text-text-muted rounded-pill px-2.5 py-1 text-[10px] font-medium tracking-[0.14em] uppercase">
                {experience.categoryName}
              </span>
            ) : null}
            {place ? (
              <span className="text-text-subtle text-[10px] tracking-[0.14em] uppercase">
                {place}
              </span>
            ) : null}
            {distance ? (
              <span className="text-text-subtle text-[10px] tracking-[0.14em] uppercase">
                {distance} away
              </span>
            ) : null}
          </div>

          <h3 className="font-display text-heading group-hover:text-primary text-[18px] leading-snug transition-colors">
            {experience.title}
          </h3>

          {experience.summary ? (
            <p className="text-text-muted line-clamp-2 text-[13px] leading-relaxed">
              {experience.summary}
            </p>
          ) : null}

          <div className="border-line mt-auto flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3">
            <span className="font-display text-heading text-[15px]">
              {price ?? "Price on request"}
              {price ? (
                <span className="text-text-subtle ml-1 text-[11px] font-normal tracking-normal normal-case">
                  {experience.pricingUnit === "PER_PERSON" ? "per person" : "per group"}
                </span>
              ) : null}
            </span>

            <span className="text-text-subtle text-[11px]">
              {[duration, formatGuestRange(experience.minGuests, experience.maxGuests)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

/**
 * A grid of cards.
 *
 * Here rather than repeated per screen, so the column rhythm is one decision.
 */
export function ExperienceGrid({
  experiences,
}: {
  readonly experiences: readonly ExperienceSummary[];
}) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {experiences.map((experience, index) => (
        <ExperienceCard key={experience.id} experience={experience} priority={index < 3} />
      ))}
    </div>
  );
}
