"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Footprints,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Radar,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { LiveTrackTrigger } from "@/components/copilot/CopilotProvider";
import { LiveDot } from "@/components/map/LiveDot";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  BUDGET_TIERS,
  CRAVING_CHIPS,
  DEFAULT_HOTSPOT_ID,
  HOTSPOTS,
  PARTY_SIZE,
  partyKind,
  type BudgetTier,
  type HotspotId,
} from "@/modules/concierge/options";
import type { ConciergeMatch, ConciergeResult } from "@/modules/concierge/service";

/**
 * The Instant Vibe Concierge — where am I, what am I craving, how many of us,
 * what can we spend. Every change re-asks `GET /api/v1/concierge`, so the
 * cards follow the traveller's taps without a submit.
 *
 * Nothing on a card is computed here: distance, party total and the reasons
 * come from the server's deterministic ranking over the catalogue
 * (CLAUDE.md §7). "Walk There" opens the live map tracker on the listing's
 * stored coordinates; "Book Slot" goes to the listing's own booking flow.
 */

type Place = { kind: "hotspot"; id: HotspotId } | { kind: "gps"; lat: number; lng: number };
type GeoStatus = "idle" | "locating" | "denied" | "unavailable";
type Status = "loading" | "ready" | "error";

/** Wait this long after the last tap before asking, so a run of taps is one request. */
const DEBOUNCE_MS = 180;

/** ~11 m. Enough for "450m walk"; less identifying than a raw device fix. */
const roundCoordinate = (value: number) => Math.round(value * 10_000) / 10_000;

const PARTY_LABELS = { solo: "Solo", duo: "Duo", squad: "Squad" } as const;

/*
 * `cn` concatenates rather than merging, so a later `px-0` cannot override an
 * earlier `px-4` — the padding lives in `chip` and `stepper` separately.
 */
const control =
  "inline-flex min-h-10 items-center rounded-pill border text-[13px] transition-colors duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45";
const chip = `${control} gap-1.5 px-4`;
const stepper = `${control} w-10 justify-center`;
const chipOn = "border-primary bg-primary text-text-inverse";
const chipOff = "border-line bg-surface text-fg hover:border-line-strong";

export function InstantVibeConcierge({
  headingId,
  className,
}: {
  readonly headingId: string;
  readonly className?: string;
}) {
  const [place, setPlace] = useState<Place>({ kind: "hotspot", id: DEFAULT_HOTSPOT_ID });
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [craving, setCraving] = useState("beer");
  const [draft, setDraft] = useState("");
  const [party, setParty] = useState(2);
  const [budget, setBudget] = useState<BudgetTier>("pocket");

  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  const params = new URLSearchParams({ craving, party: String(party), budget });
  if (place.kind === "gps") {
    params.set("lat", String(place.lat));
    params.set("lng", String(place.lng));
  } else {
    params.set("hotspot", place.id);
  }
  const query = params.toString();

  useEffect(() => {
    const request = ++latest.current;
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const data = await api.get<ConciergeResult>(`/api/v1/concierge?${query}`);
        if (request !== latest.current) return;
        setResult(data);
        setError(null);
        setStatus("ready");
      } catch (caught) {
        if (request !== latest.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "We couldn't reach the concierge. Check your connection and try again.",
        );
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, attempt]);

  function locate() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlace({
          kind: "gps",
          lat: roundCoordinate(position.coords.latitude),
          lng: roundCoordinate(position.coords.longitude),
        });
        setGeoStatus("idle");
      },
      (failure) => {
        setGeoStatus(failure.code === failure.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 },
    );
  }

  function chooseCraving(value: string) {
    setCraving(value);
    setDraft("");
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text) setCraving(text);
  }

  const isChip = CRAVING_CHIPS.some((option) => option.value === craving);
  const kind = partyKind(party);
  const matches = result?.matches ?? [];
  const refreshing = status === "loading" && result !== null;

  return (
    <div
      className={cn(
        "grid gap-8 rounded-[1.75rem] border border-line bg-surface p-5 shadow-card sm:p-7 lg:grid-cols-12 lg:gap-12 lg:p-10 xl:p-12",
        className,
      )}
    >
      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="lg:col-span-5">
        <p className="eyebrow flex items-center gap-2 text-[10px] text-fg-subtle lg:text-[11px]">
          <LiveDot />
          Instant Vibe Concierge
        </p>
        <h2
          id={headingId}
          className="mt-3 font-display text-[24px] leading-[1.15] text-heading sm:text-[28px] lg:text-[32px]"
        >
          What&rsquo;s the vibe right now?
        </h2>
        <p className="mt-2 max-w-[44ch] text-[13.5px] leading-relaxed font-light text-fg-muted lg:text-[15px]">
          Tell us where you are and what you&rsquo;re craving. We&rsquo;ll find the closest spot
          that fits your crew and your budget.
        </p>

        {/* Where */}
        <fieldset className="mt-6">
          <legend className="eyebrow text-[10px] text-fg-subtle">Where are you?</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={geoStatus === "locating"}
              aria-pressed={place.kind === "gps"}
              className={cn(chip, place.kind === "gps" ? chipOn : chipOff)}
            >
              <LocateFixed className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {geoStatus === "locating" ? "Locating…" : "Use my location"}
            </button>
            {HOTSPOTS.map((hotspot) => {
              const on = place.kind === "hotspot" && place.id === hotspot.id;
              return (
                <button
                  key={hotspot.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPlace({ kind: "hotspot", id: hotspot.id })}
                  className={cn(chip, on ? chipOn : chipOff)}
                >
                  <MapPin className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                  {hotspot.label}
                </button>
              );
            })}
          </div>
          {geoStatus === "denied" || geoStatus === "unavailable" ? (
            <p className="mt-2 text-[12.5px] text-fg-muted" role="status">
              {geoStatus === "denied"
                ? "Location access is off — tap where you are instead."
                : "We couldn't get a location fix — tap where you are instead."}
            </p>
          ) : null}
        </fieldset>

        {/* Craving */}
        <fieldset className="mt-6">
          <legend className="eyebrow text-[10px] text-fg-subtle">Craving</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {CRAVING_CHIPS.map((option) => {
              const on = craving === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseCraving(option.value)}
                  className={cn(chip, on ? chipOn : chipOff)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <form onSubmit={submitDraft} className="mt-2.5 flex gap-2">
            <label htmlFor={`${headingId}-craving`} className="sr-only">
              Or describe a craving
            </label>
            <input
              id={`${headingId}-craving`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={80}
              placeholder={isChip ? "Or type it: “live music”, “ramen”…" : craving}
              className="h-10 min-w-0 flex-1 rounded-pill border border-line bg-bg px-4 text-[13px] text-fg placeholder:text-fg-subtle focus-visible:border-primary focus-visible:outline-none"
            />
            <button type="submit" className={cn(chip, chipOff)}>
              <Search className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Find</span>
            </button>
          </form>
        </fieldset>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {/* Party */}
          <fieldset>
            <legend className="eyebrow text-[10px] text-fg-subtle">Party</legend>
            <div className="mt-2.5 flex items-center gap-3">
              <button
                type="button"
                aria-label="One fewer guest"
                disabled={party <= PARTY_SIZE.min}
                onClick={() => setParty((current) => Math.max(PARTY_SIZE.min, current - 1))}
                className={cn(stepper, chipOff)}
              >
                <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
              <p
                className="flex min-w-[96px] items-center justify-center gap-1.5 text-[14px] text-fg tabular-nums"
                aria-live="polite"
              >
                <Users className="h-4 w-4 text-fg-muted" strokeWidth={1.6} aria-hidden="true" />
                {party} · {PARTY_LABELS[kind]}
              </p>
              <button
                type="button"
                aria-label="One more guest"
                disabled={party >= PARTY_SIZE.max}
                onClick={() => setParty((current) => Math.min(PARTY_SIZE.max, current + 1))}
                className={cn(stepper, chipOff)}
              >
                <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </fieldset>

          {/* Budget */}
          <fieldset>
            <legend className="eyebrow text-[10px] text-fg-subtle">Budget per person</legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {BUDGET_TIERS.map((tier) => {
                const on = budget === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBudget(tier.id)}
                    className={cn(chip, on ? chipOn : chipOff)}
                  >
                    {tier.range}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      <div className="lg:col-span-7" aria-busy={status === "loading"}>
        {result ? (
          <p className="text-[12.5px] text-fg-muted" aria-live="polite">
            {matches.length > 0
              ? `${matches.length === 1 ? "1 pick" : `${matches.length} picks`} for ${result.craving.label} near ${result.location.label}`
              : `Nothing for ${result.craving.label} near ${result.location.label} yet`}
          </p>
        ) : null}
        {result?.location.notice ? (
          <div className="mt-3">
            <Alert tone="info">{result.location.notice}</Alert>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="mt-3 space-y-3">
            <Alert tone="danger" title="The concierge is unavailable">
              {error}
            </Alert>
            <button
              type="button"
              className={cn(chip, chipOff)}
              onClick={() => setAttempt((n) => n + 1)}
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : !result ? (
          <ul className="mt-3 space-y-3" aria-label="Loading picks">
            {[0, 1].map((index) => (
              <li key={index} className="rounded-card border border-line p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-5 w-3/4" />
                <Skeleton className="mt-3 h-3 w-1/2" />
                <Skeleton className="mt-5 h-10 w-full" />
              </li>
            ))}
          </ul>
        ) : matches.length === 0 ? (
          <div className="mt-3 rounded-card border border-dashed border-line-strong p-6 text-center">
            <Sparkles
              className="mx-auto h-6 w-6 text-accent-ink dark:text-accent"
              strokeWidth={1.4}
              aria-hidden="true"
            />
            <p className="mt-3 font-display text-[18px] text-heading">No match for that combo</p>
            <p className="mx-auto mt-1.5 max-w-[40ch] text-[13px] leading-relaxed font-light text-fg-muted">
              Try a different budget or craving — or a smaller party, since some venues cap their
              tables.
            </p>
            {budget !== "luxury" ? (
              <button
                type="button"
                className={cn(chip, chipOff, "mt-4")}
                onClick={() => setBudget(budget === "pocket" ? "mid" : "luxury")}
              >
                Stretch the budget
              </button>
            ) : null}
          </div>
        ) : (
          <ol
            className={cn(
              "mt-3 space-y-3 transition-opacity duration-200",
              refreshing && "opacity-60",
            )}
          >
            {matches.map((match, index) => (
              <MatchCard key={match.slug} match={match} top={index === 0} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, top }: { readonly match: ConciergeMatch; readonly top: boolean }) {
  return (
    <li
      className={cn(
        "rounded-card border bg-bg p-4 sm:p-5",
        top ? "border-accent shadow-card" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {top ? (
            <p className="eyebrow text-[10px] text-accent-ink dark:text-accent">
              Best match right now
            </p>
          ) : null}
          <h3
            className={cn(
              "font-display text-[17px] leading-snug text-heading sm:text-[19px]",
              top && "mt-1.5",
            )}
          >
            {match.title}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-muted">
            <span className="inline-flex items-center gap-1 font-medium text-fg">
              {match.withinHotspot ? (
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Footprints className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              )}
              {match.distanceLabel}
            </span>
            {!match.withinHotspot && match.walkable ? <span>~{match.walkMinutes} min</span> : null}
          </p>
        </div>
        <p className="text-right">
          <span className="block font-display text-[20px] leading-none text-heading tabular-nums sm:text-[22px]">
            {match.totalLabel}
          </span>
          <span className="mt-1 block text-[11.5px] text-fg-muted">{match.partyLabel}</span>
        </p>
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {match.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-fg">
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary dark:text-accent"
              strokeWidth={2}
              aria-hidden="true"
            />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <LiveTrackTrigger
          target={{
            slug: match.actions.walk.slug,
            title: match.actions.walk.title,
            destination: match.actions.walk.destination,
          }}
          aria-label={`${match.actions.walk.label} to ${match.title} with live tracking`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-cta px-4 text-[12.5px] font-medium text-cta-fg shadow-card transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-0"
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
