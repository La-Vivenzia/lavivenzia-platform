import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPage } from "@/components/ops/shell";
import { DecisionPanel, type DecisionOption } from "@/components/ops/decision-panel";
import { ReviewTimeline } from "@/components/ops/review-timeline";
import { Alert, SectionHeading } from "@/components/ui/feedback";
import { VerificationStatusBadge } from "@/components/ui/status";
import { GoldRule } from "@/components/ui/wordmark";
import { requireOperator } from "@/lib/ops-page";
import { getOperationsService } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import { assessHostProfile } from "@/modules/hosts/profile";
import { hostDecisionRequiresNote, type HostDecision } from "@/modules/operations/review";
import type { HostReviewView } from "@/modules/operations/service";
import { EXPERIENCE_STATUSES } from "@/modules/experiences/lifecycle";

export const metadata: Metadata = { title: "Review host" };

/**
 * Reviewing one host application (FR-05, FR-14).
 *
 * Shows what the host actually submitted, plus the same completeness assessment
 * the host saw — so a reviewer can tell "they left this blank" apart from "we
 * never asked for it". No identity documents appear here because none are
 * collected: that decision is deferred (A-011) and inventing a KYC surface
 * would imply data the platform does not hold.
 */

const DECISION_COPY: Readonly<
  Record<HostDecision, { label: string; consequence: string; tone: "approve" | "reject" }>
> = {
  verify: {
    label: "Verify host",
    consequence:
      "The host is marked verified. Their listings can be approved and go on to travellers.",
    tone: "approve",
  },
  reject: {
    label: "Request changes",
    consequence:
      "The profile returns to the host as editable. They see your reason and can resubmit.",
    tone: "reject",
  },
};

export default async function ReviewHostPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const principal = await requireOperator();

  let view: HostReviewView;
  try {
    view = await getOperationsService().getHost(principal, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { detail, history, decisions } = view;
  const host = detail.host;
  const assessment = assessHostProfile(host);

  const options: DecisionOption[] = decisions.map((decision) => ({
    value: decision,
    ...DECISION_COPY[decision],
    requiresNote: hostDecisionRequiresNote(decision),
  }));

  const listed = EXPERIENCE_STATUSES.map((status) => ({
    status,
    count: detail.experienceCounts[status] ?? 0,
  })).filter((entry) => entry.count > 0);

  return (
    <>
      <section className="bg-ink text-text-inverse">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
          <Link
            href="/ops/hosts"
            className="text-text-inverse-muted hover:text-gold-light text-[11px] tracking-[0.16em] uppercase transition-colors"
          >
            ← Hosts
          </Link>

          <div className="mt-6 flex flex-col gap-4">
            <VerificationStatusBadge status={host.verificationStatus} />
            <h1 className="font-display max-w-3xl text-[26px] leading-tight sm:text-[32px]">
              {host.displayName}
            </h1>
            <GoldRule />
            <p className="text-text-inverse-muted text-[13px]">
              {host.hostType === "COMPANY" ? "Registered business" : "Individual"}
              {host.submittedAt ? ` · Applied ${formatRelativeTime(host.submittedAt)}` : ""}
            </p>
          </div>
        </div>
      </section>

      <OpsPage>
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-14">
          <div className="flex min-w-0 flex-col gap-10">
            {host.verificationStatus === "DRAFT" ? (
              <Alert tone="info" title="Not submitted">
                This host has started a profile but has not submitted it for verification.
              </Alert>
            ) : null}

            {!assessment.isComplete ? (
              <Alert tone="warning" title="Profile is incomplete">
                Missing: {assessment.missing.map((entry) => entry.label).join(", ")}. The host
                cannot submit until these are filled in, so this profile predates the current
                requirements or was submitted before they applied.
              </Alert>
            ) : null}

            {host.headline ? (
              <p className="font-display text-text max-w-2xl text-[19px] leading-[1.6]">
                {host.headline}
              </p>
            ) : null}

            {host.about ? (
              <div className="max-w-2xl">
                <span className="eyebrow">About</span>
                <p className="text-text mt-3 text-[15px] leading-[1.85] whitespace-pre-line">
                  {host.about}
                </p>
              </div>
            ) : (
              <p className="text-text-subtle text-[14px] italic">No description written.</p>
            )}

            <section className="border-line flex flex-col gap-4 border-t pt-8">
              <span className="eyebrow">Business details</span>
              <dl className="grid gap-x-8 gap-y-3 text-[14px] sm:grid-cols-2">
                <Row label="Display name" value={host.displayName} />
                <Row
                  label="Registered legal name"
                  value={host.legalName ?? (host.hostType === "COMPANY" ? "Not provided" : "—")}
                />
                <Row label="Account email" value={detail.accountEmail} />
                <Row label="Contact email" value={host.contactEmail ?? "Not provided"} />
                <Row label="Contact phone" value={host.contactPhone ?? "Not provided"} />
                <Row label="Website" value={host.websiteUrl ?? "—"} />
                <Row
                  label="Based in"
                  value={[host.city, host.region, host.country].filter(Boolean).join(", ") || "—"}
                />
                <Row label="Joined" value={formatRelativeTime(host.createdAt)} />
              </dl>
            </section>

            <section className="border-line flex flex-col gap-4 border-t pt-8">
              <span className="eyebrow">Listings</span>
              {listed.length === 0 ? (
                <p className="text-text-subtle text-[13px]">This host has no experiences yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-x-8 gap-y-3">
                  {listed.map((entry) => (
                    <li key={entry.status} className="flex flex-col gap-0.5">
                      <Link
                        href={`/ops/experiences?hostId=${host.id}&status=${entry.status}`}
                        className="font-display text-text hover:text-gold-deep text-[18px] tabular-nums transition-colors"
                      >
                        {entry.count}
                      </Link>
                      <span className="eyebrow">
                        {entry.status.toLowerCase().replace("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-10">
            <DecisionPanel
              endpoint={`/api/v1/ops/hosts/${host.id}/review`}
              options={options}
              {...(options.length === 0
                ? {
                    disabledMessage:
                      host.verificationStatus === "DRAFT"
                        ? "Nothing to decide until the host submits their profile."
                        : host.verificationStatus === "VERIFIED"
                          ? "This host is verified. Reversing that is not available in the console yet."
                          : "The host has this profile back for changes. It returns here when they resubmit.",
                  }
                : {})}
            />

            {host.reviewNote ? (
              <section className="border-line bg-surface flex flex-col gap-2 border p-6">
                <span className="eyebrow">Last decision</span>
                <p className="text-text-muted text-[13px] leading-relaxed">{host.reviewNote}</p>
                {detail.reviewer ? (
                  <p className="text-text-subtle text-[12px]">
                    {detail.reviewer.email}
                    {host.reviewedAt ? ` · ${formatRelativeTime(host.reviewedAt)}` : ""}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <SectionHeading eyebrow="History" title="Application history" />
              <ReviewTimeline events={history} emptyMessage="No activity recorded." />
            </section>
          </aside>
        </div>
      </OpsPage>
    </>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="border-line flex flex-col gap-0.5 border-b pb-2">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-text break-all">{value}</dd>
    </div>
  );
}
