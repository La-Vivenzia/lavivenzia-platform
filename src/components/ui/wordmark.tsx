/**
 * The La Vivenzia wordmark.
 *
 * Set in the display face with wide tracking rather than shipped as an image:
 * it stays crisp at any size, inherits colour from its surroundings, and is
 * selectable and readable text for search engines and screen readers.
 */
export function Wordmark({
  size = "md",
  tone = "inherit",
}: {
  readonly size?: "sm" | "md" | "lg";
  readonly tone?: "inherit" | "gold";
}) {
  const sizes = {
    sm: "text-[13px] tracking-[0.3em]",
    md: "text-[15px] tracking-[0.32em]",
    lg: "text-[22px] tracking-[0.28em]",
  } as const;

  return (
    <span
      className={`font-display block leading-none uppercase ${sizes[size]} ${
        tone === "gold" ? "text-gold-light" : ""
      }`}
    >
      La&nbsp;Vivenzia
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
