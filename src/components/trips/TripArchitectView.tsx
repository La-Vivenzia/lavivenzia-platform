"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BedDouble,
  Check,
  Clock,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Printer,
  Users,
} from "lucide-react";

import { CuratorScore } from "@/components/trips/CuratorScore";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Wordmark } from "@/components/ui/wordmark";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration, formatMoneyMinor } from "@/lib/format";
import type { CheckoutMode } from "@/modules/booking/contract";
import type { Trip, TripDayPlan, TripLine, TripStay } from "@/modules/trips/data";
import type { SimulatedTripBooking } from "@/modules/trips/simulate";

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "booking" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "booked"; readonly booking: SimulatedTripBooking };

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

const money = (minor: number, currency: string) => formatMoneyMinor(minor, currency) ?? "—";

/**
 * The Trip Architect: one canvas holding a whole trip — the stay, both days'
 * running order, every curator score and the price — with a simulated
 * one-tap booking that returns a Master Trip Voucher.
 *
 * Two columns from `lg` (plan, then a sticky price panel); one column below,
 * the price panel after the plan.
 *
 * The browser sends a trip id and a party size and nothing else. The total on
 * the voucher is the server's, and the server refuses when checkout is off.
 */
export function TripArchitectView({
  trips,
  initialTripId,
  checkoutMode,
}: {
  readonly trips: readonly Trip[];
  readonly initialTripId?: string;
  readonly checkoutMode: CheckoutMode;
}) {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState(
    trips.some((trip) => trip.id === initialTripId) ? initialTripId : trips[0]?.id,
  );
  const [partySize, setPartySize] = useState(2);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const selected = trips.find((trip) => trip.id === selectedId) ?? trips[0];
  if (!selected) return null;

  const party = Math.min(partySize, selected.maxPartySize);
  const open = checkoutMode !== "off";

  const choose = (id: string) => {
    setSelectedId(id);
    setPhase({ kind: "idle" });
  };

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  // Arrow-key movement between tabs, per the WAI-ARIA tabs pattern.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = trips[(index + step + trips.length) % trips.length]!;
    choose(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  const book = () => {
    setPhase({ kind: "booking" });
    api
      .post<SimulatedTripBooking>("/api/v1/trips/simulate-book", {
        tripId: selected.id,
        partySize: party,
      })
      .then((booking) => setPhase({ kind: "booked", booking }))
      .catch((error: unknown) => setPhase({ kind: "failed", message: messageOf(error) }));
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Curated trips"
        className="rail -mx-5 flex gap-2 px-5 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-wrap lg:px-0"
      >
        {trips.map((trip, index) => {
          const active = trip.id === selected.id;
          return (
            <button
              key={trip.id}
              id={tabId(trip.id)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => choose(trip.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "rail-item min-h-11 shrink-0 rounded-pill border px-4 text-[12.5px] whitespace-nowrap transition-colors duration-300 sm:px-5 sm:text-[13px]",
                active
                  ? "border-primary bg-primary text-text-inverse dark:border-accent dark:bg-accent dark:text-accent-fg"
                  : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {trip.title}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selected.id)}
        className="mt-8 lg:mt-12"
      >
        <TripMasthead trip={selected} />

        <div className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-12 lg:gap-10">
          <div className="flex flex-col gap-8 lg:col-span-7 xl:col-span-8">
            <StayCard stay={selected.stay} currency={selected.currency} />
            {selected.days.map((plan) => (
              <DayTimeline
                key={plan.day}
                plan={plan}
                stay={selected.stay}
                currency={selected.currency}
              />
            ))}
          </div>

          <aside aria-label="Price and booking" className="lg:col-span-5 xl:col-span-4">
            <div className="flex flex-col gap-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-24">
              {phase.kind === "booked" ? (
                <MasterTripVoucher
                  booking={phase.booking}
                  onStartOver={() => setPhase({ kind: "idle" })}
                />
              ) : (
                <>
                  <PartyStepper
                    value={party}
                    max={selected.maxPartySize}
                    disabled={phase.kind === "booking"}
                    onChange={(next) => {
                      setPartySize(next);
                      setPhase({ kind: "idle" });
                    }}
                  />
                  <PriceBreakdown trip={selected} party={party} />

                  {phase.kind === "failed" ? (
                    <Alert tone="danger" title="The simulation did not complete">
                      {phase.message}
                    </Alert>
                  ) : null}

                  <div className="flex flex-col gap-3">
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      loading={phase.kind === "booking"}
                      disabled={!open}
                      onClick={book}
                    >
                      Simulate Full Trip Booking
                    </Button>
                    {open ? (
                      <p className="text-[12px] leading-relaxed text-fg-muted">
                        A simulation. Nothing is charged and nothing is reserved with any venue.
                      </p>
                    ) : (
                      <Alert tone="info">
                        Trip booking is not open yet. The plan and prices are here to explore.
                      </Alert>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Masthead ────────────────────────────────────────────────────────────────

function TripMasthead({ trip }: { readonly trip: Trip }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
      <div className="max-w-[60ch]">
        <p className="eyebrow text-[10px] text-accent-ink lg:text-[11px]">
          {trip.region} · {trip.mood}
        </p>
        <h2 className="mt-2 font-display text-[24px] leading-[1.18] text-heading sm:text-[28px] lg:text-[34px]">
          {trip.title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed font-light text-fg-muted lg:text-[15px]">
          {trip.tagline}
        </p>
      </div>

      <dl className="flex shrink-0 flex-wrap gap-x-8 gap-y-4 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
        <div>
          <dt className="eyebrow text-[10px] text-fg-muted">Trip</dt>
          <dd className="mt-1 text-[15px] text-fg">2 days · 1 night</dd>
        </div>
        <div>
          <dt className="eyebrow text-[10px] text-fg-muted">Lowest curator score</dt>
          <dd className="mt-1 text-[15px] text-fg tabular-nums">
            {trip.minCuratorScore.toFixed(1)} / 5
          </dd>
        </div>
        <div>
          <dt className="eyebrow text-[10px] text-fg-muted">Per person</dt>
          <dd className="mt-1 font-display text-[20px] text-heading">
            {money(trip.perPersonPriceMinor, trip.currency)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ── Stay ────────────────────────────────────────────────────────────────────

function StayCard({ stay, currency }: { readonly stay: TripStay; readonly currency: string }) {
  return (
    <section
      aria-label="Stay"
      className="rounded-card border border-accent/35 bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="eyebrow flex items-center gap-2 text-[10px] text-fg-muted">
          <BedDouble className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          Stay · 1 night
        </p>
        <CuratorScore {...stay.curation} />
      </div>
      <h3 className="mt-3 font-display text-[20px] leading-snug text-heading sm:text-[22px]">
        {stay.title}
      </h3>
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-light text-fg-muted">
        <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
        {stay.addressLine}
      </p>
      <p className="mt-3 text-[14px] leading-relaxed font-light text-fg">{stay.summary}</p>
      <CuratorNote note={stay.curation.note} />

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-fg-muted">Check-in</dt>
          <dd className="mt-0.5 text-fg tabular-nums">Day 1 · {formatClock(stay.checkInMinute)}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Check-out</dt>
          <dd className="mt-0.5 text-fg tabular-nums">
            Day 2 · {formatClock(stay.checkOutMinute)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">Per person, twin share</dt>
          <dd className="mt-0.5 text-fg">
            {money(stay.priceMinor, currency)} <IndicativeTag />
          </dd>
        </div>
      </dl>
    </section>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

type TimelineEntry =
  | { readonly kind: "marker"; readonly minute: number; readonly label: string }
  | { readonly kind: "line"; readonly minute: number; readonly line: TripLine };

function DayTimeline({
  plan,
  stay,
  currency,
}: {
  readonly plan: TripDayPlan;
  readonly stay: TripStay;
  readonly currency: string;
}) {
  const headingId = useId();
  const marker: TimelineEntry =
    plan.day === 1
      ? { kind: "marker", minute: stay.checkInMinute, label: `Check in · ${stay.title}` }
      : { kind: "marker", minute: stay.checkOutMinute, label: "Check out" };

  const entries: TimelineEntry[] = [
    marker,
    ...plan.lines.map((line): TimelineEntry => ({ kind: "line", minute: line.startMinute, line })),
  ].sort((left, right) => left.minute - right.minute);

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="flex items-baseline gap-3">
        <span className="font-display text-[22px] text-heading">Day {plan.day}</span>
        <span className="eyebrow text-[10px] text-fg-muted">Master timeline</span>
      </h3>

      <ol className="relative mt-5 flex flex-col gap-4">
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[11px] w-px bg-accent/40"
        />
        {entries.map((entry) =>
          entry.kind === "marker" ? (
            <li key="marker" className="relative flex items-center gap-3 pl-9">
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-[7px] h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-accent"
              />
              <span className="text-[13px] text-fg tabular-nums">{formatClock(entry.minute)}</span>
              <span className="text-[13px] text-fg-muted">{entry.label}</span>
            </li>
          ) : (
            <TimelineCard key={entry.line.id} line={entry.line} currency={currency} />
          ),
        )}
      </ol>
    </section>
  );
}

function TimelineCard({ line, currency }: { readonly line: TripLine; readonly currency: string }) {
  const title = line.experienceSlug ? (
    <Link
      href={`/experiences/${line.experienceSlug}`}
      className="group inline-flex items-start gap-1 hover:text-primary dark:hover:text-accent"
    >
      {line.title}
      <ArrowUpRight
        className="mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        strokeWidth={1.6}
        aria-hidden="true"
      />
    </Link>
  ) : (
    line.title
  );

  return (
    <li className="relative pl-9">
      <span
        aria-hidden="true"
        className="absolute top-6 left-[5px] h-[13px] w-[13px] rounded-full border border-accent bg-bg"
      />
      <article className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[13px] text-fg tabular-nums">
            <Clock
              className="h-[14px] w-[14px] text-fg-muted"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            {formatClock(line.startMinute)} – {formatClock(line.endMinute)}
            <span className="text-fg-muted">· {formatDuration(line.durationMinutes)}</span>
          </p>
          <CuratorScore {...line.curation} />
        </div>
        <h4 className="mt-3 font-display text-[16px] leading-snug text-heading lg:text-[17px]">
          {title}
        </h4>
        <p className="mt-1 text-[12px] leading-snug font-light text-fg-muted">{line.addressLine}</p>
        <CuratorNote note={line.curation.note} />
        <p className="mt-3 text-[13px] text-fg">
          {money(line.priceMinor, currency)} <span className="text-fg-muted">per person</span>
          {line.priceBasis === "indicative" ? (
            <>
              {" "}
              <IndicativeTag />
            </>
          ) : null}
        </p>
      </article>
    </li>
  );
}

function CuratorNote({ note }: { readonly note: string }) {
  return (
    <p className="mt-3 border-l-2 border-accent/50 pl-3 text-[13px] leading-relaxed font-light text-fg-muted">
      <span className="sr-only">La Vivenzia curation note: </span>
      {note}
      <span className="mt-1 block text-[11px] tracking-[0.08em] text-fg-muted uppercase">
        — La Vivenzia curation team
      </span>
    </p>
  );
}

function IndicativeTag() {
  return (
    <span className="ml-1 inline-flex items-center rounded-pill border border-line-strong px-1.5 py-px align-middle text-[10px] tracking-[0.08em] text-fg-muted uppercase">
      Indicative
    </span>
  );
}

// ── Party and price ─────────────────────────────────────────────────────────

function PartyStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  readonly value: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly onChange: (next: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="eyebrow mb-3 flex items-center gap-2 text-fg-muted">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        Travellers
      </legend>
      <div className="flex items-center justify-between rounded-pill border border-line-strong px-2 py-1.5">
        <StepButton
          label="Remove a traveller"
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </StepButton>
        <output aria-live="polite" className="text-[15px] font-medium text-fg tabular-nums">
          {value} {value === 1 ? "traveller" : "travellers"}
        </output>
        <StepButton
          label="Add a traveller"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </StepButton>
      </div>
      <p className="text-[12px] text-fg-muted">Up to {max} travellers on this trip.</p>
    </fieldset>
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
      className="flex h-9 w-9 items-center justify-center rounded-pill text-fg transition-colors duration-200 hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function PriceBreakdown({ trip, party }: { readonly trip: Trip; readonly party: number }) {
  const rows = [
    { id: "stay", title: trip.stay.title, unit: trip.stay.priceMinor, basis: trip.stay.priceBasis },
    ...trip.days.flatMap((plan) =>
      plan.lines.map((line) => ({
        id: line.id,
        title: line.title,
        unit: line.priceMinor,
        basis: line.priceBasis,
      })),
    ),
  ];

  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow text-fg-muted">Price breakdown</span>
      <dl className="flex flex-col gap-2.5 text-[13px]">
        {rows.map((row) => (
          <div key={row.id} className="flex items-baseline justify-between gap-4">
            <dt className="min-w-0 text-fg-muted">
              <span className="line-clamp-2">{row.title}</span>
              <span className="text-[11.5px]">
                {money(row.unit, trip.currency)} × {party}
                {row.basis === "indicative" ? " · indicative" : ""}
              </span>
            </dt>
            <dd className="shrink-0 text-right text-fg tabular-nums">
              {money(row.unit * party, trip.currency)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <span className="text-[13px] text-fg">Trip total</span>
        <span className="font-display text-[22px] text-heading tabular-nums">
          {money(trip.perPersonPriceMinor * party, trip.currency)}
        </span>
      </div>
      {trip.hasIndicativePricing ? (
        <p className="text-[12px] leading-relaxed text-fg-muted">
          Indicative figures are planning estimates, not venue quotes. Taxes and fees are not
          included.
        </p>
      ) : null}
    </div>
  );
}

// ── Voucher ─────────────────────────────────────────────────────────────────

function MasterTripVoucher({
  booking,
  onStartOver,
}: {
  readonly booking: SimulatedTripBooking;
  readonly onStartOver: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { payment } = booking;

  const whatsappText = [
    "*La Vivenzia Curated Trip Concierge* 🛎️",
    "",
    `Trip: ${booking.trip.title}`,
    `Reference: ${booking.bookingReference}`,
    `Party Size: ${booking.partySize} ${booking.partySize === 1 ? "traveller" : "travellers"}`,
    `Region: ${booking.trip.region}`,
    "",
    "Hi Butler! I've confirmed my trip. Please activate live concierge updates, route guidance, and dynamic recommendations for my group.",
  ].join("\n");

  const whatsappHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`;

  // Move focus to the result so keyboard and screen-reader users land on it.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section aria-labelledby="trip-voucher" className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3" role="status">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-success-wash text-success">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="eyebrow text-fg-muted">Simulated booking confirmed</span>
        <h3
          id="trip-voucher"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[24px] leading-tight text-heading outline-none"
        >
          Master Trip Voucher
        </h3>
      </div>

      {/* The pine panel with a gold hairline — the same surface as the journey pass. */}
      <div className="relative isolate overflow-hidden rounded-card border border-accent/45 bg-panel p-5 text-panel-fg shadow-raised">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[7px] -z-10 rounded-[calc(var(--radius-card)-7px)] border border-accent/20"
        />
        <div className="flex items-start justify-between gap-3">
          <Wordmark size="sm" tone="gold" />
          <span className="eyebrow text-[9px] text-panel-fg/80">Simulated</span>
        </div>
        <p className="mt-4 font-display text-[18px] leading-snug text-accent">
          {booking.trip.title}
        </p>
        <p className="mt-1 text-[12px] font-light text-panel-fg/85">
          {booking.trip.region} · {booking.partySize}{" "}
          {booking.partySize === 1 ? "traveller" : "travellers"}
        </p>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-accent/25 pt-4">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.18em] text-panel-fg/80 uppercase">
              Booking reference
            </p>
            <p className="mt-1 font-mono text-[17px] tracking-[0.08em]">
              {booking.bookingReference}
            </p>
          </div>
          {/* A white quiet zone so the code scans on the dark panel. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing to optimise */}
          <img
            src={booking.voucher.qrDataUri}
            alt={`Voucher QR code for ${booking.bookingReference}`}
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-md bg-white p-1"
          />
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 text-[13px]">
        <VoucherRow label="Transaction" value={payment.transactionId} mono />
        <VoucherRow
          label="Total (not charged)"
          value={money(payment.amountMinor, payment.currency)}
        />
        <VoucherRow label="Charged" value={money(payment.chargedMinor, payment.currency)} />
      </dl>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <span className="eyebrow text-fg-muted">Pre-booked (simulated)</span>
        <ul className="flex flex-col gap-2 text-[13px]">
          {booking.lines.map((line) => (
            <li key={line.id} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="min-w-0 text-fg">
                <span className="text-fg-muted tabular-nums">
                  Day {line.day} · {formatClock(line.startMinute)} ·{" "}
                </span>
                {line.title}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Alert tone="warning">{booking.notice}</Alert>

      <div className="flex flex-col gap-2.5">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-[#25D366] px-4 py-2.5 text-[14px] font-medium text-white shadow-subtle transition-opacity hover:opacity-90 active:scale-[0.99]"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Activate WhatsApp Trip Butler
        </a>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button variant="secondary" className="w-full" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print voucher
          </Button>
          <Button variant="ghost" className="w-full" onClick={onStartOver}>
            Plan another trip
          </Button>
        </div>
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
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className={cn("text-right break-all text-fg", mono && "font-mono text-[12px]")}>
        {value}
      </dd>
    </div>
  );
}
