import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

/**
 * Buttons (DESIGN.md §11).
 *
 * Three intents and nothing more. A fourth variant is almost always a sign that
 * a screen wants a different hierarchy rather than a different button.
 *
 * Every variant supports the six states §11 requires: default, hover, focus,
 * active, disabled and loading. Loading is a real state rather than a swapped
 * label — the button keeps its width, so the layout does not jump while a
 * request is in flight.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm " +
  "font-medium tracking-[0.06em] uppercase transition-[background-color,border-color,color,box-shadow] " +
  "duration-200 ease-[var(--ease-out-soft)] disabled:cursor-not-allowed disabled:opacity-45 " +
  "disabled:hover:shadow-none";

const VARIANTS: Record<ButtonVariant, string> = {
  /*
   * Ink rather than gold. Gold on gold-adjacent ivory is a weak call to action,
   * and DESIGN.md §5 is explicit that gold earns its value from scarcity — a
   * gold fill on every primary button spends it. The gold hairline on hover is
   * where the brand shows up.
   */
  primary:
    "bg-ink text-text-inverse border border-ink hover:bg-charcoal hover:border-gold-light " +
    "active:bg-ink-soft shadow-raise hover:shadow-panel",
  secondary:
    "bg-transparent text-text border border-line-strong hover:border-gold hover:text-gold-deep " +
    "hover:bg-gold-wash/40 active:bg-gold-wash",
  ghost:
    "bg-transparent text-text-muted border border-transparent hover:text-text hover:bg-surface-sunken",
  danger:
    "bg-transparent text-danger border border-danger/35 hover:bg-danger-wash hover:border-danger/60",
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
