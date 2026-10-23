"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Beer,
  Coffee,
  Flower2,
  Gamepad2,
  LocateFixed,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";

import { GenieSparkle, GenieStar } from "@/components/icons";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import {
  COPILOT_TEXT_LIMITS,
  type CopilotMood,
  type CopilotResponse,
  type CopilotSuggestion,
} from "@/modules/copilot/types";
import {
  DEFAULT_HOTSPOT,
  DEFAULT_RADIUS_INDEX,
  MOOD_OPTIONS,
  PILOT_HOTSPOTS,
  RADIUS_STOPS_KM,
  copilotErrorMessage,
  findHotspot,
  isWithinPilotCorridor,
} from "@/components/copilot/copilot-options";

/**
 * The Live Travel Copilot drawer — a bottom sheet below `lg`, a right-hand
 * slide-over above it.
 *
 * Every fact a card shows (distance, price, map link, image) comes from
 * `POST /api/v1/copilot`, which reads them from the published catalogue. The
 * drawer adds nothing of its own beyond presentation (CLAUDE.md §7).
 *
 * Searches run live: changing the place, mood or radius re-queries after a
 * short debounce, and a newer request aborts the one in flight. Free text only
 * runs when submitted, so typing does not fire a request per keystroke.
 *
 * The panel stays mounted while closed — `inert` and `invisible` take it out of
 * the tab order and the accessibility tree — so results and settings survive a
 * close and reopen, and the slide animates both ways.
 */

export interface CopilotPreset {
  readonly query?: string;
  readonly mood?: CopilotMood;
  /** Changes on every `open()` that carries a preset, so a repeat is honoured. */
  readonly nonce: number;
}

const MOOD_ICONS: Record<string, LucideIcon> = {
  gaming: Gamepad2,
  nightlife: Beer,
  cafe: Coffee,
  dining: UtensilsCrossed,
  spa: Flower2,
};

const REQUEST_TIMEOUT_MS = 15_000;
const DEBOUNCE_MS = 250;

type Place =
  | { readonly kind: "hotspot"; readonly id: string }
  | { readonly kind: "gps"; readonly lat: number; readonly lng: number };

type GeoStatus = "idle" | "locating" | "denied" | "unavailable" | "unsupported";

type RequestState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly data: CopilotResponse }
  | { readonly status: "error"; readonly message: string };

function isCopilotResponse(value: unknown): value is CopilotResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { suggestions?: unknown }).suggestions)
  );
}

const GEO_MESSAGES: Partial<Record<GeoStatus, string>> = {
  denied: "Location access is off, so we're using a pilot hotspot. Pick the one nearest you.",
  unavailable: "We couldn't get a location fix, so we're using a pilot hotspot instead.",
  unsupported: "This browser can't share a location, so we're using a pilot hotspot.",
};

export function LiveTravelCopilot({
  open,
  onClose,
  preset,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly preset?: CopilotPreset | undefined;
}) {
  const titleId = useId();
  const statusId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  const [place, setPlace] = useState<Place>({ kind: "hotspot", id: DEFAULT_HOTSPOT.id });
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [mood, setMood] = useState<CopilotMood | null>(null);
  const [radiusIndex, setRadiusIndex] = useState(DEFAULT_RADIUS_INDEX);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<RequestState>({ status: "idle" });

  // A preset (from a Genie prompt, say) replaces the text and mood. Adjusted
  // during render rather than in an effect, so the first fetch already uses it.
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);
  if (preset && preset.nonce !== appliedNonce) {
    setAppliedNonce(preset.nonce);
    if (preset.query !== undefined) {
      setDraft(preset.query);
      setQuery(preset.query);
    }
    if (preset.mood !== undefined) setMood(preset.mood);
  }

  const point = place.kind === "gps" ? { lat: place.lat, lng: place.lng } : findHotspot(place.id);
  const radiusKm = RADIUS_STOPS_KM[radiusIndex] ?? RADIUS_STOPS_KM[DEFAULT_RADIUS_INDEX];
  const placeLabel = place.kind === "gps" ? "your location" : findHotspot(place.id).label;
  const outsidePilot = place.kind === "gps" && !isWithinPilotCorridor(point);

  /* ------------------------------------------------------------- location */

  function locate() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlace({
          kind: "gps",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGeoStatus("idle");
      },
      (error) => {
        setGeoStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
        setPlace((current) =>
          current.kind === "gps" ? { kind: "hotspot", id: DEFAULT_HOTSPOT.id } : current,
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // If the traveller has already granted location access, use it without
  // asking. Otherwise the pilot hotspot stands until they choose to share.
  useEffect(() => {
    if (!open || typeof navigator === "undefined" || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (!cancelled && result.state === "granted" && place.kind === "hotspot") locate();
      })
      .catch(() => {
        // Permissions API unsupported for geolocation; the toggle still works.
      });
    return () => {
      cancelled = true;
    };
    // Only on first open — not on every place change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* -------------------------------------------------------------- fetching */

  const lat = point.lat;
  const lng = point.lng;

  useEffect(() => {
    if (!open) return;

    const body = {
      lat,
      lng,
      radiusKm,
      ...(mood ? { mood } : {}),
      ...(query.trim() ? { query: query.trim() } : {}),
    };
    const key = JSON.stringify({ ...body, attempt });
    if (key === lastKeyRef.current) return;

    const controller = new AbortController();
    let timedOut = false;
    let timeout: number | undefined;

    const debounce = window.setTimeout(async () => {
      setRequest({ status: "loading" });
      timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch("/api/v1/copilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setRequest({ status: "error", message: copilotErrorMessage(response.status, payload) });
        } else if (!isCopilotResponse(payload)) {
          setRequest({
            status: "error",
            message: "The copilot sent back something we couldn't read. Please try again.",
          });
        } else {
          setRequest({ status: "success", data: payload });
        }
        lastKeyRef.current = key;
      } catch {
        // Superseded by a newer request, or the drawer closed: say nothing.
        if (controller.signal.aborted && !timedOut) return;
        setRequest({
          status: "error",
          message: timedOut
            ? "That took longer than it should. Please try again."
            : "We couldn't reach the copilot. Check your connection and try again.",
        });
        lastKeyRef.current = key;
      } finally {
        window.clearTimeout(timeout);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounce);
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, lat, lng, radiusKm, mood, query, attempt]);

  /* ------------------------------------------------- focus, keys, scrolling */

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The close button rather than the search field: focusing a text input
    // would throw the on-screen keyboard over the sheet on a phone.
    closeRef.current?.focus({ preventScroll: true });

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      restoreFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    // Keep focus inside the dialog while it is open.
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draft.trim());
    // Resubmitting the same text is a request to run it again.
    if (draft.trim() === query) setAttempt((value) => value + 1);
  }

  const retry = () => setAttempt((value) => value + 1);

  /* ---------------------------------------------------------------- render */

  const geoMessage = GEO_MESSAGES[geoStatus];

  return (
    <div
      className={cn("fixed inset-0 z-[60]", open ? "visible" : "pointer-events-none invisible")}
      inert={!open}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-bg/60 backdrop-blur-md",
          "motion-safe:transition-opacity motion-safe:duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusId}
        onKeyDown={onPanelKeyDown}
        className={cn(
          "absolute flex flex-col overflow-hidden border-line bg-bg shadow-editorial",
          // Bottom sheet on phones and tablets…
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.75rem] border-t",
          // …a centred concierge spotlight from `lg`.
          "lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:w-full lg:max-w-3xl lg:max-h-[85vh] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[1.75rem] lg:border",
          "motion-safe:transition-[translate,scale,opacity] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "translate-y-0 lg:scale-100 lg:opacity-100"
            : "translate-y-full lg:scale-95 lg:opacity-0",
        )}
      >
        {/* Grab handle — decorative; the close button is the real control. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 block h-1 w-10 shrink-0 rounded-pill bg-line-strong lg:hidden"
        />

        {/* Header */}
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 pt-3 pb-4 lg:px-7 lg:pt-7 lg:pb-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-accent-ink">
            <GenieStar className="h-[22px] w-[22px]" strokeWidth={1.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-[19px] leading-tight text-heading">
              Live Travel Copilot
            </h2>
            <p className="mt-1 text-[12.5px] leading-snug font-light text-fg-muted">
              Pune pilot · Amanora, Seasons Mall, Magarpatta, Hadapsar
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the travel copilot"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-200 hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:px-7">
          {/* Search */}
          <form role="search" onSubmit={onSubmit} className="relative">
            <label htmlFor={`${titleId}-q`} className="sr-only">
              Describe what you&rsquo;re in the mood for
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-fg-subtle"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <input
              id={`${titleId}-q`}
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={COPILOT_TEXT_LIMITS.query}
              placeholder="e.g., cold beer and bowling near Seasons Mall"
              enterKeyHint="search"
              autoComplete="off"
              className="h-12 w-full rounded-pill border border-line bg-surface pr-24 pl-11 text-[14px] text-fg shadow-card placeholder:text-fg-subtle focus:border-line-strong"
            />
            <button
              type="submit"
              className="absolute top-1/2 right-1.5 h-9 -translate-y-1/2 rounded-pill bg-cta px-4 text-[13px] font-medium text-cta-fg transition-colors duration-200 hover:bg-cta-hover"
            >
              Ask
            </button>
          </form>

          {/* Location */}
          <fieldset className="mt-6">
            <legend className="eyebrow text-[10.5px] text-fg-subtle">Where</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={locate}
                disabled={geoStatus === "locating"}
                aria-pressed={place.kind === "gps"}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-pill border px-4 text-[13px] transition-colors duration-200 disabled:cursor-wait disabled:opacity-60",
                  place.kind === "gps"
                    ? "border-transparent bg-cta text-cta-fg"
                    : "border-line bg-surface text-fg hover:border-line-strong",
                )}
              >
                <LocateFixed
                  className={cn("h-4 w-4", geoStatus === "locating" && "motion-safe:animate-spin")}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {geoStatus === "locating"
                  ? "Locating…"
                  : place.kind === "gps"
                    ? "My location"
                    : "Use my location"}
              </button>
              {PILOT_HOTSPOTS.map((hotspot) => {
                const active = place.kind === "hotspot" && place.id === hotspot.id;
                return (
                  <button
                    key={hotspot.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPlace({ kind: "hotspot", id: hotspot.id })}
                    className={cn(
                      "inline-flex h-11 items-center gap-1.5 rounded-pill border px-4 text-[13px] transition-colors duration-200",
                      active
                        ? "border-transparent bg-cta text-cta-fg"
                        : "border-line bg-surface text-fg hover:border-line-strong",
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {hotspot.label}
                  </button>
                );
              })}
            </div>
            {geoMessage || outsidePilot ? (
              <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-fg-muted">
                {outsidePilot
                  ? "You seem to be outside the Pune pilot area, so there may be nothing nearby yet. Pick a hotspot to explore the corridor."
                  : geoMessage}
              </p>
            ) : null}
          </fieldset>

          {/* Mood */}
          <fieldset className="mt-6">
            <legend className="eyebrow text-[10.5px] text-fg-subtle">Mood</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((option) => {
                const Icon = MOOD_ICONS[option.mood] ?? GenieSparkle;
                const active = mood === option.mood;
                return (
                  <button
                    key={option.mood}
                    type="button"
                    aria-pressed={active}
                    title={option.hint}
                    onClick={() => setMood(active ? null : option.mood)}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-pill border px-4 text-[13px] transition-colors duration-200",
                      active
                        ? "border-transparent bg-cta text-cta-fg"
                        : "border-line bg-surface-2 text-fg hover:bg-surface-3",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Radius */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <label htmlFor={`${titleId}-radius`} className="eyebrow text-[10.5px] text-fg-subtle">
                Within
              </label>
              <span className="text-[13px] font-medium text-heading">{radiusKm} km</span>
            </div>
            <input
              id={`${titleId}-radius`}
              type="range"
              min={0}
              max={RADIUS_STOPS_KM.length - 1}
              step={1}
              value={radiusIndex}
              onChange={(event) => setRadiusIndex(Number(event.target.value))}
              aria-valuetext={`${radiusKm} kilometres`}
              className="mt-3 h-11 w-full cursor-pointer accent-primary dark:accent-accent"
            />
            <div aria-hidden="true" className="flex justify-between text-[11px] text-fg-subtle">
              {RADIUS_STOPS_KM.map((stop) => (
                <span key={stop}>{stop} km</span>
              ))}
            </div>
          </div>

          {/* Results */}
          <section aria-label="Suggestions" className="mt-8 border-t border-line pt-6">
            <p id={statusId} role="status" aria-live="polite" className="sr-only">
              {request.status === "loading"
                ? `Finding suggestions near ${placeLabel}`
                : request.status === "success"
                  ? `${request.data.count} suggestions within ${radiusKm} kilometres of ${placeLabel}`
                  : ""}
            </p>

            {request.status === "idle" || request.status === "loading" ? (
              <ResultsSkeleton />
            ) : request.status === "error" ? (
              <div className="flex flex-col items-start gap-4">
                <Alert tone="danger" title="Something went wrong">
                  {request.message}
                </Alert>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-5 text-[13px] font-medium text-fg transition-colors duration-200 hover:bg-surface-2"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : request.data.suggestions.length === 0 ? (
              <EmptyResults
                placeLabel={placeLabel}
                canWiden={radiusIndex < RADIUS_STOPS_KM.length - 1}
                hasFilters={mood !== null || query !== ""}
                onWiden={() => setRadiusIndex(RADIUS_STOPS_KM.length - 1)}
                onClearFilters={() => {
                  setMood(null);
                  setDraft("");
                  setQuery("");
                }}
              />
            ) : (
              <>
                <p className="text-[13px] text-fg-muted">
                  <span className="font-medium text-heading">{request.data.count}</span>{" "}
                  {request.data.count === 1 ? "pick" : "picks"} within {radiusKm} km of {placeLabel}
                </p>
                <ul className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-2">
                  {request.data.suggestions.map((suggestion) => (
                    <li key={suggestion.id}>
                      <SuggestionCard suggestion={suggestion} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="mt-6 text-[11.5px] leading-relaxed font-light text-fg-subtle">
              Distances and prices are read from the live catalogue, never generated. Check times
              and availability on the experience page before you go.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { readonly suggestion: CopilotSuggestion }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = suggestion.imageUrl && !imageFailed;

  return (
    <article className="rounded-card border border-line bg-surface p-3.5 shadow-card">
      <div className="flex gap-3.5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
          {showImage ? (
            <Image
              src={suggestion.imageUrl!}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-accent-ink">
              <GenieStar className="h-7 w-7" strokeWidth={1.1} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate text-[10px] text-fg-subtle">{suggestion.category}</p>
          <h3 className="mt-1 line-clamp-2 font-display text-[15.5px] leading-snug text-heading">
            {suggestion.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-fg">
              <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              {suggestion.distanceText}
            </span>
            <span className="text-[13px] font-medium text-heading">
              {suggestion.priceFormatted}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3.5 rounded-2xl border-l-2 border-accent bg-primary/[0.06] px-3.5 py-3 dark:bg-accent/[0.08]">
        <p className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.14em] text-accent-ink uppercase">
          <GenieSparkle className="h-3.5 w-3.5" />
          Why you will love it
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg">{suggestion.whyYouWillLoveIt}</p>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <a
          href={suggestion.googleMapsUrl}
          target="_blank"
          // `noreferrer` keeps this page's URL off the request to Google.
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-pill bg-cta px-3 text-[13px] font-medium text-cta-fg transition-colors duration-200 hover:bg-cta-hover"
        >
          <Navigation className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          Take Me There
          <span className="sr-only"> (opens Google Maps in a new tab)</span>
        </a>
        <Link
          href={`/experiences/${encodeURIComponent(suggestion.slug)}`}
          className="group inline-flex h-11 items-center justify-center gap-1.5 rounded-pill border border-line-strong px-3 text-[13px] font-medium text-fg transition-colors duration-200 hover:bg-surface-2"
        >
          Explore Details
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </Link>
      </div>
    </article>
  );
}

function ResultsSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
      {[0, 1, 2].map((index) => (
        <li key={index} className="rounded-card border border-line bg-surface p-3.5">
          <div className="flex gap-3.5">
            <Skeleton className="h-24 w-24 shrink-0 rounded-2xl" />
            <div className="flex flex-1 flex-col gap-2.5 pt-1">
              <Skeleton className="h-2.5 w-1/3" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-3.5 h-14 w-full rounded-2xl" />
        </li>
      ))}
    </ul>
  );
}

function EmptyResults({
  placeLabel,
  canWiden,
  hasFilters,
  onWiden,
  onClearFilters,
}: {
  readonly placeLabel: string;
  readonly canWiden: boolean;
  readonly hasFilters: boolean;
  readonly onWiden: () => void;
  readonly onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-accent-ink">
        <GenieStar className="h-6 w-6" strokeWidth={1.2} />
      </span>
      <h3 className="font-display text-[17px] text-heading">Nothing matches just yet</h3>
      <p className="max-w-[34ch] text-[13px] leading-relaxed text-fg-muted">
        We couldn&rsquo;t find a published experience near {placeLabel} for that. Try a wider radius
        or a different mood.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {canWiden ? (
          <button
            type="button"
            onClick={onWiden}
            className="inline-flex h-11 items-center rounded-pill bg-cta px-5 text-[13px] font-medium text-cta-fg transition-colors duration-200 hover:bg-cta-hover"
          >
            Search {RADIUS_STOPS_KM[RADIUS_STOPS_KM.length - 1]} km
          </button>
        ) : null}
        {hasFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex h-11 items-center rounded-pill border border-line-strong px-5 text-[13px] font-medium text-fg transition-colors duration-200 hover:bg-surface-2"
          >
            Clear mood &amp; text
          </button>
        ) : null}
      </div>
    </div>
  );
}
