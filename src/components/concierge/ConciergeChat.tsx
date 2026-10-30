"use client";

import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUp, LocateFixed, MapPin, Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  converse,
  resultsHref,
  roundCoordinate,
  startConversation,
  type ConversationState,
} from "@/modules/concierge/conversation";
import {
  BUDGET_RUPEES,
  BUDGET_SUGGESTIONS_RUPEES,
  CRAVING_CHIPS,
  HOTSPOTS,
  PARTY_SIZE,
  type BudgetBasis,
} from "@/modules/concierge/options";

/**
 * The concierge conversation: three questions, one at a time, then a hand-off
 * to `/concierge/results`.
 *
 * All of the conversation's logic is the pure reducer in
 * `modules/concierge/conversation.ts`; this component only renders its
 * transcript, offers the quick replies for the current question, and asks the
 * browser for a location fix. It computes no price and no distance — the
 * results page does that on the server from the URL this conversation builds.
 *
 * Restrained on purpose (DESIGN.md §B.4): no avatar, no typing indicator, no
 * sparkle. The concierge speaks in the display serif; the traveller's replies
 * are pills.
 */

/** Long enough to read the closing line, short enough not to feel like a wait. */
const HANDOFF_MS = 650;

const PLACEHOLDERS: Record<Exclude<ConversationState["step"], "done">, string> = {
  location: "Seasons Mall, Amanora, Hadapsar…",
  craving: "Or say it: “live music”, “ramen”…",
  party: "“2 people, ₹500 each”",
};

const control =
  "inline-flex min-h-10 items-center rounded-pill border text-[13px] transition-colors duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45";
const chip = `${control} gap-1.5 border-line bg-surface px-4 text-fg hover:border-line-strong`;
const stepper = `${control} w-10 justify-center border-line bg-surface text-fg hover:border-line-strong`;

type GeoStatus = "idle" | "locating";

export function ConciergeChat({ initialCraving }: { readonly initialCraving?: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(converse, { craving: initialCraving }, startConversation);
  const [draft, setDraft] = useState("");
  const [geo, setGeo] = useState<GeoStatus>("idle");
  // Null until the traveller touches the stepper, so a party size they typed wins.
  const [partyDraft, setPartyDraft] = useState<number | null>(null);
  const [customBudget, setCustomBudget] = useState("");
  const [basis, setBasis] = useState<BudgetBasis>("each");

  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLLIElement>(null);

  const href = resultsHref(state);
  const done = state.step === "done";
  const party = partyDraft ?? state.partySize ?? 2;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.messages.length]);

  useEffect(() => {
    if (!href) return;
    router.prefetch(href);
    const timer = window.setTimeout(() => router.push(href), HANDOFF_MS);
    return () => window.clearTimeout(timer);
  }, [href, router]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    dispatch({ type: "text", text });
    setDraft("");
    inputRef.current?.focus();
  }

  function locate() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      dispatch({ type: "gps-failed", reason: "unavailable" });
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo("idle");
        dispatch({
          type: "gps",
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        });
      },
      (failure) => {
        setGeo("idle");
        dispatch({
          type: "gps-failed",
          reason: failure.code === failure.PERMISSION_DENIED ? "denied" : "unavailable",
        });
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 },
    );
  }

  function chooseBudget(rupees: number | null, budgetBasis: BudgetBasis = "each") {
    dispatch({
      type: "party-budget",
      partySize: party,
      cap: rupees === null ? null : { basis: budgetBasis, amountMinor: rupees * 100 },
    });
  }

  function sendCustomBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rupees = Math.round(Number(customBudget));
    if (!Number.isFinite(rupees) || rupees < BUDGET_RUPEES.min || rupees > BUDGET_RUPEES.max) {
      return;
    }
    chooseBudget(rupees, basis);
    setCustomBudget("");
  }

  const customValid =
    customBudget.trim() !== "" &&
    Number(customBudget) >= BUDGET_RUPEES.min &&
    Number(customBudget) <= BUDGET_RUPEES.max;

  return (
    <div className="flex flex-col overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 sm:px-7">
        <p className="eyebrow text-[10px] text-fg-subtle">
          {done ? "Done" : `Question ${stepNumber(state)} of 3`}
        </p>
        {state.messages.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "restart" });
              setPartyDraft(null);
              setDraft("");
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 text-[12px] text-fg-muted transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            Start over
          </button>
        ) : null}
      </div>

      {/* ── Transcript ─────────────────────────────────────────────── */}
      <ol
        role="log"
        aria-live="polite"
        aria-label="Conversation with the concierge"
        className="flex max-h-[min(52dvh,520px)] min-h-[220px] flex-col gap-4 overflow-y-auto px-5 py-6 sm:px-7"
      >
        {state.messages.map((message) =>
          message.from === "concierge" ? (
            <li key={message.id} className="max-w-[46ch]">
              <p className="font-display text-[18px] leading-snug text-heading sm:text-[20px]">
                {message.text}
              </p>
              {message.hint ? (
                <p className="mt-1.5 text-[13px] leading-relaxed font-light text-fg-muted">
                  {message.hint}
                </p>
              ) : null}
            </li>
          ) : (
            <li key={message.id} className="flex justify-end">
              <p className="max-w-[80%] rounded-pill bg-primary px-4 py-2 text-[14px] text-text-inverse">
                <span className="sr-only">You: </span>
                {message.text}
              </p>
            </li>
          ),
        )}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {/* ── Quick replies + composer ───────────────────────────────── */}
      <div className="border-t border-line bg-bg px-5 py-4 sm:px-7 sm:py-5">
        {done ? (
          <div className="flex flex-wrap items-center justify-between gap-3" role="status">
            <p className="text-[13px] text-fg-muted">Opening your picks…</p>
            {href ? (
              <Link
                href={href}
                className="inline-flex h-10 items-center gap-2 rounded-pill bg-cta px-5 text-[12.5px] font-medium text-cta-fg transition-colors hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                See your picks
                <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {state.step === "location" ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={locate}
                  disabled={geo === "locating"}
                  className={chip}
                >
                  <LocateFixed className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  {geo === "locating" ? "Locating…" : "Use my location"}
                </button>
                {HOTSPOTS.map((hotspot) => (
                  <button
                    key={hotspot.id}
                    type="button"
                    onClick={() => dispatch({ type: "hotspot", hotspotId: hotspot.id })}
                    className={chip}
                  >
                    <MapPin className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                    {hotspot.label}
                  </button>
                ))}
              </div>
            ) : null}

            {state.step === "craving" ? (
              <div className="flex flex-wrap gap-2">
                {CRAVING_CHIPS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => dispatch({ type: "craving", value: option.value })}
                    className={chip}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            {state.step === "party" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="eyebrow text-[10px] text-fg-subtle">Party</span>
                  <button
                    type="button"
                    aria-label="One fewer person"
                    disabled={party <= PARTY_SIZE.min}
                    onClick={() => setPartyDraft(Math.max(PARTY_SIZE.min, party - 1))}
                    className={stepper}
                  >
                    <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <span
                    className="min-w-[72px] text-center text-[14px] text-fg tabular-nums"
                    aria-live="polite"
                  >
                    {party === 1 ? "Just me" : `${party} people`}
                  </span>
                  <button
                    type="button"
                    aria-label="One more person"
                    disabled={party >= PARTY_SIZE.max}
                    onClick={() => setPartyDraft(Math.min(PARTY_SIZE.max, party + 1))}
                    className={stepper}
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {BUDGET_SUGGESTIONS_RUPEES.map((rupees) => (
                    <button
                      key={rupees}
                      type="button"
                      onClick={() => chooseBudget(rupees)}
                      className={cn(chip, "tabular-nums")}
                    >
                      ₹{rupees.toLocaleString("en-IN")} each
                    </button>
                  ))}
                  <button type="button" onClick={() => chooseBudget(null)} className={chip}>
                    Flexible / No budget limit
                  </button>
                </div>

                <form onSubmit={sendCustomBudget} className="flex flex-wrap items-center gap-2">
                  <label htmlFor="concierge-budget" className="sr-only">
                    Your own budget in rupees
                  </label>
                  <div className="flex h-10 items-center rounded-pill border border-line bg-surface pl-4 focus-within:border-primary">
                    <span aria-hidden="true" className="text-[13px] text-fg-muted">
                      ₹
                    </span>
                    <input
                      id="concierge-budget"
                      type="number"
                      inputMode="numeric"
                      min={BUDGET_RUPEES.min}
                      max={BUDGET_RUPEES.max}
                      step={1}
                      value={customBudget}
                      onChange={(event) => setCustomBudget(event.target.value)}
                      placeholder="Your budget"
                      className="h-full w-28 bg-transparent px-1.5 text-[13px] text-fg tabular-nums placeholder:text-fg-subtle focus:outline-none"
                    />
                  </div>
                  <div
                    role="group"
                    aria-label="Budget is"
                    className="flex rounded-pill border border-line p-0.5"
                  >
                    {(["each", "total"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={basis === option}
                        onClick={() => setBasis(option)}
                        className={cn(
                          "min-h-8 rounded-pill px-3 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                          basis === option
                            ? "bg-primary text-text-inverse"
                            : "text-fg-muted hover:text-heading",
                        )}
                      >
                        {option === "each" ? "Each" : "Total"}
                      </button>
                    ))}
                  </div>
                  <button type="submit" disabled={!customValid} className={chip}>
                    Use this budget
                  </button>
                </form>
              </div>
            ) : null}

            <form onSubmit={send} className="mt-4 flex items-center gap-2">
              <label htmlFor="concierge-reply" className="sr-only">
                Reply to the concierge
              </label>
              <input
                ref={inputRef}
                id="concierge-reply"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={80}
                autoComplete="off"
                placeholder={PLACEHOLDERS[state.step]}
                className="h-12 min-w-0 flex-1 rounded-pill border border-line bg-surface px-5 text-[14px] text-fg placeholder:text-fg-subtle hover:border-line-strong focus-visible:border-primary focus-visible:outline-none"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={!draft.trim()}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cta text-cta-fg transition-[background-color,transform] duration-200 hover:bg-cta-hover active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function stepNumber(state: ConversationState): number {
  if (state.step === "location") return 1;
  if (state.step === "craving") return 2;
  return 3;
}
