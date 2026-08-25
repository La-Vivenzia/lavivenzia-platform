import type { ReactNode } from "react";
import type { ExperienceStatus } from "@/modules/experiences/lifecycle";
import type { HostVerificationStatus } from "@/modules/hosts/profile";

/**
 * Status badges and progress (DESIGN.md §25).
 *
 * One badge component for every status in the product, driven by a map. A
 * per-screen badge is how two screens end up calling the same state different
 * things — which, for a host waiting on a review, is the difference between
 * reassurance and confusion.
 */

type Tone = "neutral" | "progress" | "positive" | "caution" | "critical";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-text-muted border-line-strong",
  progress: "bg-info-wash text-charcoal border-line-strong",
  positive: "bg-success-wash text-success border-success/25",
  caution: "bg-warning-wash text-warning border-warning/25",
  critical: "bg-danger-wash text-danger border-danger/25",
};

const EXPERIENCE_STATUS: Record<ExperienceStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  IN_REVIEW: { label: "In review", tone: "progress" },
  PUBLISHED: { label: "Published", tone: "positive" },
  REJECTED: { label: "Changes requested", tone: "caution" },
  SUSPENDED: { label: "Suspended", tone: "critical" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

const VERIFICATION_STATUS: Record<HostVerificationStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Not submitted", tone: "neutral" },
  PENDING: { label: "Awaiting verification", tone: "progress" },
  VERIFIED: { label: "Verified", tone: "positive" },
  REJECTED: { label: "Changes requested", tone: "caution" },
};

function Badge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}

export function ExperienceStatusBadge({ status }: { status: ExperienceStatus }) {
  return <Badge {...EXPERIENCE_STATUS[status]} />;
}

export function VerificationStatusBadge({ status }: { status: HostVerificationStatus }) {
  return <Badge {...VERIFICATION_STATUS[status]} />;
}

/**
 * A thin completion rule.
 *
 * Deliberately not a large circular meter: the point is to tell a host how much
 * is left, not to make progress the loudest thing on the page. The numbers are
 * exposed to assistive technology through the text beside it rather than
 * through an ARIA widget, because that is what actually reads well here.
 */
export function ProgressRule({
  completed,
  total,
  label,
}: {
  readonly completed: number;
  readonly total: number;
  readonly label?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.round((Math.min(completed, safeTotal) / safeTotal) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        {label ? <span className="eyebrow">{label}</span> : <span />}
        <span className="text-[12px] tabular-nums text-text-muted">
          {completed} of {total} complete
        </span>
      </div>
      <div className="h-px w-full bg-line-strong" aria-hidden="true">
        <div
          className="h-px bg-gold transition-[width] duration-500 ease-[var(--ease-out-soft)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** A labelled figure for the dashboard summary strip. */
export function Metric({
  value,
  label,
  accent = false,
}: {
  readonly value: ReactNode;
  readonly label: string;
  readonly accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`font-display text-[26px] leading-none ${accent ? "text-gold-deep" : "text-text"}`}
      >
        {value}
      </span>
      <span className="eyebrow">{label}</span>
    </div>
  );
}
