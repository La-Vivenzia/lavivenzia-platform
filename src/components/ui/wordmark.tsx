import Image from "next/image";

/**
 * The La Vivenzia brand lockup.
 *
 * The **name** is set in the display face rather than shipped as an image: it
 * stays crisp at any size, inherits colour from its surroundings, and is
 * selectable, translatable text for search engines and screen readers.
 *
 * The **mark** is the pin symbol lifted from the supplied artwork
 * (`public/Lavivenzia_logo.png`) and cut out onto transparency.
 *
 * Two things about that cut-out are worth knowing before reusing it:
 *
 * 1. **It is for dark surfaces only.** The source is a presentation render with
 *    a warm glow baked into it. On the ink ground the glow reads as lighting;
 *    on the ivory canvas it shows as a brown smudge. Every current use is on
 *    `bg-ink`.
 * 2. **The supplied artwork's tagline is misspelled** — "Joumey" and "Th1ough"
 *    — so only the pin is used here, never the full lockup. Replace the source
 *    file and re-cut once the designer supplies a corrected, transparent asset
 *    (ideally SVG, which would remove both problems).
 */

const SIZES = {
  sm: { text: "text-[13px] tracking-[0.3em]", mark: 22 },
  md: { text: "text-[15px] tracking-[0.32em]", mark: 28 },
  lg: { text: "text-[22px] tracking-[0.28em]", mark: 42 },
} as const;

export function Wordmark({
  size = "md",
  tone = "inherit",
  mark = false,
}: {
  readonly size?: keyof typeof SIZES;
  readonly tone?: "inherit" | "gold";
  /** Show the pin symbol beside the name. Dark surfaces only — see above. */
  readonly mark?: boolean;
}) {
  const scale = SIZES[size];

  const name = (
    <span
      className={`font-display block leading-none uppercase ${scale.text} ${
        tone === "gold" ? "text-gold-light" : ""
      }`}
    >
      La&nbsp;Vivenzia
    </span>
  );

  if (!mark) return name;

  return (
    <span className="flex items-center gap-2.5">
      <Image
        src="/brand/mark.png"
        // Decorative: the name sits right beside it, so announcing the mark as
        // well would read the brand twice to a screen reader.
        alt=""
        width={Math.round(scale.mark * 0.82)}
        height={scale.mark}
        // Small and above the fold in every use, so it is not lazy-loaded.
        priority
        className="h-auto w-auto"
        style={{ height: scale.mark, width: "auto" }}
      />
      {name}
    </span>
  );
}

/**
 * A short gold rule used to close a masthead or open a section.
 *
 * The one piece of pure decoration in the system, and it is one line — the
 * restraint is the point (DESIGN.md §28).
 */
export function GoldRule({ className = "" }: { readonly className?: string }) {
  return <span aria-hidden="true" className={`block h-px w-10 bg-gold-light/70 ${className}`} />;
}
