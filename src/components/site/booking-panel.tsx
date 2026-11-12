"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CalendarDays, Check, Clock, Minus, Plus, Printer, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import type { CheckoutMode } from "@/modules/booking/contract";
import {
  bookingReducer,
  canSubmit,
  currentGuestLimits,
  guestProblemMessage,
  initialBookingState,
  isBusy,
  selectedSlot,
  slotsForSelectedDay,
  type CheckoutOrderData,
  type HeldBooking,
} from "@/modules/booking/flow";
import { isPriced, quoteBooking, type PriceQuote } from "@/modules/booking/pricing";
import { EXPERIENCE_TIME_ZONE, type PublicSlot } from "@/modules/booking/slots";
import type { PricingUnit } from "@/modules/experiences/readiness";

/**
 * The booking panel on an experience page (FR-09, Phase 2 Sprint 2 & 3).
 *
 * Implements:
 * 1. Date, slot and guest selection.
 * 2. 5-minute capacity hold reservation via POST /api/v1/checkout/reserve (Sprint 2).
 * 3. Live countdown timer synchronized with server-issued `heldUntil`.
 * 4. Decoupled order initiation via POST /api/v1/checkout/orders (Sprint 3).
 * 5. Official Razorpay Checkout modal lifecycle and dismissal recovery.
 * 6. Non-authoritative payment authorization receipt presentation.
 */

/** A seat count at or below this is worth telling the traveller about. */
const LOW_SEATS = 5;

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: EXPERIENCE_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
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

function subscribeClock(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function getNow() {
  return Date.now();
}

function getServerNow() {
  return 0;
}

/** The brand green for Razorpay's frame, read from the token rather than restated. */
function themeColor(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue("--lv-primary").trim();
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined;
}

interface ReserveHoldApiResponse {
  readonly booking: {
    readonly id: string;
    readonly bookingReference: string;
    readonly status: string;
    readonly heldUntil: string | Date;
    readonly totalAmountMinorUnits: number;
    readonly currency: string;
    readonly guestCount: number;
    readonly slotId: string;
  };
  readonly quote: PriceQuote;
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

  const now = useSyncExternalStore(subscribeClock, getNow, getServerNow);
  const [isOrdering, setIsOrdering] = useState(false);
  const inFlightOrder = useRef(false);

  const base = `/api/v1/experiences/${encodeURIComponent(slug)}`;

  // ── 1. Load bookable slots on mount or reload ─────────────────────────────
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

  // ── 2. Expiration Trigger when Timer Reaches 0 ─────────────────────────────
  useEffect(() => {
    if (state.phase === "held" && state.hold?.heldUntil && now > 0) {
      const remainingMs = new Date(state.hold.heldUntil).getTime() - now;
      if (remainingMs <= 0) {
        dispatch({ type: "HOLD_EXPIRED" });
      }
    }
  }, [state.phase, state.hold?.heldUntil, now]);

  // ── 3. Sprint 2: Create Inventory Hold ────────────────────────────────────
  const handleReserveHold = async () => {
    if (!canSubmit(state) || !state.selectedSlotId) return;

    dispatch({ type: "SUBMIT" });

    try {
      const result = await api.post<ReserveHoldApiResponse>("/api/v1/checkout/reserve", {
        slotId: state.selectedSlotId,
        guests: state.guests,
      });

      const heldUntilIso =
        typeof result.booking.heldUntil === "string"
          ? result.booking.heldUntil
          : new Date(result.booking.heldUntil).toISOString();

      const hold: HeldBooking = {
        id: result.booking.id,
        bookingReference: result.booking.bookingReference,
        heldUntil: heldUntilIso,
        totalAmountMinorUnits: result.booking.totalAmountMinorUnits,
        currency: result.booking.currency,
        guestCount: result.booking.guestCount,
        slotId: result.booking.slotId,
      };

      dispatch({ type: "HOLD_RESERVED", hold, quote: result.quote });
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        if (caught.status === 401) {
          dispatch({
            type: "FAILED",
            message: "Please sign in as a traveller to reserve your seats.",
            code: "UNAUTHENTICATED",
          });
          return;
        }
        if (caught.status === 409) {
          dispatch({
            type: "FAILED",
            message:
              "These seats were just booked by another traveller. Please choose another time or adjust guests.",
            code: "CONFLICT",
          });
          return;
        }
      }
      dispatch({ type: "FAILED", message: messageOf(caught) });
    }
  };

  // ── 4. Sprint 3: Create Order & Open Razorpay Modal ────────────────────────
  const handleProceedToPayment = async () => {
    if (!state.hold || state.phase !== "held" || inFlightOrder.current) return;

    // Local hold expiry check before network dispatch
    if (secondsRemaining !== null && secondsRemaining <= 0) {
      dispatch({ type: "HOLD_EXPIRED" });
      return;
    }

    inFlightOrder.current = true;
    setIsOrdering(true);
    dispatch({ type: "PROCEED_TO_PAYMENT" });

    try {
      const order = await api.post<CheckoutOrderData>("/api/v1/checkout/orders", {
        bookingId: state.hold.id,
      });

      dispatch({ type: "ORDER_CREATED", order });

      const resolvedKeyId =
        order.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";

      const outcome = await openRazorpayCheckout({
        keyId: resolvedKeyId,
        orderId: order.orderId ?? order.gatewayOrderId,
        amountMinor: order.amount,
        currency: order.currency,
        title,
        reference: state.hold.bookingReference,
        themeColor: themeColor(),
      });

      if (outcome.kind === "paid") {
        dispatch({ type: "PAYMENT_AUTHORIZED", payment: outcome.payment });
      } else if (outcome.kind === "dismissed") {
        // Modal dismissal is non-fatal: preserves hold, allows customer to resume payment
        dispatch({ type: "PAYMENT_DISMISSED" });
      } else {
        // Card decline or transaction failure inside modal: preserves hold, allows another attempt
        dispatch({ type: "PAYMENT_FAILED", message: outcome.message });
      }
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        if (
          caught.status === 400 ||
          caught.code === "HOLD_EXPIRED" ||
          caught.message.toLowerCase().includes("hold has expired")
        ) {
          dispatch({ type: "HOLD_EXPIRED" });
          return;
        }
        if (caught.status === 409 && caught.code === "ORDER_CREATION_IN_PROGRESS") {
          dispatch({
            type: "FAILED",
            message:
              "An order creation request is currently being processed. Please wait a moment and try again.",
            code: caught.code,
          });
          return;
        }
        if (caught.status === 409 && caught.code === "ORDER_STATUS_UNRESOLVED") {
          dispatch({
            type: "FAILED",
            message:
              "A previous checkout attempt has an unresolved status. Please wait for automated verification or contact support.",
            code: caught.code,
          });
          return;
        }
        if (caught.status === 502) {
          dispatch({
            type: "FAILED",
            message: "Payment provider temporarily rejected the order. Please try again.",
            code: caught.code,
          });
          return;
        }
        if (caught.status === 504) {
          dispatch({
            type: "FAILED",
            message:
              "Payment provider timed out. Your hold is still active — please click to try again.",
            code: caught.code,
          });
          return;
        }
      }
      dispatch({ type: "FAILED", message: messageOf(caught) });
    } finally {
      inFlightOrder.current = false;
      setIsOrdering(false);
    }
  };

  // ── Render: Confirmation Screen ───────────────────────────────────────────
  if (state.phase === "confirmed") {
    return (
      <Confirmation
        hold={state.hold}
        paymentResult={state.paymentResult}
        quote={state.quote}
        title={title}
        guests={state.guests}
        onStartOver={() => {
          dispatch({ type: "START_OVER" });
          dispatch({ type: "RELOAD" });
        }}
      />
    );
  }

  // ── Render: Unpriced Experience Warning ────────────────────────────────────
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

  const displayQuote = state.quote || preview;

  const secondsRemaining =
    state.phase === "held" && state.hold?.heldUntil && now > 0
      ? Math.max(0, Math.floor((new Date(state.hold.heldUntil).getTime() - now) / 1000))
      : null;

  const countdownText =
    secondsRemaining !== null
      ? `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(
          secondsRemaining % 60,
        ).padStart(2, "0")}`
      : null;

  return (
    <div className="flex flex-col gap-6" aria-busy={state.phase === "loading" || busy}>
      {/* ── Active Hold Countdown Banner (Sprint 2) ───────────────────────── */}
      {state.phase === "held" && state.hold ? (
        <div className="border-line-gold bg-gold-wash flex flex-col gap-2 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow flex items-center gap-1.5 font-medium text-amber-900">
              <Timer className="h-4 w-4 animate-pulse text-amber-700" aria-hidden="true" />
              Seats Held Temporarily
            </span>
            {countdownText ? (
              <span className="bg-surface text-text rounded px-2 py-0.5 font-mono text-[13px] font-semibold tabular-nums shadow-xs">
                {countdownText}
              </span>
            ) : null}
          </div>
          <p className="text-text-muted text-[12px] leading-relaxed">
            Reference:{" "}
            <strong className="font-mono text-text">{state.hold.bookingReference}</strong>. Complete
            payment before the timer reaches 00:00 to guarantee your seats.
          </p>
        </div>
      ) : null}

      {/* ── Hold Expired Banner (Sprint 2) ─────────────────────────────────── */}
      {state.phase === "hold_expired" ? (
        <div className="flex flex-col gap-4">
          <Alert tone="warning" title="Reservation hold expired">
            Your 5-minute inventory hold has expired. To give other travellers a fair chance,
            unconfirmed seats are released back to public availability.
          </Alert>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              dispatch({ type: "START_OVER" });
              dispatch({ type: "RELOAD" });
            }}
          >
            Select date & time again
          </Button>
        </div>
      ) : null}

      {/* ── Notice / Dismissal Alert ──────────────────────────────────────── */}
      {state.notice && state.phase !== "hold_expired" ? (
        <Alert tone="info">{state.notice}</Alert>
      ) : null}

      {/* ── Date Selection (Only visible when selecting or reserving) ──────── */}
      {state.phase !== "held" && state.phase !== "hold_expired" ? (
        <>
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
              <p className="text-text-muted text-[14px]">
                No dates are currently open for booking. Check back soon.
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label="Available dates"
                className="flex gap-2 overflow-x-auto pb-1"
              >
                {state.days.map((day) => {
                  const date = dayKeyToDate(day.key);
                  const selected = day.key === state.selectedDay;
                  return (
                    <button
                      key={day.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => dispatch({ type: "SELECT_DAY", day: day.key })}
                      className={cn(
                        "flex h-[68px] min-w-[60px] shrink-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 transition-all duration-200",
                        selected
                          ? "border-primary bg-primary text-primary-contrast shadow-sm"
                          : "border-line bg-surface hover:border-line-gold text-text",
                      )}
                    >
                      <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                        {dayFormat.format(date).split(" ")[0]}
                      </span>
                      <span className="font-display text-[18px] leading-tight font-semibold">
                        {date.getDate()}
                      </span>
                      <span className="text-[10px] opacity-75">
                        {dayFormat.format(date).split(" ")[1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* ── Time Slots ─────────────────────────────────────────────────── */}
          {state.selectedDay && state.days.length > 0 ? (
            <fieldset className="flex min-w-0 flex-col gap-3" disabled={busy}>
              <legend className="eyebrow mb-2 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Select a time
              </legend>
              <div className="flex flex-wrap gap-2">
                {slotsForSelectedDay(state).map((candidateSlot) => {
                  const startsAt = new Date(candidateSlot.startsAt);
                  const endsAt = new Date(candidateSlot.endsAt);
                  const selected = candidateSlot.id === state.selectedSlotId;
                  const isLow =
                    candidateSlot.seatsRemaining > 0 && candidateSlot.seatsRemaining <= LOW_SEATS;

                  return (
                    <button
                      key={candidateSlot.id}
                      type="button"
                      onClick={() => dispatch({ type: "SELECT_SLOT", slotId: candidateSlot.id })}
                      className={cn(
                        "flex flex-col items-start rounded-md border px-3 py-2 text-left transition-all duration-200",
                        selected
                          ? "border-primary bg-primary-wash text-primary font-medium"
                          : "border-line bg-surface hover:border-line-gold text-text",
                      )}
                    >
                      <span className="text-[13px] tabular-nums">
                        {timeFormat.format(startsAt)} – {timeFormat.format(endsAt)}
                      </span>
                      {isLow ? (
                        <span className="text-[10px] text-amber-600 font-medium">
                          {candidateSlot.seatsRemaining} seat
                          {candidateSlot.seatsRemaining === 1 ? "" : "s"} left
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {/* ── Guests Stepper ────────────────────────────────────────────── */}
          {slot ? (
            <fieldset
              className="flex items-center justify-between border-t border-line pt-4"
              disabled={busy}
            >
              <div>
                <legend className="eyebrow mb-0.5 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Party size
                </legend>
                <span className="text-text-subtle text-[12px]">
                  {limits?.min ?? 1} to {limits?.max ?? 10} guests allowed
                </span>
              </div>
              <div className="flex items-center gap-3">
                <StepButton
                  label="Decrease guests"
                  disabled={busy || !limits || state.guests <= limits.min}
                  onClick={() => dispatch({ type: "SET_GUESTS", guests: state.guests - 1 })}
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </StepButton>
                <span className="font-display text-[16px] font-semibold tabular-nums min-w-[20px] text-center">
                  {state.guests}
                </span>
                <StepButton
                  label="Increase guests"
                  disabled={busy || !limits || state.guests >= limits.max}
                  onClick={() => dispatch({ type: "SET_GUESTS", guests: state.guests + 1 })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </StepButton>
              </div>
            </fieldset>
          ) : null}

          {/* ── Guest Problem Warning ───────────────────────────────────────── */}
          {guestProblem ? (
            <Alert tone="warning" title="Party limit">
              {guestProblem}
            </Alert>
          ) : null}
        </>
      ) : null}

      {/* ── Price Breakdown ───────────────────────────────────────────────── */}
      {displayQuote && state.phase !== "hold_expired" ? (
        <PriceBreakdown quote={displayQuote} />
      ) : null}

      {/* ── Error Banner & Actions ────────────────────────────────────────── */}
      {state.phase === "error" && state.error ? (
        <div className="flex flex-col gap-3">
          {state.errorCode === "UNAUTHENTICATED" ? (
            <div className="flex flex-col gap-3">
              <Alert tone="warning" title="Sign in required">
                {state.error}
              </Alert>
              <Link
                href={`/sign-in?redirect=${encodeURIComponent(`/experiences/${slug}`)}`}
                className="bg-primary text-primary-contrast hover:bg-primary-hover inline-flex items-center justify-center rounded-pill px-6 py-3 text-[14px] font-medium transition-colors"
              >
                Sign in to reserve
              </Link>
              <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "DISMISS_ERROR" })}>
                Back to selection
              </Button>
            </div>
          ) : (
            <>
              <Alert tone="danger" title="Booking could not proceed">
                {state.error}
              </Alert>
              <Button
                size="sm"
                onClick={() => {
                  dispatch({ type: "DISMISS_ERROR" });
                  if (!state.hold) dispatch({ type: "RELOAD" });
                }}
              >
                {state.hold ? "Try payment again" : "Review and try again"}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {/* ── Action Buttons ────────────────────────────────────────────────── */}
      {checkoutMode === "off" ? (
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" className="w-full" disabled>
            Booking opens soon
          </Button>
          <p className="text-text-subtle text-[12px] leading-relaxed">
            You can explore dates and prices now. Reservations open shortly.
          </p>
        </div>
      ) : state.phase === "held" && state.hold ? (
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={isOrdering}
            disabled={secondsRemaining !== null && secondsRemaining <= 0}
            onClick={handleProceedToPayment}
          >
            {state.notice
              ? "Resume Payment"
              : `Proceed to Payment · ${money(displayQuote?.totalMinor ?? state.hold.totalAmountMinorUnits, state.hold.currency)}`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              dispatch({ type: "START_OVER" });
              dispatch({ type: "RELOAD" });
            }}
          >
            Release hold & choose another slot
          </Button>
          <ModeNote mode={checkoutMode} />
        </div>
      ) : state.phase !== "error" && state.phase !== "hold_expired" ? (
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={state.phase === "reserving"}
            disabled={!canSubmit(state)}
            onClick={handleReserveHold}
          >
            {preview ? `Hold Seats · ${money(preview.totalMinor, preview.currency)}` : "Hold Seats"}
          </Button>
          <span className="sr-only" role="status">
            {state.phase === "reserving"
              ? "Reserving capacity hold"
              : state.phase === "ordering"
                ? "Initiating payment order"
                : state.phase === "paying"
                  ? "Payment window open"
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
        The host&rsquo;s price. 5-minute capacity hold reserved upon confirmation.
      </p>
    </dl>
  );
}

function ModeNote({ mode }: { readonly mode: CheckoutMode }) {
  if (mode === "demo") {
    return (
      <Alert tone="warning" title="Demo checkout">
        No payment is taken. You will experience the full reservation and authorization flow.
      </Alert>
    );
  }
  if (mode === "razorpay_test") {
    return (
      <Alert tone="warning" title="Razorpay test mode">
        Use Razorpay test cards or test UPI. No real money moves.
      </Alert>
    );
  }
  return null;
}

// ── Confirmation Screen ────────────────────────────────────────────────────

function Confirmation({
  hold,
  paymentResult,
  quote,
  title,
  guests,
  onStartOver,
}: {
  readonly hold: HeldBooking | null;
  readonly paymentResult: { readonly paymentId: string; readonly orderId: string } | null;
  readonly quote: PriceQuote | null;
  readonly title: string;
  readonly guests: number;
  readonly onStartOver: () => void;
}) {
  return (
    <section aria-labelledby="booking-confirmed" className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3" role="status">
        <span className="bg-success-wash text-success flex h-10 w-10 items-center justify-center rounded-pill">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="eyebrow">Payment Authorized (Test Mode)</span>
        <h2 id="booking-confirmed" className="font-display text-text text-[24px] leading-tight">
          You&rsquo;re going.
        </h2>
      </div>

      <div className="border-line-gold bg-gold-wash flex flex-col gap-1 rounded-md border px-4 py-3">
        <span className="text-gold-deep text-[10px] tracking-[0.18em] uppercase">
          Booking reference
        </span>
        <span className="text-text font-mono text-[20px] tracking-[0.08em]">
          {hold?.bookingReference ?? "LV-CONFIRMED"}
        </span>
      </div>

      {/* Voucher Summary */}
      <div className="border-line flex flex-col gap-3 border-t pt-5">
        <span className="eyebrow">Reservation Summary</span>
        <dl className="flex flex-col gap-2.5 text-[13px]">
          <VoucherRow label="Experience" value={title} />
          <VoucherRow
            label="Guests"
            value={`${hold?.guestCount ?? guests} ${(hold?.guestCount ?? guests) === 1 ? "guest" : "guests"}`}
          />
          {quote ? (
            <VoucherRow label="Paid (Test Mode)" value={money(quote.totalMinor, quote.currency)} />
          ) : null}
          {paymentResult?.paymentId ? (
            <VoucherRow label="Gateway Payment ID" value={paymentResult.paymentId} mono />
          ) : null}
          {paymentResult?.orderId ? (
            <VoucherRow label="Gateway Order ID" value={paymentResult.orderId} mono />
          ) : null}
        </dl>
      </div>

      <Alert tone="warning">
        Razorpay test mode. Payment authorized successfully. Sprint 4 webhook intake will
        automatically reconcile captures and issue official travel vouchers.
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
        <Button variant="secondary" className="w-full" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print confirmation
        </Button>
        <Button variant="ghost" className="w-full" onClick={onStartOver}>
          Book another experience
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
