"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Footprints, Car, RefreshCw, Sparkles } from "lucide-react";

import { PartyStepper } from "@/components/trips/PartyStepper";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration, formatMoneyMinor } from "@/lib/format";
import { COPILOT_MOODS, type CopilotMood } from "@/modules/copilot/types";
import {
  ITINERARY_BUDGET_RUPEES,
  ITINERARY_MAX_MOODS,
  ITINERARY_PARTY,
  ITINERARY_STOPS,
  ITINERARY_WINDOW,
  type Itinerary,
  type ItineraryRequestInput,
  type ItineraryResult,
  type ItineraryStop,
} from "@/modules/itinerary/types";

const MOOD_LABELS: Readonly<Record<CopilotMood, string>> = {
  gaming: "Gaming",
  nightlife: "Night out",
  cafe: "Café",
  dining: "Dining",
  spa: "Spa",
  adventure: "Adventure",
  peaceful: "Peaceful",
};

const clock = (minute: number) => (minute === 24 * 60 ? "24:00" : formatClock(minute));

/** Half-hour steps, labelled as the clock reads. */
function timeOptions(from: number, to: number) {
  const options: { value: string; label: string }[] = [];
  for (let minute = from; minute <= to; minute += 30) {
    options.push({ value: clock(minute), label: minute === 24 * 60 ? "Midnight" : clock(minute) });
  }
  return options;
}

const START_OPTIONS = timeOptions(ITINERARY_WINDOW.earliestStart, 23 * 60);
const END_OPTIONS = timeOptions(ITINERARY_WINDOW.earliestStart + 60, ITINERARY_WINDOW.latestEnd);
const STOP_CHOICES = [2, 3, 4].filter(
  (count) => count >= ITINERARY_STOPS.min && count <= ITINERARY_STOPS.max,
);

type Preferences = ItineraryRequestInput["preferences"];

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "done"; readonly result: ItineraryResult; readonly preferences: Preferences };

type SwapState =
  | { readonly kind: "idle" }
  | { readonly kind: "swapping"; readonly index: number }
  | { readonly kind: "message"; readonly tone: "info" | "danger"; readonly text: string };

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.issues[0]?.message ?? error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

const money = (minor: number, currency: string) => formatMoneyMinor(minor, currency) ?? "—";

/**
 * The itinerary synthesizer: preferences in, a scheduled plan out, with a
 * per-stop swap.
 *
 * The browser sends preferences and — for a swap — the current stops as slugs.
 * Every time and price shown comes back from the server, which builds them
 * from the catalogue and the booking quote; nothing here computes money.
 *
 * Form first and results second below `lg`; side by side from `lg`, the form
 * sticky beside a long plan.
 */
export function ItinerarySynthesizer() {
  const headingId = useId();
  const [intent, setIntent] = useState("");
  const [moods, setMoods] = useState<CopilotMood[]>([]);
  const [partySize, setPartySize] = useState<number>(ITINERARY_PARTY.default);
  const [startTime, setStartTime] = useState(clock(ITINERARY_WINDOW.defaultStart));
  const [endTime, setEndTime] = useState(clock(ITINERARY_WINDOW.defaultEnd));
  const [budget, setBudget] = useState("");
  const [stops, setStops] = useState<number>(ITINERARY_STOPS.default);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [swap, setSwap] = useState<SwapState>({ kind: "idle" });

  const busy = phase.kind === "loading" || swap.kind === "swapping";

  const budgetRupees = budget.trim() === "" ? undefined : Number(budget);
  const budgetError =
    budgetRupees !== undefined &&
    (!Number.isInteger(budgetRupees) ||
      budgetRupees < ITINERARY_BUDGET_RUPEES.min ||
      budgetRupees > ITINERARY_BUDGET_RUPEES.max)
      ? `Enter whole rupees, up to ${ITINERARY_BUDGET_RUPEES.max.toLocaleString("en-IN")}.`
      : undefined;
  // "HH:MM" compares correctly as a string.
  const windowError = endTime <= startTime ? "Finish after you start." : undefined;

  const toggleMood = (mood: CopilotMood) =>
    setMoods((current) =>
      current.includes(mood) ? current.filter((value) => value !== mood) : [...current, mood],
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (budgetError || windowError) return;

    const preferences: Preferences = {
      ...(intent.trim() ? { intent: intent.trim() } : {}),
      moods,
      partySize,
      startTime,
      endTime,
      stops,
      ...(budgetRupees !== undefined ? { budgetPerPersonRupees: budgetRupees } : {}),
    };

    setPhase({ kind: "loading" });
    setSwap({ kind: "idle" });
    api
      .post<ItineraryResult>("/api/v1/itinerary/generate", { preferences })
      .then((result) => setPhase({ kind: "done", result, preferences }))
      .catch((error: unknown) => setPhase({ kind: "failed", message: messageOf(error) }));
  };

  const swapStop = (index: number) => {
    if (phase.kind !== "done" || phase.result.status === "unfulfillable") return;
    const { preferences, result } = phase;
    const current = result.itinerary.stops;
    const replaced = current[index]?.title ?? "that stop";

    setSwap({ kind: "swapping", index });
    api
      .post<ItineraryResult>("/api/v1/itinerary/generate", {
        // The constraints the plan was made under, not whatever the form says now.
        preferences,
        swap: { stops: current.map((stop) => stop.slug), index },
      })
      .then((next) => {
        if (next.status === "unfulfillable") {
          setSwap({ kind: "message", tone: "info", text: next.reason });
          return;
        }
        // Keep a partial plan's explanation: a swap does not add stops.
        const merged: ItineraryResult =
          result.status === "partial"
            ? { ...next, status: "partial", reason: result.reason }
            : next;
        setPhase({ kind: "done", result: merged, preferences });
        setSwap({ kind: "message", tone: "info", text: `Swapped out ${replaced}.` });
      })
      .catch((error: unknown) =>
        setSwap({ kind: "message", tone: "danger", text: messageOf(error) }),
      );
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-line pt-10 lg:pt-14">
      <div className="max-w-[60ch]">
        <p className="eyebrow flex items-center gap-2 text-[10px] text-accent-ink lg:text-[11px]">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          Itinerary Synthesizer
        </p>
        <h2
          id={headingId}
          className="mt-2 font-display text-[24px] leading-[1.18] text-heading sm:text-[28px] lg:text-[34px]"
        >
          Plan your own evening
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed font-light text-fg-muted lg:text-[15px]">
          Tell us the mood, the hours and the budget. We sequence real Pune listings into a running
          order that fits, priced exactly as booking would charge.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-12 lg:gap-10">
        <form
          onSubmit={submit}
          noValidate
          aria-label="Itinerary preferences"
          className="flex flex-col gap-6 self-start rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-24 lg:col-span-5 xl:col-span-4"
        >
          <TextField
            label="What are you in the mood for?"
            placeholder="Gaming, then rooftop cocktails"
            value={intent}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setIntent(event.target.value)}
          />

          <fieldset disabled={busy} className="flex flex-col gap-3">
            <legend className="eyebrow mb-3 text-fg-muted">
              Moods <span className="normal-case">· up to {ITINERARY_MAX_MOODS}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {COPILOT_MOODS.map((mood) => {
                const pressed = moods.includes(mood);
                const full = !pressed && moods.length >= ITINERARY_MAX_MOODS;
                return (
                  <button
                    key={mood}
                    type="button"
                    aria-pressed={pressed}
                    disabled={full}
                    onClick={() => toggleMood(mood)}
                    className={cn(
                      "min-h-9 rounded-pill border px-3.5 text-[12.5px] transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-45",
                      pressed
                        ? "border-primary bg-primary text-text-inverse dark:border-accent dark:bg-accent dark:text-accent-fg"
                        : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {MOOD_LABELS[mood]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <PartyStepper
            value={partySize}
            min={ITINERARY_PARTY.min}
            max={ITINERARY_PARTY.max}
            disabled={busy}
            onChange={setPartySize}
          />

          <div className="grid grid-cols-2 gap-5">
            <SelectField
              label="From"
              options={START_OPTIONS}
              value={startTime}
              disabled={busy}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <SelectField
              label="Until"
              options={END_OPTIONS}
              value={endTime}
              disabled={busy}
              error={windowError}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>

          <TextField
            label="Budget per person (₹)"
            type="number"
            inputMode="numeric"
            min={ITINERARY_BUDGET_RUPEES.min}
            max={ITINERARY_BUDGET_RUPEES.max}
            step={1}
            placeholder="Flexible"
            help="Leave blank for no cap."
            value={budget}
            disabled={busy}
            error={budgetError}
            onChange={(event) => setBudget(event.target.value)}
          />

          <fieldset disabled={busy} className="flex flex-col gap-3">
            <legend className="eyebrow mb-3 text-fg-muted">Stops</legend>
            <div className="flex gap-2">
              {STOP_CHOICES.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={stops === count}
                  onClick={() => setStops(count)}
                  className={cn(
                    "min-h-10 flex-1 rounded-pill border text-[13px] tabular-nums transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-45",
                    stops === count
                      ? "border-primary bg-primary text-text-inverse dark:border-accent dark:bg-accent dark:text-accent-fg"
                      : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </fieldset>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={phase.kind === "loading"}
            disabled={busy || Boolean(budgetError || windowError)}
          >
            Synthesize itinerary
          </Button>
        </form>

        <div className="lg:col-span-7 xl:col-span-8" aria-live="polite" aria-busy={busy}>
          <Results phase={phase} swap={swap} onSwap={swapStop} />
        </div>
      </div>
    </section>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

function Results({
  phase,
  swap,
  onSwap,
}: {
  readonly phase: Phase;
  readonly swap: SwapState;
  readonly onSwap: (index: number) => void;
}) {
  if (phase.kind === "idle") {
    return (
      <EmptyState
        eyebrow="Your plan"
        title="A running order appears here"
        description="Pick a mood or describe your evening, set the hours, and we will sequence it — times, transfers and the exact total."
      />
    );
  }

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <span className="sr-only" role="status">
          Synthesizing your itinerary
        </span>
        <Skeleton className="h-28 w-full rounded-card" />
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-card" />
        ))}
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Alert tone="danger" title="We could not plan that">
        {phase.message}
      </Alert>
    );
  }

  const { result } = phase;
  if (result.status === "unfulfillable") {
    return (
      <EmptyState
        eyebrow="Nothing fits yet"
        title="No plan fits those constraints"
        description={result.reason}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PlanSummary itinerary={result.itinerary} />

      {result.status === "partial" ? (
        <Alert
          tone="warning"
          title={`${result.itinerary.stops.length} of ${result.requestedStops} stops fit`}
        >
          {result.reason}
        </Alert>
      ) : null}

      {swap.kind === "message" ? <Alert tone={swap.tone}>{swap.text}</Alert> : null}

      <ol className="relative flex flex-col gap-4" aria-label="Running order">
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[11px] w-px bg-accent/40"
        />
        {result.itinerary.stops.map((stop, index) => (
          <StopCard
            key={stop.slug}
            stop={stop}
            currency={result.itinerary.currency}
            partySize={result.itinerary.partySize}
            swapping={swap.kind === "swapping" && swap.index === index}
            swapDisabled={swap.kind === "swapping"}
            onSwap={() => onSwap(index)}
          />
        ))}
      </ol>

      <p className="text-[12px] leading-relaxed text-fg-muted">{result.notice}</p>
    </div>
  );
}

/** The pine panel with a gold hairline — the same surface as the trip voucher. */
function PlanSummary({ itinerary }: { readonly itinerary: Itinerary }) {
  const { currency, partySize } = itinerary;
  return (
    <div className="relative isolate overflow-hidden rounded-card border border-accent/45 bg-panel p-5 text-panel-fg shadow-raised sm:p-6">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[7px] -z-10 rounded-[calc(var(--radius-card)-7px)] border border-accent/20"
      />
      <p className="eyebrow text-[10px] text-panel-fg/80">Your itinerary</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-panel-fg/80 uppercase">Window</dt>
          <dd className="mt-1 text-[15px] tabular-nums">
            {clock(itinerary.startMinute)} – {clock(itinerary.endMinute)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-panel-fg/80 uppercase">Stops</dt>
          <dd className="mt-1 text-[15px] tabular-nums">{itinerary.stops.length}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-panel-fg/80 uppercase">
            Total for {partySize}
          </dt>
          <dd className="mt-1 font-display text-[20px] text-accent tabular-nums">
            {money(itinerary.totalMinor, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-panel-fg/80 uppercase">Per person</dt>
          <dd className="mt-1 text-[15px] tabular-nums">
            {money(itinerary.perPersonMinor, currency)}
            {itinerary.budgetPerPersonMinor !== null ? (
              <span className="block text-[11.5px] text-panel-fg/80">
                of {money(itinerary.budgetPerPersonMinor, currency)} budget
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StopCard({
  stop,
  currency,
  partySize,
  swapping,
  swapDisabled,
  onSwap,
}: {
  readonly stop: ItineraryStop;
  readonly currency: string;
  readonly partySize: number;
  readonly swapping: boolean;
  readonly swapDisabled: boolean;
  readonly onSwap: () => void;
}) {
  const TransferIcon = stop.transfer?.mode === "ride" ? Car : Footprints;

  return (
    <li className="relative flex flex-col gap-2 pl-9">
      {stop.transfer ? (
        <p className="flex items-center gap-1.5 text-[12px] text-fg-muted tabular-nums">
          <TransferIcon className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          {stop.transfer.minutes} min {stop.transfer.mode === "ride" ? "ride" : "walk"} ·{" "}
          {(stop.transfer.distanceMetres / 1000).toFixed(1)} km
          {stop.idleBeforeMinutes > 0 ? ` · ${stop.idleBeforeMinutes} min to spare` : ""}
        </p>
      ) : null}

      <span
        aria-hidden="true"
        className={cn(
          "absolute left-[5px] h-[13px] w-[13px] rounded-full border border-accent bg-bg",
          stop.transfer ? "top-12" : "top-6",
        )}
      />

      <article
        className={cn(
          "rounded-card border border-line bg-surface p-5 shadow-card transition-opacity duration-300",
          swapping && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[13px] text-fg tabular-nums">
            <Clock
              className="h-[14px] w-[14px] text-fg-muted"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            {clock(stop.startMinute)} – {clock(stop.endMinute)}
            <span className="text-fg-muted">· {formatDuration(stop.durationMinutes)}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            loading={swapping}
            disabled={swapDisabled}
            onClick={onSwap}
            aria-label={`Swap ${stop.title}`}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Swap
          </Button>
        </div>

        <h3 className="mt-3 font-display text-[16px] leading-snug text-heading lg:text-[17px]">
          <Link
            href={`/experiences/${stop.slug}`}
            className="group inline-flex items-start gap-1 hover:text-primary dark:hover:text-accent"
          >
            {stop.title}
            <ArrowUpRight
              className="mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </Link>
        </h3>
        <p className="mt-1 text-[12px] leading-snug font-light text-fg-muted">{stop.addressLine}</p>
        <p className="mt-3 border-l-2 border-accent/50 pl-3 text-[13px] leading-relaxed font-light text-fg-muted">
          {stop.why}
        </p>
        <p className="mt-3 text-[13px] text-fg tabular-nums">
          {money(stop.partyTotalMinor, currency)}{" "}
          <span className="text-fg-muted">
            {stop.pricingUnit === "PER_PERSON"
              ? `· ${money(stop.unitPriceMinor, currency)} × ${partySize}`
              : "· per group"}
          </span>
        </p>
      </article>
    </li>
  );
}
