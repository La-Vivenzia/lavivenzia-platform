import type { ReactNode } from "react";

/**
 * Loading, empty, error and success (DESIGN.md §32).
 *
 * Collected here rather than improvised per screen, because §32 asks for all
 * four on every asynchronous surface and the reliable way to get that is for
 * them to already exist.
 */

type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_TONES: Record<AlertTone, string> = {
  info: "border-line-strong bg-surface-sunken text-text",
  success: "border-success/25 bg-success-wash text-success",
  warning: "border-warning/25 bg-warning-wash text-warning",
  danger: "border-danger/25 bg-danger-wash text-danger",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  readonly tone?: AlertTone;
  readonly title?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      // Assertive only for failures. An announcement that interrupts whatever a
      // screen reader was saying is right for an error and rude for a
      // confirmation.
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-sm border px-4 py-3 text-[13px] leading-relaxed ${ALERT_TONES[tone]}`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1 opacity-90" : ""}>{children}</div> : null}
    </div>
  );
}

/**
 * An empty state.
 *
 * Editorial line plus one clear action, per §32 — not an illustration and a
 * shrug. A host who has just arrived sees the same care as one with fifty
 * listings.
 */
export function EmptyState({
  eyebrow,
  title,
  description,
  action,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 border border-line bg-surface px-8 py-16 text-center">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h3 className="font-display max-w-md text-[20px] leading-snug text-text">{title}</h3>
      <p className="max-w-md text-[14px] leading-relaxed text-text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * A loading placeholder shaped like the content it stands in for.
 *
 * §32 asks for skeletons rather than blank space. Marked `aria-hidden` and
 * paired with a live-region message by the caller, so assistive technology gets
 * a sentence instead of a description of grey rectangles.
 */
export function Skeleton({ className = "" }: { readonly className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-xs bg-surface-sunken ${className}`}
    />
  );
}

export function LoadingRows({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div className="flex flex-col gap-px bg-line">
      <span className="sr-only" role="status">
        Loading
      </span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-6 bg-surface px-6 py-6">
          <Skeleton className="h-20 w-28 shrink-0" />
          <div className="flex w-full flex-col gap-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A section heading with the editorial eyebrow the rest of the product uses. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 className="font-display text-[22px] leading-tight text-text">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
