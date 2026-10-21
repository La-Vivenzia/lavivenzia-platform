import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The masthead every interior page opens with.
 *
 * One component so `/experiences`, `/destinations`, `/categories` and each
 * detail page share a rhythm rather than each inventing an eyebrow, a heading
 * size and a divider of its own. That drift is what made the site feel like
 * several sites before this milestone.
 *
 * The composition follows the approved references: a gold wide-tracked eyebrow,
 * a display-serif title, an optional line of muted supporting copy, and an
 * optional action on the right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow ? (
            <span className="text-accent-ink text-[10px] tracking-[0.24em] uppercase sm:text-[11px]">
              {eyebrow}
            </span>
          ) : null}

          <h1 className="font-display text-heading text-[28px] leading-[1.12] sm:text-[36px] lg:text-[42px]">
            {title}
          </h1>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {description ? (
        <p className="text-fg-muted max-w-2xl text-[14.5px] leading-[1.65] font-light">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/**
 * Standard page padding.
 *
 * One component so every interior screen breathes identically — the same reason
 * the consoles have `HostPage` and `OpsPage`. The max width matches the
 * approved desktop shell.
 */
export function PageBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12 lg:py-16 3xl:max-w-[1680px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
