"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  Armchair,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookmarkCheck,
  Clock,
  Crown,
  KeyRound,
  Lamp,
  Map as MapIcon,
  MapPin,
  Navigation,
  Sparkles,
  Timer,
} from "lucide-react";

import type { JourneyStop, LatLng } from "@/components/map/live-map-tracking";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration } from "@/lib/format";
import { addSavedCuration, isCurationSaved, subscribeSavedCurations } from "@/lib/saved-curations";
import type { Journey, JourneyChapter } from "@/modules/journeys/data";
import type { SensoryDescription, SensoryMatch } from "@/modules/viveniq/sensory-vector";

const LiveMapTracker = dynamic(
  () => import("@/components/map/LiveMapTracker").then((mod) => mod.LiveMapTracker),
  {
    ssr: false,
    loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
  },
);

/** What the page could read about each act's listing from the live catalogue. */
export interface JourneyActMedia {
  readonly coverUrl: string | null;
  readonly coverAlt: string;
  /** False when the listing is not published; null when the catalogue could not be read. */
  readonly available: boolean | null;
}

type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  /** Saved on the device; the server could not record it or send the itinerary. */
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "saved"; readonly emailed: boolean };

const NUMERALS = ["I", "II", "III"] as const;

/**
 * Pilot-corridor anchors the companion map starts from when the browser has no
 * location fix. Public landmarks, not a guess at the traveller's position — the
 * HUD labels the distance approximate until GPS answers.
 */
const CORRIDOR_ANCHORS: readonly LatLng[] = [
  { lat: 18.5158, lng: 73.9272 }, // Magarpatta City
  { lat: 18.5679, lng: 73.9143 }, // Viman Nagar
];

function nearestAnchor(to: LatLng): LatLng {
  const squared = (a: LatLng) => (a.lat - to.lat) ** 2 + (a.lng - to.lng) ** 2;
  return CORRIDOR_ANCHORS.reduce((best, anchor) =>
    squared(anchor) < squared(best) ? anchor : best,
  );
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * A curated journey as one experience: the arc, how the evening feels, every
 * act and the companion map.
 *
 * No price and no pass. "Add to My Curations" saves the journey on this device
 * and asks the server to email its itinerary — to the account's own address,
 * or to one a guest types. Once saved, every return to the page says so and
 * offers "Start My Journey", which opens the companion HUD. Saving reserves
 * nothing with any venue (CLAUDE.md §7).
 *
 * The sensory profile is the curators' editorial read, shown in words and never
 * as measured figures. The match is VivenIQ's deterministic comparison against
 * the visitor's Taste Genome, absent when there is nothing to compare.
 */
export function JourneyExperienceView({
  journey,
  media,
  sensory,
  sensoryMatch,
  signedIn,
  initialMapOpen = false,
}: {
  readonly journey: Journey;
  readonly media: readonly JourneyActMedia[];
  readonly sensory: SensoryDescription;
  /** Null when the visitor's genome declares nothing comparable. */
  readonly sensoryMatch: SensoryMatch | null;
  /** Signed in: the itinerary goes to the account's address, so none is asked for. */
  readonly signedIn: boolean;
  /** Opens the companion map on arrival, e.g. from VivenIQ's journey card. */
  readonly initialMapOpen?: boolean;
}) {
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [email, setEmail] = useState("");
  const [mapOpen, setMapOpen] = useState(initialMapOpen);
  /**
   * The evening was begun, not merely previewed on the map. Arriving with the
   * map open (My Curations' "Start My Journey") counts; it only takes effect
   * once the journey is known to be saved.
   */
  const [navigating, setNavigating] = useState(initialMapOpen);

  // Read from the device once hydrated; the server always renders "not saved".
  const storedSaved = useSyncExternalStore(
    subscribeSavedCurations,
    () => isCurationSaved(journey.id),
    () => false,
  );
  const saving = save.kind === "saving";
  const saved = !saving && (storedSaved || save.kind === "saved");
  const unavailable = media.some((act) => act.available === false);

  const stops = useMemo<readonly JourneyStop[]>(
    () =>
      journey.chapters.map((chapter) => ({
        name: chapter.experienceTitle,
        role: chapter.label,
        coordinates: chapter.coordinates,
        address: chapter.addressLine,
        slug: chapter.experienceSlug,
      })),
    [journey],
  );
  const fallbackOrigin = useMemo(() => nearestAnchor(stops[0]!.coordinates), [stops]);

  /**
   * Saved on the device first, so a server or mail failure never loses the
   * traveller's choice; the server then records it in the cookie and sends
   * the itinerary.
   */
  const addToCurations = async () => {
    setSave({ kind: "saving" });
    addSavedCuration(journey.id);
    try {
      const guestEmail = signedIn ? "" : email.trim();
      const result = await api.post<{ readonly itineraryEmailed: boolean }>(
        "/api/v1/user/curations",
        { journeyId: journey.id, ...(guestEmail ? { email: guestEmail } : {}) },
      );
      setSave({ kind: "saved", emailed: result.itineraryEmailed });
    } catch (error: unknown) {
      setSave({ kind: "failed", message: messageOf(error) });
    }
  };

  const startJourney = () => {
    setNavigating(true);
    setMapOpen(true);
  };

  return (
    <div className={cn("flex flex-col gap-10 lg:gap-14", saved && "pb-24 lg:pb-0")}>
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div className="max-w-[62ch]">
          <p className="eyebrow text-[10px] text-accent-ink lg:text-[11px] dark:text-accent">
            {journey.mood} · {journey.chapters.length === 2 ? "Two acts" : "Three acts"} · Signature
            Curated Experience
          </p>
          <h1 className="mt-3 font-display text-[30px] leading-[1.1] text-heading sm:text-[38px] lg:text-[46px]">
            {journey.title}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed font-light text-fg-muted lg:text-[16px]">
            {journey.tagline}
          </p>
        </div>
        <dl className="flex shrink-0 flex-wrap gap-x-8 gap-y-4 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <div>
            <dt className="eyebrow text-[10px] text-fg-subtle">Evening</dt>
            <dd className="mt-1 text-[15px] text-fg">
              {formatDuration(journey.totalDurationMinutes)}
            </dd>
          </div>
          {journey.timeSavedMinutes > 0 ? (
            <div>
              <dt className="eyebrow text-[10px] text-fg-subtle">Time saved</dt>
              <dd className="mt-1 text-[15px] text-fg">
                ~{formatDuration(journey.timeSavedMinutes)}
              </dd>
            </div>
          ) : null}
          {sensoryMatch ? (
            <div>
              <dt className="eyebrow text-[10px] text-fg-subtle">Sensory match</dt>
              <dd className="mt-1 font-display text-[22px] text-heading tabular-nums">
                {sensoryMatch.score}%
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {/* ── Timeline stepper ─────────────────────────────────────── */}
      <ol
        aria-label="Running order"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-fg"
      >
        {journey.chapters.map((chapter, index) => (
          <li key={chapter.role} className="flex items-center gap-3">
            <span className="inline-flex h-9 items-center gap-2 rounded-pill border border-line bg-surface px-3.5">
              <span className="font-display text-accent-ink dark:text-accent">
                {NUMERALS[index]}
              </span>
              <span className="font-medium">{chapter.label}</span>
              <span className="text-fg-muted tabular-nums">{formatClock(chapter.startMinute)}</span>
            </span>
            {index < journey.chapters.length - 1 ? (
              <ArrowRight className="h-4 w-4 text-fg-subtle" strokeWidth={1.6} aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>

      <SensoryPanel sensory={sensory} match={sensoryMatch} />

      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        {/* ── Acts ─────────────────────────────────────────────── */}
        <ol className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
          {journey.chapters.map((chapter, index) => (
            <ActCard
              key={chapter.role}
              chapter={chapter}
              numeral={NUMERALS[index]!}
              media={media[index] ?? null}
              next={journey.chapters[index + 1] ?? null}
            />
          ))}
          <li className="text-[12px] leading-relaxed font-light text-fg-muted">
            Start times are a suggested running order. Transitions allow fifteen to thirty minutes
            to walk or take a short cab between venues.
          </li>
        </ol>

        {/* ── My Curations ─────────────────────────────────────── */}
        <aside aria-label="Save this journey" className="lg:col-span-5 xl:col-span-4">
          <div className="flex flex-col gap-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-24">
            {saved ? (
              <>
                <div>
                  <p className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-accent/45 bg-surface-2 px-3 py-1 text-[12.5px] font-medium text-fg">
                    <BookmarkCheck
                      className="h-4 w-4 shrink-0 text-accent-ink dark:text-accent"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Saved to Your Curations
                  </p>
                  <p className="mt-4 font-display text-[24px] leading-tight text-heading">
                    Your evening awaits
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-fg-muted" aria-live="polite">
                    {save.kind === "saved" && save.emailed
                      ? "The itinerary is on its way to your inbox. "
                      : ""}
                    Begin whenever you&rsquo;re ready &mdash; the companion guides you act by act.
                  </p>
                </div>

                {save.kind === "failed" ? (
                  <Alert tone="warning" title="Saved on this device">
                    We couldn&rsquo;t send the itinerary just now. {save.message}
                  </Alert>
                ) : null}
                {unavailable ? (
                  <Alert tone="warning">
                    One of this journey&rsquo;s venues isn&rsquo;t taking bookings right now.
                  </Alert>
                ) : null}

                <span className="lv-gold-glow block">
                  <Button variant="primary" size="lg" className="w-full" onClick={startJourney}>
                    <Navigation className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    Start My Journey
                  </Button>
                </span>
              </>
            ) : (
              <>
                <div>
                  <p className="eyebrow text-[10px] text-fg-subtle">My Curations</p>
                  <p className="mt-2 font-display text-[24px] leading-tight text-heading">
                    Keep this evening
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-fg-muted">
                    Save it and we&rsquo;ll send the full itinerary &mdash;{" "}
                    {journey.chapters.length === 2 ? "both acts" : "all three acts"}, their
                    privileges and directions to each door.
                  </p>
                </div>

                {signedIn ? null : (
                  <TextField
                    label="Email the itinerary to"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    hint="Optional. Without it, the journey is saved on this device only."
                    value={email}
                    disabled={saving}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}

                {unavailable ? (
                  <Alert tone="warning">
                    One of this journey&rsquo;s venues isn&rsquo;t taking bookings right now.
                  </Alert>
                ) : null}

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={saving}
                  onClick={() => void addToCurations()}
                >
                  Add to My Curations
                </Button>

                {/* Not Button's `secondary`: its text colour is fixed and vanishes in dark mode. */}
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-pill border border-line-strong px-4 text-[13px] font-medium text-fg transition-colors duration-200 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <MapIcon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  Open Companion Map
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/*
       * Saved, on a phone or tablet: the card scrolls away, so the one action
       * the evening needs stays in reach. On desktop the card is sticky.
       */}
      {saved && !mapOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-accent/40 bg-panel/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-panel-fg shadow-editorial backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-[9.5px] text-accent">
                {navigating ? "Evening in progress" : "Saved to your curations"}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-panel-fg">
                Chapter I · {journey.chapters[0]?.experienceTitle ?? journey.title}
              </p>
            </div>
            <span className="lv-gold-glow shrink-0">
              <Button variant="gold" size="md" onClick={startJourney}>
                <Navigation className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                {navigating ? "Resume" : "Start"}
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      {mapOpen ? (
        <div className="fixed inset-0 z-[60]">
          <LiveMapTracker
            stops={stops}
            journeyTitle={journey.title}
            {...(saved ? { butlerDetours: true, navigating } : {})}
            fallbackOrigin={fallbackOrigin}
            onClose={() => setMapOpen(false)}
            closeLabel={navigating ? "Pause live tracking" : "Close companion map"}
          />
        </div>
      ) : null}
    </div>
  );
}

/** How the evening feels — the curators' read, and why it suits this visitor. */
function SensoryPanel({
  sensory,
  match,
}: {
  readonly sensory: SensoryDescription;
  readonly match: SensoryMatch | null;
}) {
  const notes = [
    { label: "Acoustic feel", value: sensory.acousticFeel, Icon: AudioLines },
    { label: "Lighting", value: sensory.lighting, Icon: Lamp },
    { label: "Seating privacy", value: sensory.seatingPrivacy, Icon: Armchair },
  ] as const;

  return (
    <section
      aria-labelledby="sensory-profile-title"
      className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2
          id="sensory-profile-title"
          className="eyebrow text-[10px] text-accent-ink lg:text-[11px] dark:text-accent"
        >
          Sensory profile
        </h2>
        <p className="text-[12px] font-light text-fg-muted">
          Our curators&rsquo; read of a typical evening
        </p>
      </div>

      {match && match.highlights.length > 0 ? (
        <div className="mt-4">
          <p className="text-[13px] text-fg">
            Why it suits you
            <span className="text-fg-muted tabular-nums"> · {match.score}% sensory match</span>
          </p>
          <ul aria-label="Sensory match highlights" className="mt-2 flex flex-wrap gap-2">
            {match.highlights.map((highlight) => (
              <li
                key={highlight}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-accent/45 bg-surface-2 px-3 py-1 text-[12.5px] text-fg"
              >
                <Sparkles
                  className="h-3.5 w-3.5 shrink-0 text-accent-ink dark:text-accent"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
        {notes.map(({ label, value, Icon }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="eyebrow text-[10px] text-fg-subtle">{label}</dt>
              <dd className="mt-1 text-[13.5px] leading-snug text-fg">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-start gap-2.5 rounded-card bg-surface-2 px-4 py-3">
        <KeyRound
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink dark:text-accent"
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="eyebrow text-[10px] text-fg-subtle">Secret ritual</p>
          <p className="mt-1 text-[13.5px] leading-relaxed font-light text-fg italic">
            {sensory.secretRitual}
          </p>
        </div>
      </div>
    </section>
  );
}

function ActCard({
  chapter,
  numeral,
  media,
  next,
}: {
  readonly chapter: JourneyChapter;
  readonly numeral: string;
  readonly media: JourneyActMedia | null;
  readonly next: JourneyChapter | null;
}) {
  const { privilege } = chapter;
  const transition = next ? next.startMinute - chapter.endMinute : null;

  return (
    <li className="flex flex-col gap-3">
      <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="relative aspect-[16/9] bg-surface-2 sm:aspect-auto sm:min-h-full">
          {media?.coverUrl ? (
            <Image
              src={media.coverUrl}
              alt={media.coverAlt}
              fill
              sizes="(min-width: 1024px) 280px, (min-width: 640px) 40vw, 100vw"
              className="object-cover"
            />
          ) : null}
          <span className="absolute top-3 left-3 inline-flex h-7 items-center rounded-pill bg-panel px-3 text-[11px] font-medium text-panel-fg">
            Act {numeral} · {chapter.label}
          </span>
        </div>

        <div className="flex flex-col p-5">
          <p className="flex items-center gap-1.5 text-[13px] text-fg tabular-nums">
            <Clock
              className="h-[14px] w-[14px] text-fg-muted"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            {formatClock(chapter.startMinute)} – {formatClock(chapter.endMinute)}
          </p>
          <h2 className="mt-2 font-display text-[17px] leading-snug text-heading">
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
          </h2>
          <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug font-light text-fg-muted">
            <MapPin className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            {chapter.addressLine}
          </p>
          {chapter.timeSavedMinutes > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-fg-muted">
              <Timer className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              Saves ~{chapter.timeSavedMinutes} min of research and queueing
            </p>
          ) : null}

          <div className="mt-4 border-t border-line pt-3">
            <p className="eyebrow flex items-center gap-1.5 text-[10px] text-accent-ink dark:text-accent">
              <Crown className="h-[13px] w-[13px]" strokeWidth={1.6} aria-hidden="true" />
              VIP Privilege
            </p>
            <p className="mt-1.5 text-[13.5px] font-medium text-fg">{privilege.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed font-light text-fg-muted">
              {privilege.detail}
            </p>
            {privilege.confirmed ? null : (
              <p className="mt-1.5 text-[11.5px] text-fg-muted italic">
                Requested on your behalf — subject to the venue&apos;s confirmation.
              </p>
            )}
          </div>
        </div>
      </article>

      {transition !== null ? (
        <p
          className={cn("pl-5 text-[12px] text-fg-muted")}
          aria-label={`${transition} minutes to the ${next!.label.toLowerCase()}`}
        >
          ↓ {transition} min to the {next!.label.toLowerCase()}
        </p>
      ) : null}
    </li>
  );
}
