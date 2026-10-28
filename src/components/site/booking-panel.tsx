"use client";

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { CalendarDays, Check, Clock, MapPin, Minus, Plus, Printer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
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
 */

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

/** The brand green for Razorpay's frame, read from the token rather than restated. */
function themeColor(): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--lv-primary").trim();
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined;
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
}: {
  readonly slug: string;
  readonly title: string;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;
  readonly minGuests: number;
  readonly maxGuests: number | null;
  readonly checkoutMode: CheckoutMode;
}) {
  const [state, dispatch] = useReducer(
    bookingReducer,
    { minGuests, maxGuests },
    initialBookingState,
  );
  const payment = useRef<RazorpayPaymentResult | null>(null);

  const base = `/api/v1/experiences/${encodeURIComponent(slug)}`;

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
      themeColor: themeColor(),
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

    api
      .post<BookingConfirmation>(`${base}/checkout/confirm`, {
        intent: intent.intent,
        ...(payment.current ? { razorpay: payment.current } : {}),
      })
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
        <legend className="eyebrow mb-3 flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Choose a date
        </legend>

        {state.phase === "loading" ? (
          <div className="flex gap-2">
            <span className="sr-only" role="status">
              Loading available dates
            </span>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[68px] w-[60px] shrink-0 rounded-md" />
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
          <p className="border-line bg-surface-sunken text-text-muted rounded-md border px-4 py-4 text-[13px] leading-relaxed">
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
                    "flex w-[60px] shrink-0 flex-col items-center gap-0.5 rounded-md border py-2.5 transition-colors duration-200",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    selected
                      ? "border-primary bg-primary text-text-inverse"
                      : "border-line-strong bg-surface text-text hover:border-gold",
                  )}
                >
                  <span className="text-[10px] tracking-[0.12em] uppercase opacity-80">
                    {part("weekday")}
                  </span>
                  <span className="font-display text-[20px] leading-none">{part("day")}</span>
                  <span className="text-[10px] tracking-[0.12em] uppercase opacity-80">
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
          <legend className="eyebrow mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Choose a time
            <span className="text-text-subtle normal-case tracking-normal">
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
                    "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors duration-200",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    selected
                      ? "border-primary bg-primary text-text-inverse"
                      : "border-line-strong bg-surface text-text hover:border-gold",
                  )}
                >
                  <span className="text-[14px] font-medium">
                    {timeFormat.format(new Date(candidate.startsAt))}
                  </span>
                  <span
                    className={cn(
                      "text-[11px]",
                      selected ? "text-text-inverse-muted" : "text-text-subtle",
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
          <legend className="eyebrow mb-3 flex items-center gap-2">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Guests
          </legend>
          <div className="border-line-strong flex items-center justify-between rounded-pill border px-2 py-1.5">
            <StepButton
              label="Remove a guest"
              disabled={!limits || state.guests <= limits.min}
              onClick={() => dispatch({ type: "SET_GUESTS", guests: state.guests - 1 })}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </StepButton>
            <output aria-live="polite" className="text-text text-[15px] font-medium tabular-nums">
              {state.guests} {state.guests === 1 ? "guest" : "guests"}
            </output>
            <StepButton
              label="Add a guest"
              disabled={!limits || state.guests >= limits.max}
              onClick={() => dispatch({ type: "SET_GUESTS", guests: state.guests + 1 })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </StepButton>
          </div>
          <p className="text-text-subtle text-[12px]">
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
          <p className="text-text-subtle text-[12px] leading-relaxed">
            You can explore dates and prices now. Reservations open shortly.
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
          <span className="sr-only" role="status">
            {state.phase === "preparing"
              ? "Preparing your booking"
              : state.phase === "paying"
                ? "Payment window open"
                : state.phase === "confirming"
                  ? "Confirming your booking"
                  : ""}
          </span>
          <ModeNote mode={checkoutMode} />
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
      className="text-text hover:bg-surface-sunken flex h-9 w-9 items-center justify-center rounded-pill transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
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
          <dt className="text-text-muted">
            {line.kind === "per_person"
              ? `${money(line.unitPriceMinor, quote.currency)} × ${line.quantity} ${line.quantity === 1 ? "guest" : "guests"}`
              : `Private group of ${quote.guests}`}
          </dt>
          <dd className="text-text tabular-nums">{money(line.amountMinor, quote.currency)}</dd>
        </div>
      ))}
      <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
        <dt className="text-text font-semibold">Total ({quote.currency})</dt>
        <dd className="font-display text-text text-[20px] tabular-nums">
          {money(quote.totalMinor, quote.currency)}
        </dd>
      </div>
      <p className="text-text-subtle text-[11px] leading-relaxed">
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
        <span className="bg-success-wash text-success flex h-10 w-10 items-center justify-center rounded-pill">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="eyebrow">{isDemo ? "Demo booking" : "Test booking"} confirmed</span>
        <h2 id="booking-confirmed" className="font-display text-text text-[24px] leading-tight">
          You&rsquo;re going.
        </h2>
      </div>

      <div className="border-line-gold bg-gold-wash flex flex-col gap-1 rounded-md border px-4 py-3">
        <span className="text-gold-deep text-[10px] tracking-[0.18em] uppercase">
          Booking reference
        </span>
        <span className="text-text font-mono text-[20px] tracking-[0.08em]">
          {confirmation.reference}
        </span>
      </div>

      {/* Revealed only now: the server returns the venue after verifying checkout. */}
      <div className="flex flex-col gap-2">
        <span className="eyebrow flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Venue
        </span>
        {confirmation.venue.lines.length > 0 ? (
          <address className="text-text text-[14px] leading-relaxed not-italic">
            {confirmation.venue.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        ) : (
          <p className="text-text-muted text-[14px]">
            Your host will share the meeting point before the experience.
          </p>
        )}
        {confirmation.venue.mapUrl ? (
          <a
            href={confirmation.venue.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-[13px] font-medium underline-offset-4 hover:underline"
          >
            Open in maps
          </a>
        ) : null}
      </div>

      {/* ── Voucher ──────────────────────────────────────────────────── */}
      <div className="border-line flex flex-col gap-3 border-t pt-5">
        <span className="eyebrow">Voucher</span>
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
      <dt className="text-text-subtle shrink-0">{label}</dt>
      <dd className={cn("text-text text-right break-all", mono && "font-mono text-[12px]")}>
        {value}
      </dd>
    </div>
  );
}
