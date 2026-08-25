import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark, GoldRule } from "@/components/ui/wordmark";

/**
 * The two-panel entrance: a dark editorial column beside a light working column.
 *
 * The dark half is where DESIGN.md §3 lives — near-black, cinematic, gold
 * hairline, display serif. The light half is where a person actually types. It
 * is the same "anchor, do not flood" rule as the console rail, applied to the
 * pages someone meets before they have an account.
 *
 * There is no photography in the repository yet, so the panel is built from
 * layered warm gradients and a fine rule rather than a stock image. That is a
 * deliberate placeholder-free choice: an empty grey box would read as missing
 * art, whereas this reads as a composed surface. Art direction replaces it
 * without touching the layout.
 */
export function EditorialSplit({
  eyebrow,
  statement,
  attribution,
  children,
}: {
  readonly eyebrow: string;
  readonly statement: string;
  readonly attribution?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="bg-ink text-text-inverse relative isolate flex flex-col justify-between overflow-hidden px-8 py-10 sm:px-14 lg:px-16 lg:py-16">
        {/*
         * Two soft radial washes, warm and off-centre, so the panel has depth
         * without a gradient that announces itself. Decorative only.
         */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(120% 80% at 12% 0%, rgba(201,168,76,0.16), transparent 55%)," +
              "radial-gradient(90% 70% at 88% 100%, rgba(92,30,38,0.35), transparent 60%)",
          }}
        />

        <Link href="/" className="relative z-10 w-fit">
          <Wordmark size="md" tone="gold" />
        </Link>

        <div className="relative z-10 flex max-w-lg flex-col gap-6 py-16 lg:py-0">
          <span className="text-[10px] tracking-[0.24em] text-gold-light/80 uppercase">
            {eyebrow}
          </span>
          <p className="font-display text-[26px] leading-[1.35] sm:text-[32px]">{statement}</p>
          <GoldRule />
          {attribution ? (
            <p className="text-[13px] leading-relaxed text-text-inverse-muted">{attribution}</p>
          ) : null}
        </div>

        <p className="relative z-10 text-[11px] tracking-[0.14em] text-text-inverse-muted/70 uppercase">
          Curated experiences · Verified hosts
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        <div className="w-full max-w-[420px]">{children}</div>
      </section>
    </div>
  );
}
