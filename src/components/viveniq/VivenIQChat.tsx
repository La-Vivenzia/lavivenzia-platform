"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  Clock,
  Crown,
  Map as MapIcon,
  MapPin,
  RotateCcw,
  Timer,
} from "lucide-react";

import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  VIVENIQ_LIMITS,
  VIVENIQ_STARTERS,
  seenJourneyKey,
  type VivenIQJourney,
  type VivenIQPick,
  type VivenIQReply,
} from "@/modules/viveniq/options";

/**
 * The VivenIQ conversation: the traveller describes a moment, VivenIQ answers
 * with a short reply and at most three listings, each carrying its reason.
 *
 * This component computes nothing about a listing. Every title, price and
 * duration on a card arrives from `/api/v1/viveniq`, which reads the published
 * catalogue (CLAUDE.md §7). It keeps the transcript, sends earlier turns as
 * context, and remembers which slugs were shown so "something different" works.
 *
 * Restrained on purpose (DESIGN.md §B.4): no avatar, no sparkle, no typing
 * theatre — a quiet status line while a turn is in flight. VivenIQ speaks in
 * the display serif; the traveller's turns are pills, as in the concierge.
 */

type Message =
  | { readonly id: number; readonly from: "you"; readonly text: string }
  | {
      readonly id: number;
      readonly from: "viveniq";
      readonly text: string;
      readonly picks: readonly VivenIQPick[];
      readonly journeys: readonly VivenIQJourney[];
      readonly followUps: readonly string[];
    };

type Status = "idle" | "sending" | "error";

const chip =
  "inline-flex min-h-10 items-center rounded-pill border border-line bg-surface px-4 text-[13px] text-fg " +
  "transition-colors duration-200 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45";

export function VivenIQChat({ initialQuery }: { readonly initialQuery?: string }) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [failed, setFailed] = useState<string | null>(null);
  const [errorText, setErrorText] = useState("");
  const [draft, setDraft] = useState("");

  const nextId = useRef(0);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const sending = status === "sending";

  const ask = useCallback(
    async (text: string, transcript: readonly Message[], appendUser = true) => {
      const message = text.trim().slice(0, VIVENIQ_LIMITS.message.max);
      if (!message) return;

      const history = transcript
        .filter((entry) => entry.from === "you")
        .map((entry) => entry.text)
        .slice(-VIVENIQ_LIMITS.history.max);
      const seen = transcript
        .flatMap((entry) =>
          entry.from === "viveniq"
            ? [
                ...entry.journeys.map((journey) => seenJourneyKey(journey.id)),
                ...entry.picks.map((pick) => pick.slug),
              ]
            : [],
        )
        .slice(-VIVENIQ_LIMITS.seen.max);

      if (appendUser) {
        setMessages((current) => [
          ...current,
          { id: nextId.current++, from: "you", text: message },
        ]);
      }
      setStatus("sending");
      setFailed(null);

      try {
        const result = await api.post<VivenIQReply>("/api/v1/viveniq", { message, history, seen });
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            from: "viveniq",
            text: result.reply,
            picks: result.picks,
            journeys: result.journeys ?? [],
            followUps: result.followUps,
          },
        ]);
        setStatus("idle");
      } catch (error) {
        setErrorText(
          error instanceof ApiError && error.status === 429
            ? "That’s a lot of questions in a short while. Give it a moment, then try again."
            : "I couldn’t reach the collection just now. Your message is safe — try again.",
        );
        setFailed(message);
        setStatus("error");
      }
    },
    [],
  );

  useEffect(() => {
    if (started.current || !initialQuery) return;
    started.current = true;
    void ask(initialQuery, []);
  }, [ask, initialQuery]);

  useEffect(() => {
    if (messages.length === 0 && status !== "sending") return;
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, status]);

  function send(text: string) {
    if (sending) return;
    void ask(text, messages);
    setDraft("");
    inputRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(draft);
  }

  function retry() {
    if (failed === null) return;
    // The traveller's turn is already in the transcript; resend without
    // appending it twice. Context is everything before that turn.
    const transcript = messages.slice(0, -1);
    void ask(failed, transcript, false);
  }

  const empty = messages.length === 0 && !sending;
  const latestReply = [...messages].reverse().find((entry) => entry.from === "viveniq");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <header className="flex flex-col items-center gap-4 text-center">
        <p className="eyebrow text-[10px] text-accent-ink dark:text-accent">
          VivenIQ · Bespoke Intelligence
        </p>
        <h1 className="max-w-[18ch] font-display text-[34px] leading-[1.08] text-heading sm:text-[44px] lg:text-[52px]">
          Describe the moment. We’ll curate the rest.
        </h1>
        {empty ? (
          <p className="max-w-[48ch] text-[14px] leading-relaxed font-light text-fg-muted">
            Tell us the mood, the company and the hour. Every suggestion is a real, reviewed listing
            — with the host’s own price.
          </p>
        ) : null}
      </header>

      {empty ? (
        <section aria-label="Ways to begin" className="mt-10 flex flex-wrap justify-center gap-2">
          {VIVENIQ_STARTERS.map((starter) => (
            <button key={starter} type="button" onClick={() => send(starter)} className={chip}>
              {starter}
            </button>
          ))}
        </section>
      ) : null}

      {/* ── Transcript ─────────────────────────────────────────────── */}
      {messages.length > 0 || sending ? (
        <ol
          role="log"
          aria-live="polite"
          aria-label="Conversation with VivenIQ"
          className="mt-10 flex flex-col gap-8"
        >
          {messages.map((message) =>
            message.from === "you" ? (
              <li key={message.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-pill bg-primary px-4 py-2 text-[14px] text-text-inverse">
                  <span className="sr-only">You: </span>
                  {message.text}
                </p>
              </li>
            ) : (
              <li key={message.id} className="flex flex-col gap-5">
                <p className="max-w-[56ch] font-display text-[18px] leading-snug text-heading sm:text-[20px]">
                  <span className="sr-only">VivenIQ: </span>
                  {message.text}
                </p>

                {message.journeys.length > 0 ? (
                  <section aria-label="Curated experiences" className="flex flex-col gap-3">
                    <p className="eyebrow text-[10px] text-accent-ink dark:text-accent">
                      Curated experiences · one booking each
                    </p>
                    <ul className="grid gap-4 lg:grid-cols-2">
                      {message.journeys.map((journey) => (
                        <JourneyCard key={journey.id} journey={journey} />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {message.picks.length > 0 ? (
                  <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {message.picks.map((pick) => (
                      <PickCard key={pick.slug} pick={pick} />
                    ))}
                  </ul>
                ) : null}

                {message === latestReply && message.followUps.length > 0 && !sending ? (
                  <div className="flex flex-wrap gap-2" aria-label="Refine">
                    {message.followUps.map((followUp) => (
                      <button
                        key={followUp}
                        type="button"
                        onClick={() => send(followUp)}
                        className={chip}
                      >
                        {followUp}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ),
          )}

          {sending ? (
            <li role="status" className="text-[13px] text-fg-muted">
              Looking through the collection…
            </li>
          ) : null}

          {status === "error" ? (
            <li role="alert" className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-danger">{errorText}</p>
              <button type="button" onClick={retry} className={cn(chip, "gap-1.5")}>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                Try again
              </button>
            </li>
          ) : null}
        </ol>
      ) : null}

      <div ref={endRef} aria-hidden="true" className="h-6" />

      {/* ── Composer ───────────────────────────────────────────────── */}
      <form
        onSubmit={submit}
        className="sticky bottom-24 z-10 mt-4 lg:bottom-6"
        aria-label="Message VivenIQ"
      >
        <label htmlFor="viveniq-input" className="sr-only">
          Describe the moment or refine your picks
        </label>
        <div className="flex h-14 items-center gap-2 rounded-pill border border-line bg-surface pr-2 pl-5 shadow-raised transition-colors focus-within:border-line-strong">
          <input
            id="viveniq-input"
            ref={inputRef}
            type="text"
            autoComplete="off"
            maxLength={VIVENIQ_LIMITS.message.max}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              messages.length === 0
                ? "Describe the moment (e.g. poolside brunch, sunset craft brews)..."
                : "Ask a follow-up or refine (e.g. 'Table for 2 around 7 PM?')..."
            }
            className="min-w-0 flex-1 bg-transparent text-[15px] font-light text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={sending || draft.trim() === ""}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-cta-fg transition-colors hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

/** How many perks a card shows. The listing page carries the rest. */
const CARD_PERKS = 2;

/** One listing in the stream. Every figure is the server's, rendered as given. */
function PickCard({ pick }: { readonly pick: VivenIQPick }) {
  const curation = pick.curation ?? null;

  return (
    <li className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-300 hover:shadow-card">
      <Link
        href={`/experiences/${pick.slug}`}
        className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
          {pick.coverUrl ? (
            <Image
              src={pick.coverUrl}
              alt={pick.coverAlt}
              fill
              sizes="(min-width: 1024px) 240px, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          {curation ? (
            <p className="eyebrow text-[10px] text-accent-ink dark:text-accent">
              {curation.trackLabel}
            </p>
          ) : pick.categoryName ? (
            <p className="eyebrow text-[10px] text-fg-subtle">{pick.categoryName}</p>
          ) : null}
          <h2 className="line-clamp-2 font-display text-[18px] leading-snug text-heading">
            {pick.title}
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              {pick.place}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              {pick.durationLabel}
            </span>
          </p>
          {pick.reason ? (
            <p className="text-[12.5px] leading-snug font-light text-fg">{pick.reason}</p>
          ) : null}

          {curation ? (
            <>
              <ul aria-label="La Vivenzia perks" className="flex flex-col gap-1">
                {curation.vipPerks.slice(0, CARD_PERKS).map((perk) => (
                  <li key={perk} className="flex gap-1.5 text-[12.5px] leading-snug text-fg">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-ink dark:text-accent"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    {perk}
                  </li>
                ))}
              </ul>
              <p className="border-l border-line-strong pl-2.5 text-[12px] leading-snug font-light text-fg-muted italic">
                <span className="sr-only">Curator’s secret: </span>
                {curation.curatorSecret}
              </p>
              {curation.timeSavedLabel ? (
                <p className="inline-flex items-center gap-1 text-[12px] text-fg-muted">
                  <Timer className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {curation.timeSavedLabel}
                </p>
              ) : null}
            </>
          ) : null}

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-[14px] font-medium text-heading tabular-nums">
              {pick.priceLabel ?? "Price on the listing"}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] text-fg-muted transition-colors group-hover:text-heading">
              View
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * A whole curated journey in the stream: the arc as a stepper, the venues as
 * backdrops, one privilege per act and one all-inclusive price. Every figure
 * is the server's, rendered as given.
 */
function JourneyCard({ journey }: { readonly journey: VivenIQJourney }) {
  const href = `/journeys/${journey.id}`;

  return (
    <li className="flex flex-col overflow-hidden rounded-card border border-accent/40 bg-surface shadow-card">
      <div className="grid auto-cols-fr grid-flow-col gap-px bg-line">
        {journey.acts.map((act) => (
          <div key={act.role} className="relative aspect-[4/3] bg-surface-2">
            {act.coverUrl ? (
              <Image
                src={act.coverUrl}
                alt={act.coverAlt}
                fill
                sizes="(min-width: 1024px) 160px, 33vw"
                className="object-cover"
              />
            ) : null}
            <span className="absolute bottom-2 left-2 rounded-pill bg-panel px-2 py-0.5 text-[10px] font-medium text-panel-fg">
              {act.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="eyebrow text-[10px] text-accent-ink dark:text-accent">
            {journey.mood} · {journey.acts.length === 2 ? "Two acts" : "Three acts"}
          </p>
          <h2 className="mt-1 font-display text-[18px] leading-snug text-heading">
            {journey.title}
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug font-light text-fg-muted">
            {journey.tagline}
          </p>
        </div>

        <ol aria-label="Running order" className="flex flex-wrap items-center gap-1 text-[12px]">
          {journey.acts.map((act, index) => (
            <li key={act.role} className="inline-flex items-center gap-1">
              <span className="text-fg">
                {act.label} <span className="text-fg-muted tabular-nums">({act.startLabel})</span>
              </span>
              {index < journey.acts.length - 1 ? (
                <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>

        <ul aria-label="VIP privileges" className="flex flex-col gap-1">
          {journey.acts.map((act) => (
            <li key={act.role} className="flex gap-1.5 text-[12.5px] leading-snug text-fg">
              <Crown
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-ink dark:text-accent"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>
                {act.privilegeTitle}
                <span className="text-fg-muted">
                  {" "}
                  at {act.title.split(/[:—]/)[0]!.trim()}
                  {act.privilegeConfirmed ? "" : " · requested"}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          {journey.durationLabel ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              {journey.durationLabel}
            </span>
          ) : null}
          {journey.timeSavedLabel ? (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              {journey.timeSavedLabel}
            </span>
          ) : null}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[14px] font-medium text-heading tabular-nums">
            {journey.priceLabel ?? "Price on each act"}
            <span className="block text-[11px] font-normal text-fg-muted">all-inclusive</span>
          </span>
          <span className="flex gap-2">
            <Link
              href={`${href}?map=1`}
              className="inline-flex min-h-10 items-center gap-1 rounded-pill border border-line-strong px-3 text-[12px] text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <MapIcon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              Companion Map
            </Link>
            <Link
              href={href}
              className="inline-flex min-h-10 items-center gap-1 rounded-pill bg-cta px-3.5 text-[12px] font-medium text-cta-fg transition-colors hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Reserve Experience
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </span>
        </div>
      </div>
    </li>
  );
}
