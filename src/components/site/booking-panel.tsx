"use client";

import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { CalendarDays, Check, Clock, MapPin, Minus, Plus, Printer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PaymentProcessing } from "@/components/site/payment-processing";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { signInHref } from "@/lib/destinations";
import { formatMoneyMinor } from "@/lib/format";
import { SIMULATED_PROCESSING_MS, holdAtLeast } from "@/lib/hold";
import { brandThemeColor, openRazorpayCheckout } from "@/lib/razorpay-checkout";
import type {
  BookingConfirmation,
  CheckoutIntent,
  CheckoutMode,
  RazorpayPaymentResult,
} from "@/modules/booking/contract";
import {
  bookingReducer,
  canSubmit,
  currentGuestLimits,
  guestProblemMessage,
  initialBookingState,
  isBusy,
  selectedSlot,
  slotsForSelectedDay,
} from "@/modules/booking/flow";
import { isPriced, quoteBooking, type PriceQuote } from "@/modules/booking/pricing";
import {
  EXPERIENCE_TIME_ZONE,
  EXPERIENCE_TIME_ZONE_LABEL,
  type PublicSlot,
} from "@/modules/booking/slots";
import type { PricingUnit } from "@/modules/experiences/readiness";

/**
 * The booking panel on an experience page (FR-09).
 *
 * Date → time → guests → reserve, then a confirmation in place of the form.
 * Every rule lives in `@/modules/booking` — this file renders state and runs
 * the three requests the state machine asks for; it decides nothing.
 *
 * The total shown before reserving is a preview from the same `quoteBooking`
 * the server runs. The server's figure is the one charged, and the venue in
 * the confirmation only exists once the server has verified the checkout.
 *
 * Browsing is public; reserving is not. A signed-out visitor can pick a date,
 * time and party and see the price, then "Sign in to Reserve" sends them to
 * sign in with that choice in the return URL (`?slot=&guests=`), and the panel
 * restores it when they land back here. The checkout API refuses anonymous
 * requests regardless — this only decides what the button offers.
 */

/** Query parameters that carry a selection through sign-in. */
const SLOT_PARAM = "slot";
const GUESTS_PARAM = "guests";

/** A seat count at or below this is worth telling the traveller about. */
const LOW_SEATS = 5;

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: EXPERIENCE_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const longDayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: EXPERIENCE_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: EXPERIENCE_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** A day key is a calendar date in IST; midday there is safely inside it. */
function dayKeyToDate(key: string): Date {
  return new Date(`${key}T12:00:00+05:30`);
}

function money(minor: number, currency: string): string {
  return formatMoneyMinor(minor, currency) ?? "";
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function BookingPanel({
  slug,
  title,
  basePriceMinor,
  currency,
  pricingUnit,
  minGuests,
  maxGuests,
  checkoutMode,
  signedIn,
}: {
  readonly slug: string;
  readonly title: string;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly minGuests: number;
  readonly maxGuests: number | null;
  readonly checkoutMode: CheckoutMode;
  readonly signedIn: boolean;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    bookingReducer,
    { minGuests, maxGuests },
    initialBookingState,
  );
  const payment = useRef<RazorpayPaymentResult | null>(null);
  /** A selection carried back from sign-in, applied once the slots arrive. */
  const restore = useRef<{ slotId: string; guests: number | null } | null | undefined>(undefined);

  const base = `/api/v1/experiences/${encodeURIComponent(slug)}`;

  // ── Selection carried through sign-in ────────────────────────────────────

  useEffect(() => {
    if (restore.current === undefined) {
      const params = new URLSearchParams(window.location.search);
      const slotId = params.get(SLOT_PARAM);
      const guests = Number.parseInt(params.get(GUESTS_PARAM) ?? "", 10);
      restore.current = slotId ? { slotId, guests: Number.isFinite(guests) ? guests : null } : null;
    }
    const wanted = restore.current;
    if (state.phase !== "selecting" || !wanted) return;
    restore.current = null;

    // Only a slot that is still open is restored; a stale one leaves the
    // default selection, and the reducer re-checks every step.
    const day = state.days.find((candidate) =>
      candidate.slots.some((slot) => slot.id === wanted.slotId),
    );
    if (!day) return;
    dispatch({ type: "SELECT_DAY", day: day.key });
    dispatch({ type: "SELECT_SLOT", slotId: wanted.slotId });
    if (wanted.guests !== null) dispatch({ type: "SET_GUESTS", guests: wanted.guests });
  }, [state.phase, state.days]);

  function signInToReserve(): void {
    const url = new URL(window.location.href);
    if (state.selectedSlotId) {
      url.searchParams.set(SLOT_PARAM, state.selectedSlotId);
      url.searchParams.set(GUESTS_PARAM, String(state.guests));
    }
    router.push(signInHref(`${url.pathname}${url.search}`));
  }

  // ── Requests the state machine asks for ──────────────────────────────────

  useEffect(() => {
    if (state.phase !== "loading") return;
    let cancelled = false;

    api
      .get<{ slots: PublicSlot[] }>(`${base}/slots`)
      .then(({ slots }) => {
        if (!cancelled) dispatch({ type: "SLOTS_LOADED", slots });
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: "SLOTS_FAILED", message: messageOf(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [state.phase, base]);

  useEffect(() => {
    if (state.phase !== "preparing" || !state.selectedSlotId) return;

    payment.current = null;
    api
      .post<CheckoutIntent>(`${base}/checkout`, {
        slotId: state.selectedSlotId,
        guests: state.guests,
      })
      .then((intent) => dispatch({ type: "INTENT_READY", intent }))
      .catch((error: unknown) => dispatch({ type: "FAILED", message: messageOf(error) }));
    // Runs once per entry into `preparing`; the selection is frozen while it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => {
    const intent = state.intent;
    if (state.phase !== "paying" || !intent?.razorpay) return;

    openRazorpayCheckout({
      keyId: intent.razorpay.keyId,
      orderId: intent.razorpay.orderId,
      amountMinor: intent.razorpay.amountMinor,
      currency: intent.razorpay.currency,
      title,
      reference: intent.reference,
      themeColor: brandThemeColor(),
    })
      .then((outcome) => {
        if (outcome.kind === "paid") {
          payment.current = outcome.payment;
          dispatch({ type: "PAYMENT_COMPLETED" });
        } else if (outcome.kind === "dismissed") {
          dispatch({ type: "PAYMENT_DISMISSED" });
        } else {
          dispatch({ type: "FAILED", message: outcome.message });
        }
      })
      .catch((error: unknown) => dispatch({ type: "FAILED", message: messageOf(error) }));
  }, [state.phase, state.intent, title]);

  useEffect(() => {
    const intent = state.intent;
    if (state.phase !== "confirming" || !intent) return;

    const confirming = api.post<BookingConfirmation>(`${base}/checkout/confirm`, {
      intent: intent.intent,
      ...(payment.current ? { razorpay: payment.current } : {}),
    });
    // The demo has no provider to wait on, so it holds "Processing payment…"
    // long enough to read. A real Razorpay verification is never padded.
    (intent.mode === "demo" ? holdAtLeast(confirming, SIMULATED_PROCESSING_MS) : confirming)
      .then((confirmation) => dispatch({ type: "CONFIRMED", confirmation }))
      .catch((error: unknown) => dispatch({ type: "FAILED", message: messageOf(error) }));
  }, [state.phase, state.intent, base]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (state.phase === "confirmed" && state.confirmation) {
    return (
      <Confirmation
        confirmation={state.confirmation}
        onStartOver={() => dispatch({ type: "START_OVER" })}
      />
    );
  }

  if (!isPriced(basePriceMinor)) {
    return (
      <Alert tone="info">
        This experience is priced on request, so it cannot be booked online. Contact our team to
        arrange it.
      </Alert>
    );
  }

  const busy = isBusy(state);
  const slot = selectedSlot(state);
  const limits = currentGuestLimits(state);
  const guestProblem = slot ? guestProblemMessage(state) : null;
  const preview: PriceQuote | null = slot
    ? quoteBooking({ basePriceMinor, currency, pricingUnit, guests: state.guests })
    : null;

  return (
    <div className="flex flex-col gap-6" aria-busy={state.phase === "loading" || busy}>
      {/* ── Date ─────────────────────────────────────────────────────── */}
      <fieldset className="flex min-w-0 flex-col gap-3" disabled={busy}>
        <legend className="eyebrow text-accent-ink mb-1 flex items-center gap-2">
          <CalendarDays
            className="h-3.5 w-3.5 shrink-0 text-accent-ink"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          Choose a date
        </legend>

        {state.phase === "loading" ? (
          <div className="flex gap-2">
            <span className="sr-only" role="status">
              Loading available dates
            </span>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[74px] w-[64px] shrink-0 rounded-card" />
            ))}
          </div>
        ) : state.phase === "load_error" ? (
          <div className="flex flex-col gap-3">
            <Alert tone="danger" title="We could not load available dates.">
              {state.error}
            </Alert>
            <Button size="sm" onClick={() => dispatch({ type: "RELOAD" })}>
              Try again
            </Button>
          </div>
        ) : state.days.length === 0 ? (
          <p className="border-line bg-surface-2/40 text-fg-muted rounded-card border px-4 py-4 text-[13px] font-light leading-relaxed">
            No dates are open right now. The host adds new dates regularly — check back soon.
          </p>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group">
            {state.days.map((day) => {
              const parts = dayFormat.formatToParts(dayKeyToDate(day.key));
              const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
              const selected = day.key === state.selectedDay;
              return (
                <button
                  key={day.key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={longDayFormat.format(dayKeyToDate(day.key))}
                  onClick={() => dispatch({ type: "SELECT_DAY", day: day.key })}
                  className={cn(
                    "flex w-[64px] shrink-0 flex-col items-center gap-0.5 rounded-card border py-2.5 transition-all duration-200",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    selected
                      ? "border-accent bg-primary text-text-inverse shadow-sm"
                      : "border-line bg-surface text-fg hover:border-accent/60 hover:bg-surface-2/40",
                  )}
                >
                  <span
                    className={cn(
                      "text-[9.5px] font-medium tracking-[0.14em] uppercase",
                      selected ? "text-accent" : "text-fg-subtle",
                    )}
                  >
                    {part("weekday")}
                  </span>
                  <span
                    className={cn(
                      "font-display text-[21px] font-normal leading-none",
                      selected ? "text-text-inverse" : "text-heading",
                    )}
                  >
                    {part("day")}
                  </span>
                  <span
                    className={cn(
                      "text-[9.5px] font-medium tracking-[0.14em] uppercase",
                      selected ? "text-text-inverse/80" : "text-fg-muted",
                    )}
                  >
                    {part("month")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* ── Time ─────────────────────────────────────────────────────── */}
      {state.selectedDay ? (
        <fieldset className="flex flex-col gap-3" disabled={busy}>
          <legend className="eyebrow text-accent-ink mb-1 flex items-center gap-2">
            <Clock
              className="h-3.5 w-3.5 shrink-0 text-accent-ink"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            Choose a time
            <span className="text-fg-subtle normal-case tracking-normal text-[11px] font-light">
              ({EXPERIENCE_TIME_ZONE_LABEL})
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {slotsForSelectedDay(state).map((candidate) => {
              const selected = candidate.id === state.selectedSlotId;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => dispatch({ type: "SELECT_SLOT", slotId: candidate.id })}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-pill border px-4 py-2.5 text-left transition-all duration-200",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    selected
                      ? "border-accent bg-primary text-text-inverse shadow-sm"
                      : "border-line bg-surface text-fg hover:border-accent/60 hover:bg-surface-2/40",
                  )}
                >
                  <span
                    className={cn(
                      "text-[13.5px] font-medium tracking-tight",
                      selected ? "text-text-inverse" : "text-heading",
                    )}
                  >
                    {timeFormat.format(new Date(candidate.startsAt))}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-light",
                      selected
                        ? candidate.seatsRemaining <= LOW_SEATS
                          ? "text-accent font-medium"
                          : "text-text-inverse/75"
                        : candidate.seatsRemaining <= LOW_SEATS
                          ? "text-accent-ink dark:text-accent font-medium"
                          : "text-fg-subtle",
                    )}
                  >
                    {candidate.seatsRemaining <= LOW_SEATS
                      ? `${candidate.seatsRemaining} ${candidate.seatsRemaining === 1 ? "seat" : "seats"} left`
                      : `until ${timeFormat.format(new Date(candidate.endsAt))}`}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* ── Guests ───────────────────────────────────────────────────── */}
      {state.phase !== "loading" && state.phase !== "load_error" && state.days.length > 0 ? (
        <fieldset className="flex flex-col gap-3" disabled={busy || !slot}>
          <legend className="eyebrow text-accent-ink mb-1 flex items-center gap-2">
            <Users
              className="h-3.5 w-3.5 shrink-0 text-accent-ink"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            Guests
          </legend>
          <div className="border-line bg-surface flex items-center justify-between rounded-pill border px-2 py-1.5 shadow-sm">
            <StepButton
              label="Remove a guest"
              disabled={!limits || state.guests <= limits.min}
              onClick={() => dispatch({ type: "SET_GUESTS", guests: state.guests - 1 })}
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </StepButton>
            <output
              aria-live="polite"
              className="text-heading text-[14.5px] font-medium tracking-wide tabular-nums"
            >
              {state.guests} {state.guests === 1 ? "guest" : "guests"}
            </output>
            <StepButton
              label="Add a guest"
              disabled={!limits || state.guests >= limits.max}
              onClick={() => dispatch({ type: "SET_GUESTS", guests: state.guests + 1 })}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </StepButton>
          </div>
          <p className="text-fg-subtle text-[12px] font-light leading-relaxed">
            {!slot
              ? "Choose a time to set your party size."
              : guestProblem
                ? guestProblem
                : limits && limits.min === limits.max
                  ? `This time takes exactly ${limits.min} ${limits.min === 1 ? "guest" : "guests"}.`
                  : limits
                    ? `${limits.min}–${limits.max} guests for this time.`
                    : null}
          </p>
        </fieldset>
      ) : null}

      {/* ── Price ────────────────────────────────────────────────────── */}
      {preview ? <PriceBreakdown quote={preview} /> : null}

      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

      {state.phase === "error" ? (
        <div className="flex flex-col gap-3">
          <Alert tone="danger" title="Your booking was not completed.">
            {state.error}
          </Alert>
          <Button
            size="sm"
            onClick={() => {
              dispatch({ type: "DISMISS_ERROR" });
              // Seats may have moved while this was failing; read them again.
              dispatch({ type: "RELOAD" });
            }}
          >
            Review and try again
          </Button>
        </div>
      ) : null}

      {/* ── Reserve ──────────────────────────────────────────────────── */}
      {checkoutMode === "off" ? (
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" className="w-full" disabled>
            Booking opens soon
          </Button>
          <p className="text-fg-subtle text-[12px] font-light leading-relaxed">
            You can explore dates and prices now. Reservations open shortly.
          </p>
        </div>
      ) : !signedIn ? (
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={state.phase === "loading"}
            onClick={signInToReserve}
          >
            Sign in to Reserve
          </Button>
          <p className="text-fg-subtle text-[12px] font-light leading-relaxed">
            Reservations are held on your patron account. Your date, time and party are kept while
            you sign in.
          </p>
        </div>
      ) : state.phase !== "error" ? (
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={!canSubmit(state)}
            onClick={() => dispatch({ type: "SUBMIT" })}
          >
            {preview ? `Reserve · ${money(preview.totalMinor, preview.currency)}` : "Reserve"}
          </Button>
          {/* Announced by the processing card's own status region. */}
          {busy ? (
            <PaymentProcessing
              mode={state.intent?.mode ?? checkoutMode}
              stage={
                state.phase === "paying"
                  ? "paying"
                  : state.phase === "confirming"
                    ? "confirming"
                    : "preparing"
              }
            />
          ) : (
            <ModeNote mode={checkoutMode} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-pill border border-line bg-surface-2/60 text-heading transition-colors duration-200 hover:border-accent/60 hover:bg-surface-3 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function PriceBreakdown({ quote }: { readonly quote: PriceQuote }) {
  return (
    <dl className="border-line flex flex-col gap-2.5 border-t pt-5 text-[13px]">
      {quote.lines.map((line) => (
        <div key={line.kind} className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted font-light">
            {line.kind === "per_person"
              ? `${money(line.unitPriceMinor, quote.currency)} × ${line.quantity} ${line.quantity === 1 ? "guest" : "guests"}`
              : `Private group of ${quote.guests}`}
          </dt>
          <dd className="text-heading font-medium tabular-nums">
            {money(line.amountMinor, quote.currency)}
          </dd>
        </div>
      ))}
      <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
        <dt className="text-heading font-medium">Total ({quote.currency})</dt>
        <dd className="font-display text-heading text-[20px] font-normal tabular-nums">
          {money(quote.totalMinor, quote.currency)}
        </dd>
      </div>
      <p className="text-fg-subtle text-[11px] font-light leading-relaxed">
        The host&rsquo;s price. No booking fee is added.
      </p>
    </dl>
  );
}

function ModeNote({ mode }: { readonly mode: CheckoutMode }) {
  if (mode === "demo") {
    return (
      <Alert tone="warning" title="Demo checkout">
        No payment is taken and no seat is held. You will see exactly what a confirmed guest sees.
      </Alert>
    );
  }
  if (mode === "razorpay_test") {
    return (
      <Alert tone="warning" title="Razorpay test mode">
        Use a Razorpay test card or UPI ID. No real money moves and no seat is held.
      </Alert>
    );
  }
  return null;
}

// ── Confirmation ────────────────────────────────────────────────────────────

function Confirmation({
  confirmation,
  onStartOver,
}: {
  readonly confirmation: BookingConfirmation;
  readonly onStartOver: () => void;
}) {
  const startsAt = new Date(confirmation.slot.startsAt);
  const endsAt = new Date(confirmation.slot.endsAt);
  const isDemo = confirmation.mode === "demo";

  return (
    <section aria-labelledby="booking-confirmed" className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3" role="status">
        <span className="bg-success/10 text-success flex h-10 w-10 items-center justify-center rounded-pill border border-success/20">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="eyebrow text-accent-ink">
          {isDemo ? "Demo booking" : "Test booking"} confirmed
        </span>
        <h2
          id="booking-confirmed"
          className="font-display text-heading text-[24px] font-normal leading-tight"
        >
          You&rsquo;re going.
        </h2>
      </div>

      <div className="border-line bg-surface-2/60 flex flex-col gap-1 rounded-card border px-4 py-3">
        <span className="text-accent-ink text-[10px] font-medium tracking-[0.18em] uppercase">
          Booking reference
        </span>
        <span className="text-heading font-mono text-[20px] font-normal tracking-[0.08em]">
          {confirmation.reference}
        </span>
      </div>

      {/* Revealed only now: the server returns the venue after verifying checkout. */}
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-accent-ink flex items-center gap-2">
          <MapPin
            className="h-3.5 w-3.5 shrink-0 text-accent-ink"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          Venue
        </span>
        {confirmation.venue.lines.length > 0 ? (
          <address className="text-fg text-[14px] font-light leading-relaxed not-italic">
            {confirmation.venue.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        ) : (
          <p className="text-fg-muted text-[14px] font-light">
            Your host will share the meeting point before the experience.
          </p>
        )}
        {confirmation.venue.mapUrl ? (
          <a
            href={confirmation.venue.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-ink hover:text-accent inline-flex items-center gap-1 text-[13px] font-medium tracking-wide transition-colors"
          >
            Open in maps
          </a>
        ) : null}
      </div>

      {/* ── Voucher ──────────────────────────────────────────────────── */}
      <div className="border-line flex flex-col gap-3 border-t pt-5">
        <span className="eyebrow text-accent-ink">Voucher</span>
        <dl className="flex flex-col gap-2.5 text-[13px]">
          <VoucherRow label="Experience" value={confirmation.experience.title} />
          <VoucherRow label="Date" value={longDayFormat.format(startsAt)} />
          <VoucherRow
            label="Time"
            value={`${timeFormat.format(startsAt)} – ${timeFormat.format(endsAt)} ${EXPERIENCE_TIME_ZONE_LABEL}`}
          />
          <VoucherRow
            label="Guests"
            value={`${confirmation.guests} ${confirmation.guests === 1 ? "guest" : "guests"}`}
          />
          <VoucherRow label="Host" value={confirmation.experience.hostName} />
          <VoucherRow
            label={isDemo ? "Total (not charged)" : "Paid (test)"}
            value={money(confirmation.quote.totalMinor, confirmation.quote.currency)}
          />
          {confirmation.paymentId ? (
            <VoucherRow label="Payment ID" value={confirmation.paymentId} mono />
          ) : null}
        </dl>
      </div>

      <Alert tone="warning">
        {isDemo
          ? "This is a demonstration. No seat was reserved and nothing was charged."
          : "Razorpay test mode. No real money moved and no seat was reserved."}
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
        <Button variant="secondary" className="w-full" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print voucher
        </Button>
        <Button variant="ghost" className="w-full" onClick={onStartOver}>
          Book another time
        </Button>
      </div>
    </section>
  );
}

function VoucherRow({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-fg-subtle shrink-0 font-light">{label}</dt>
      <dd
        className={cn(
          "text-heading text-right font-medium break-all",
          mono && "font-mono text-[12px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
