import type { Metadata } from "next";
import Link from "next/link";
import { OpsPage } from "@/components/ops/shell";
import { SectionHeading } from "@/components/ui/feedback";
import { GoldRule } from "@/components/ui/wordmark";
import { requireOperator } from "@/lib/ops-page";
import { getOperationsService } from "@/lib/container";
import { formatRelativeTime } from "@/lib/format";
import { ReviewTimeline } from "@/components/ops/review-timeline";

export const metadata: Metadata = { title: "Operations" };

/**
 * The operations overview (FR-14).
 *
 * Answers one question — what needs attention right now — and then stops. The
 * two figures at the top are the only ones an operator can act on; the rest are
 * context, deliberately set smaller and lower. A row of equally-weighted
 * statistics would make the queue depth no more visible than the archive count.
 */
export default async function OpsOverviewPage() {
  const principal = await requireOperator();
  const { summary, recentActivity } = await getOperationsService().overview(principal);

  const waiting = summary.experiencesInReview + summary.hostsPending;

  return (
    <>
      <section className="bg-ink text-text-inverse relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(90% 120% at 100% 0%, rgba(201,168,76,0.12), transparent 60%)",
          }}
        />
        <div className="mx-auto w-full max-w-[1200px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <div className="flex flex-col gap-5">
            <span className="text-gold-light/80 text-[10px] tracking-[0.24em] uppercase">
              Operations
            </span>
            <h1 className="font-display max-w-2xl text-[28px] leading-[1.25] sm:text-[34px]">
              {waiting === 0
                ? "Nothing is waiting for review."
                : `${waiting} ${waiting === 1 ? "item is" : "items are"} waiting for review.`}
            </h1>
            <GoldRule />
            {summary.oldestSubmissionAt ? (
              <p className="text-text-inverse-muted max-w-xl text-[14px] leading-relaxed">
                The longest-waiting submission arrived{" "}
                <span className="text-text-inverse">
                  {formatRelativeTime(summary.oldestSubmissionAt)}
                </span>
                .
              </p>
            ) : (
              <p className="text-text-inverse-muted max-w-xl text-[14px] leading-relaxed">
                Submissions appear here as hosts send them in.
              </p>
            )}
          </div>
        </div>
      </section>

      <OpsPage>
        <div className="flex flex-col gap-14">
          {/* ── Actionable ────────────────────────────────────────────── */}
          <section className="grid gap-px sm:grid-cols-2">
            <QueueCard
              href="/ops/experiences?status=IN_REVIEW"
              label="Experiences awaiting review"
              count={summary.experiencesInReview}
              empty="No listings in the queue"
            />
            <QueueCard
              href="/ops/hosts?status=PENDING"
              label="Host applications awaiting verification"
              count={summary.hostsPending}
              empty="No applications in the queue"
            />
          </section>

          {/* ── Context ───────────────────────────────────────────────── */}
          <section className="flex flex-col gap-5">
            <span className="eyebrow">Inventory</span>
            <dl className="border-line grid grid-cols-3 gap-8 border-y py-6">
              <ContextFigure
                label="Published"
                value={summary.experiencesPublished}
                href="/ops/experiences?status=PUBLISHED"
              />
              <ContextFigure
                label="Changes requested"
                value={summary.experiencesRejected}
                href="/ops/experiences?status=REJECTED"
              />
              <ContextFigure
                label="Suspended"
                value={summary.experiencesSuspended}
                href="/ops/experiences?status=SUSPENDED"
              />
            </dl>
          </section>

          {/* ── Activity ──────────────────────────────────────────────── */}
          <section className="flex flex-col gap-6">
            <SectionHeading
              eyebrow="Recent decisions"
              title="Review activity"
              description="Every approval, rejection and suspension, with who made it."
            />
            <ReviewTimeline
              events={recentActivity}
              emptyMessage="No decisions have been made yet."
            />
          </section>
        </div>
      </OpsPage>
    </>
  );
}

/**
 * A queue with work in it.
 *
 * Given real visual weight when the count is non-zero and deliberately quiet
 * when it is not — an empty queue should recede rather than sit there as a
 * large zero demanding attention it does not deserve.
 */
function QueueCard({
  href,
  label,
  count,
  empty,
}: {
  readonly href: string;
  readonly label: string;
  readonly count: number;
  readonly empty: string;
}) {
  if (count === 0) {
    return (
      <div className="border-line bg-surface flex flex-col justify-between gap-4 border p-7">
        <span className="eyebrow">{label}</span>
        <p className="text-text-subtle text-[14px]">{empty}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="border-line bg-surface hover:shadow-panel group flex flex-col justify-between gap-6 border p-7 transition-shadow duration-300 ease-[var(--ease-out-soft)]"
    >
      <span className="eyebrow">{label}</span>
      <div className="flex items-end justify-between gap-4">
        <span className="font-display text-gold-deep text-[44px] leading-none tabular-nums">
          {count}
        </span>
        <span className="text-text-muted group-hover:text-gold-deep text-[12px] tracking-[0.12em] uppercase transition-colors">
          Review →
        </span>
      </div>
    </Link>
  );
}

function ContextFigure({
  label,
  value,
  href,
}: {
  readonly label: string;
  readonly value: number;
  readonly href: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dd className="font-display text-text text-[22px] leading-none tabular-nums">
        <Link href={href} className="hover:text-gold-deep transition-colors">
          {value}
        </Link>
      </dd>
      <dt className="eyebrow">{label}</dt>
    </div>
  );
}
