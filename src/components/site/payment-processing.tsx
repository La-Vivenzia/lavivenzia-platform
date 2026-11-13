"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/cn";
import { SIMULATED_PROCESSING_MS } from "@/lib/hold";
import type { CheckoutMode } from "@/modules/booking/contract";

/**
 * The "Processing payment…" state shared by the booking panel and the journey
 * checkout (ADR-0016, amended Phase 4).
 *
 * It reports where the request actually is and claims nothing more. In
 * `demo`, the payment line says in words that nothing is charged; in
 * `razorpay_test`, "verifying" is shown only while the server checks the
 * provider's signature. The stage is the caller's real request state — the
 * one cosmetic step is the demo's own hand-off from "simulating" to "issuing",
 * inside the hold the caller already applies.
 */

export type ProcessingStage = "preparing" | "paying" | "confirming";

const STEPS: Record<Exclude<CheckoutMode, "off">, readonly [string, string, string]> = {
  demo: [
    "Checking live availability and price",
    "Simulating payment — nothing is charged",
    "Issuing your confirmation",
  ],
  razorpay_test: [
    "Checking live availability and price",
    "Complete payment in the Razorpay window",
    "Verifying payment with Razorpay",
  ],
};

export function PaymentProcessing({
  mode,
  stage,
  issuing = "Issuing your confirmation",
}: {
  readonly mode: Exclude<CheckoutMode, "off">;
  readonly stage: ProcessingStage;
  /** The last demo step, in the caller's words — e.g. "Issuing your VIP pass". */
  readonly issuing?: string;
}) {
  const [handedOff, setHandedOff] = useState(false);

  useEffect(() => {
    if (mode !== "demo" || stage !== "confirming") return;
    const timer = setTimeout(() => setHandedOff(true), SIMULATED_PROCESSING_MS / 2);
    return () => {
      clearTimeout(timer);
      setHandedOff(false);
    };
  }, [mode, stage]);

  const steps = mode === "demo" ? [STEPS.demo[0], STEPS.demo[1], issuing] : STEPS[mode];
  const current =
    stage === "preparing" ? 0 : stage === "paying" ? 1 : mode === "demo" && !handedOff ? 1 : 2;

  return (
    <div
      role="status"
      aria-live="polite"
      className="lv-gold-glow lv-gold-glow--card flex flex-col gap-4 rounded-card border border-line bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink dark:text-accent"
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <div>
          <p className="font-display text-[18px] leading-snug text-heading">
            Processing payment&hellip;
          </p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            {mode === "demo"
              ? "Demo checkout — no card is needed and nothing is charged."
              : "Razorpay test mode — no real money moves."}
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-2.5 text-[13px]">
        {steps.map((label, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2.5 transition-colors duration-300",
                done || active ? "text-fg" : "text-fg-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border",
                  done
                    ? "border-accent bg-accent text-accent-fg"
                    : active
                      ? "border-accent"
                      : "border-line-strong",
                )}
              >
                {done ? (
                  <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" />
                ) : active ? (
                  <span className="h-1.5 w-1.5 rounded-pill bg-accent motion-safe:animate-pulse" />
                ) : null}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
