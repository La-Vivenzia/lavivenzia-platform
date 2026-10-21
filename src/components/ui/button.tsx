import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

/**
 * Buttons (DESIGN.md §11).
 *
 * Every variant supports the six states §11 requires: default, hover, focus,
 * active, disabled and loading. Loading is a real state rather than a swapped
 * label — the button keeps its width, so the layout does not jump while a
 * request is in flight.
 *
 * **A variant carries every colour it needs. Never pass colours through
 * `className` to override one.** Tailwind utilities all have the same
 * specificity, so which one wins is decided by the order they appear in the
 * generated stylesheet — not by the order they appear in the class attribute.
 * `bg-transparent` is emitted after `bg-gold-light`, so appending the latter to
 * a `secondary` button silently does nothing. That is how the hero call to
 * action came to render near-black text on a near-black ground: present,
 * clickable, invisible.
 *
 * The two `-on-dark` variants exist because of that: a button on the ink ground
 * needs a whole palette, not a patch over the light one.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  /** Primary call to action on a dark ground. */
  | "gold"
  /** Secondary on a dark ground: hairline border, light text. */
  | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

/*
 * Pill, not a 3px rectangle.
 *
 * Every call to action in the approved references is fully rounded — the search
 * submit, "Get Early Access", the filter apply. This is the single strongest
 * shape signal in the design, so it belongs on the shared component rather than
 * being reapplied per screen. The consoles inherit it too, which is correct:
 * one product, one button.
 */
const BASE =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill " +
  "font-medium tracking-[0.06em] uppercase transition-[background-color,border-color,color,box-shadow] " +
  "duration-200 ease-[var(--ease-out-soft)] disabled:cursor-not-allowed disabled:opacity-45 " +
  "disabled:hover:shadow-none";

const VARIANTS: Record<ButtonVariant, string> = {
  /*
   * Deep green, matching the approved references: the primary action on a light
   * ground is `--color-primary`, seen on the search submit and on the active
   * navigation item in both reference screens.
   *
   * This was `bg-ink` while the palette was a placeholder, for a reason that no
   * longer applies. The argument then was that gold on gold-adjacent ivory is a
   * weak call to action, and that DESIGN.md §5 wants gold kept scarce. Both are
   * still true — and both were arguments against *gold*, not for ink. There was
   * simply no third colour to reach for. Now there is.
   *
   * Gold stays the primary on dark grounds via the `gold` variant below, which
   * is the inversion the two reference screens demonstrate.
   */
  primary:
    "bg-primary text-text-inverse border border-primary hover:bg-primary-hover " +
    "hover:border-primary-hover active:bg-primary-panel shadow-raise hover:shadow-panel",
  secondary:
    "bg-transparent text-text border border-line-strong hover:border-gold hover:text-gold-deep " +
    "hover:bg-gold-wash/40 active:bg-gold-wash",
  ghost:
    "bg-transparent text-text-muted border border-transparent hover:text-text hover:bg-surface-sunken",
  danger:
    "bg-transparent text-danger border border-danger/35 hover:bg-danger-wash hover:border-danger/60",

  /*
   * On the ink ground the scarcity argument inverts: gold is the only warm
   * thing on the surface, so a gold fill reads as the single most important
   * action rather than as decoration. Ink text on gold clears contrast
   * comfortably; cream on gold would not.
   */
  gold: "bg-gold-light text-ink border border-gold-light hover:bg-gold hover:border-gold shadow-raise",
  inverse:
    "bg-transparent text-text-inverse border border-line-inverse hover:border-gold-light " +
    "hover:text-gold-light active:bg-white/5",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-10 px-5 text-[12px]",
  lg: "h-12 px-7 text-[13px]",
};

/** Three dots rather than a spinning ring — quieter, and it matches the type. */
function LoadingDots() {
  return (
    <span className="absolute inset-0 flex items-center justify-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 rounded-full bg-current opacity-70 motion-safe:animate-pulse"
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      // A loading button is disabled, which is what stops a double submit. It
      // is also announced, so a screen-reader user is told the request is in
      // progress rather than that the control simply stopped working.
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      <span className={loading ? "invisible" : "inline-flex items-center gap-2"}>{children}</span>
      {loading ? <LoadingDots /> : null}
    </button>
  );
}

export interface ButtonLinkProps {
  readonly href: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
  readonly children: ReactNode;
}

/** The same surface as a Button, for navigation. Stays an anchor, so it opens in a new tab. */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className = "",
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}>
      {children}
    </Link>
  );
}
