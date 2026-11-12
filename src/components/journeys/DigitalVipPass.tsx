"use client";

import { useEffect, useRef } from "react";
import { Check, Crown, KeyRound, ShieldCheck } from "lucide-react";

import { Wordmark } from "@/components/ui/wordmark";
import { formatClock, formatMoneyMinor } from "@/lib/format";
import type { JourneyPass } from "@/modules/booking/journey-pass-contract";

const money = (minor: number, currency: string) => formatMoneyMinor(minor, currency) ?? "—";

/**
 * The Digital VIP Passcard — one pass for every act of a booked journey.
 *
 * The secret host keyword leads, because it is what the traveller needs at the
 * door; the reference, QR and acts follow. The pine panel with a gold hairline
 * is the same surface as the journey pass and the trip voucher (DESIGN.md
 * §B.5: one language), built from tokens only.
 *
 * Renders the server's pass as given: every price is the server's, every
 * privilege carries its own `confirmed` flag, and a simulated pass says so
 * above the fold. "Pay once, show up" is the product's promise; the notice
 * beneath it is the truth about this particular pass.
 */
export function DigitalVipPass({ pass }: { readonly pass: JourneyPass }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { payment } = pass;

  // Move focus to the result so keyboard and screen-reader users land on it.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section aria-labelledby="vip-pass-title" className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2" role="status">
        <span className="eyebrow text-fg-muted">
          {pass.simulated ? "Simulated booking confirmed" : "Booking confirmed"}
        </span>
        <h3
          id="vip-pass-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[24px] leading-tight text-heading outline-none"
        >
          Your Digital VIP Passcard
        </h3>
      </div>

      <div className="relative isolate overflow-hidden rounded-card border border-accent/45 bg-panel p-5 text-panel-fg shadow-raised sm:p-6">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[7px] -z-10 rounded-[calc(var(--radius-card)-7px)] border border-accent/20"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 85% 0%, color-mix(in oklab, var(--lv-accent) 22%, transparent), transparent 55%)",
          }}
        />

        <div className="flex items-start justify-between gap-3">
          <Wordmark size="sm" tone="gold" />
          <span className="eyebrow text-[9px] text-panel-fg/80">
            {pass.simulated ? "VIP Pass · Simulated" : "VIP Pass"}
          </span>
        </div>

        {/* The keyword: what the traveller says at every door. */}
        <div className="mt-5 rounded-card border border-accent/40 bg-panel-fg/5 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-panel-fg/80 uppercase">
            <KeyRound className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} aria-hidden="true" />
            Secret host keyword
          </p>
          <p className="mt-1.5 font-display text-[22px] leading-tight tracking-[0.08em] text-accent sm:text-[26px]">
            <span className="text-panel-fg/80">Say: </span>
            {pass.secretKeyword}
          </p>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-[19px] leading-tight text-panel-fg">
              {pass.holderName}
            </p>
            <p className="mt-1 text-[12px] font-light text-panel-fg/85">
              {pass.journey.title} · {pass.partySize} {pass.partySize === 1 ? "guest" : "guests"}
            </p>
            <p className="mt-3 text-[10px] tracking-[0.18em] text-panel-fg/80 uppercase">
              Booking reference
            </p>
            <p className="mt-1 font-mono text-[17px] tracking-[0.08em]">#{pass.reference}</p>
          </div>
          {/* A white quiet zone so the code scans on the dark panel. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing to optimise */}
          <img
            src={pass.qr.dataUri}
            alt={`Pass QR code for booking ${pass.reference}`}
            width={112}
            height={112}
            className="h-28 w-28 shrink-0 rounded-md bg-white p-1"
          />
        </div>

        <ol className="mt-5 flex flex-col gap-3 border-t border-accent/25 pt-4">
          {pass.acts.map((act, index) => (
            <li key={act.role} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/60 text-[11px] font-semibold text-accent"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.16em] text-panel-fg/75 uppercase">
                  Act {index + 1} · {act.label} · {formatClock(act.startMinute)}
                </p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-panel-fg">{act.title}</p>
                <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-panel-fg/85">
                  <Crown
                    className="mt-0.5 h-3 w-3 shrink-0 text-accent"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span>
                    {act.privilege.title}
                    <span className="text-panel-fg/70">
                      {act.privilege.confirmed ? " · confirmed" : " · requested"}
                    </span>
                  </span>
                </p>
                <p className="mt-1 text-[11.5px] leading-snug font-light text-panel-fg/75">
                  {act.hostInstruction}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex items-start gap-2 rounded-card bg-panel-fg/5 px-3 py-2.5">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-[12px] leading-relaxed text-panel-fg/90">
            <span className="font-semibold text-accent">Pay once, show up.</span> All inclusions and
            taxes are settled in one booking. Present this pass or state the secret keyword on
            arrival for priority seating — there is no bill to settle at any act.
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 text-[13px]">
        <PassRow
          label="Per person, all acts"
          value={money(payment.perPersonMinor, payment.currency)}
        />
        <PassRow
          label={pass.simulated ? "Total (not charged)" : "Total"}
          value={money(payment.amountMinor, payment.currency)}
        />
        <PassRow label="Charged" value={money(payment.chargedMinor, payment.currency)} />
      </dl>

      {pass.simulated ? (
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-fg-muted">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {pass.notice} Privileges marked &ldquo;requested&rdquo; are subject to each venue&rsquo;s
          confirmation.
        </p>
      ) : null}
    </section>
  );
}

function PassRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg tabular-nums">{value}</dd>
    </div>
  );
}
