import { Check, Footprints, MapPin, Radar } from "lucide-react";

import { LiveTrackTrigger } from "@/components/copilot/CopilotProvider";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import type { ConciergeMatch } from "@/modules/concierge/service";

/**
 * One concierge pick. A server component: every figure on it — the party
 * total, the per-head share, the distance and the reasons — is read off the
 * match the deterministic ranking produced, never recomputed here
 * (CLAUDE.md §7).
 *
 * "Walk There" opens the live map tracker on the listing's stored
 * coordinates; "Book" goes to the listing's own booking flow, which quotes
 * the same price through the same `quoteBooking`.
 */
export function ConciergeMatchCard({
  match,
  top,
  partySize,
}: {
  readonly match: ConciergeMatch;
  readonly top: boolean;
  readonly partySize: number;
}) {
  const perHead = formatMoneyMinor(match.perPersonMinor, match.currency);

  return (
    <li
      className={cn(
        "rounded-card border bg-surface p-5 sm:p-6",
        top ? "border-accent shadow-card" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {top ? (
            <p className="eyebrow text-[10px] text-accent-ink dark:text-accent">
              Best match right now
            </p>
          ) : null}
          <h2
            className={cn(
              "font-display text-[19px] leading-snug text-heading sm:text-[22px]",
              top && "mt-1.5",
            )}
          >
            {match.title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed font-light text-fg-muted">
            {match.addressLine}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              {match.withinHotspot ? (
                <MapPin className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Footprints className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              )}
              {match.distanceLabel}
            </span>
            {!match.withinHotspot && match.walkable ? (
              <span>~{match.walkMinutes} min on foot</span>
            ) : null}
          </p>
        </div>

        <p className="text-right">
          <span className="block font-display text-[22px] leading-none text-heading tabular-nums sm:text-[26px]">
            {match.totalLabel}
          </span>
          <span className="mt-1.5 block text-[12px] text-fg-muted">{match.partyLabel}</span>
          {partySize > 1 ? (
            <span className="mt-0.5 block text-[12px] text-fg-muted tabular-nums">
              {perHead} each
            </span>
          ) : null}
        </p>
      </div>

      <p className="mt-4 text-[13.5px] leading-relaxed font-light text-fg">{match.summary}</p>

      <h3 className="eyebrow mt-4 text-[10px] text-fg-subtle">Why it matches</h3>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {match.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-1.5 text-[13px] leading-snug text-fg">
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary dark:text-accent"
              strokeWidth={2}
              aria-hidden="true"
            />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-2">
        <LiveTrackTrigger
          target={{
            slug: match.actions.walk.slug,
            title: match.actions.walk.title,
            destination: match.actions.walk.destination,
          }}
          aria-label={`${match.actions.walk.label} to ${match.title} with live tracking`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-cta px-5 text-[12.5px] font-medium text-cta-fg shadow-card transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-0"
        >
          <Radar className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          {match.actions.walk.label}
        </LiveTrackTrigger>
        <ButtonLink href={match.actions.book.href} variant={top ? "primary" : "secondary"}>
          {match.actions.book.label}
        </ButtonLink>
      </div>
    </li>
  );
}
