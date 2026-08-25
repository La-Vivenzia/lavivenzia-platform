import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPage } from "@/components/ops/shell";
import { DecisionPanel, type DecisionOption } from "@/components/ops/decision-panel";
import { ReviewTimeline } from "@/components/ops/review-timeline";
import { Alert, SectionHeading } from "@/components/ui/feedback";
import { ExperienceStatusBadge, VerificationStatusBadge } from "@/components/ui/status";
import { GoldRule } from "@/components/ui/wordmark";
import { requireOperator } from "@/lib/ops-page";
import { getOperationsService } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import {
  formatDuration,
  formatGuestRange,
  formatMoneyMinor,
  formatRelativeTime,
} from "@/lib/format";
import {
  experienceDecisionRequiresNote,
  type ExperienceDecision,
} from "@/modules/operations/review";
import type { ExperienceReviewView } from "@/modules/operations/service";

export const metadata: Metadata = { title: "Review experience" };

/**
 * Reviewing one listing (FR-07, FR-14).
 *
 * Everything needed to decide is on this page: the listing as a traveller would
 * read it, the host behind it, and the full history. A reviewer should never
 * need a second tab, and certainly never a database client.
 */

const DECISION_COPY: Readonly<
  Record<ExperienceDecision, { label: string; consequence: string; tone: "approve" | "reject" }>
> = {
  approve: {
    label: "Approve and publish",
    consequence: "The listing becomes visible to travellers. The host is notified that it is live.",
    tone: "approve",
  },
  reject: {
    label: "Request changes",
    consequence:
      "The listing returns to the host as editable. They see your reason and can resubmit.",
    tone: "reject",
  },
  suspend: {
    label: "Suspend",
    consequence:
      "The listing is withdrawn from travellers immediately. The host sees your reason and cannot republish it themselves.",
    tone: "reject",
  },
  reinstate: {
    label: "Reinstate",
    consequence: "The listing becomes visible to travellers again.",
    tone: "approve",
  },
};

export default async function ReviewExperiencePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const principal = await requireOperator();

  let view: ExperienceReviewView;
  try {
    view = await getOperationsService().getExperience(principal, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { detail, history, decisions } = view;
  const experience = detail.experience;
  const cover = experience.media[0];
  const gallery = experience.media.slice(1);

  const options: DecisionOption[] = decisions.map((decision) => ({
    value: decision,
    ...DECISION_COPY[decision],
    requiresNote: experienceDecisionRequiresNote(decision),
  }));

  return (
    <>
      <section className="bg-ink text-text-inverse">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
          <Link
            href="/ops/experiences"
            className="text-text-inverse-muted hover:text-gold-light text-[11px] tracking-[0.16em] uppercase transition-colors"
          >
            ← Review queue
          </Link>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <ExperienceStatusBadge status={experience.status} />
              {detail.categoryName ? (
                <span className="text-gold-light/80 text-[10px] tracking-[0.2em] uppercase">
                  {detail.categoryName}
                </span>
              ) : null}
            </div>
            <h1 className="font-display max-w-3xl text-[26px] leading-tight sm:text-[32px]">
              {experience.title}
            </h1>
            <GoldRule />
            <p className="text-text-inverse-muted text-[13px]">
              {experience.submittedAt
                ? `Submitted ${formatRelativeTime(experience.submittedAt)}`
                : "Not yet submitted"}
              {" · "}
              <Link
                href={`/ops/hosts/${detail.host.id}`}
                className="hover:text-gold-light underline underline-offset-4 transition-colors"
              >
                {detail.host.displayName}
              </Link>
            </p>
          </div>
        </div>
      </section>

      <OpsPage>
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-14">
          {/* ── The listing as a traveller would read it ─────────────── */}
          <div className="flex min-w-0 flex-col gap-10">
            {experience.status === "DRAFT" ? (
              <Alert tone="info" title="This is a draft">
                The host has not submitted it. You can read it, but there is nothing to decide until
                they do.
              </Alert>
            ) : null}

            <div className="bg-surface-sunken relative aspect-[16/9] w-full overflow-hidden">
              {cover ? (
                <Image
                  src={cover.url}
                  alt={cover.altText ?? ""}
                  fill
                  priority
                  sizes="(min-width: 1024px) 800px, 100vw"
                  className="object-cover"
                />
              ) : (
                <span className="text-text-subtle absolute inset-0 flex items-center justify-center text-[11px] tracking-[0.16em] uppercase">
                  No photographs
                </span>
              )}
            </div>

            {experience.summary ? (
              <p className="font-display text-text max-w-2xl text-[19px] leading-[1.6]">
                {experience.summary}
              </p>
            ) : null}

            <dl className="border-line grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-4">
              <Fact
                label="Price"
                value={formatMoneyMinor(experience.basePriceMinor, experience.currency) ?? "—"}
              />
              <Fact
                label="Charged"
                value={experience.pricingUnit === "PER_PERSON" ? "Per person" : "Per group"}
              />
              <Fact label="Duration" value={formatDuration(experience.durationMinutes) ?? "—"} />
              <Fact
                label="Guests"
                value={formatGuestRange(experience.minGuests, experience.maxGuests)}
              />
            </dl>

            {experience.description ? (
              <div className="max-w-2xl">
                <span className="eyebrow">Description</span>
                <p className="text-text mt-3 text-[15px] leading-[1.85] whitespace-pre-line">
                  {experience.description}
                </p>
              </div>
            ) : null}

            <section className="flex flex-col gap-3">
              <span className="eyebrow">Location</span>
              <p className="text-text text-[14px] leading-relaxed">
                {[
                  experience.addressLine,
                  experience.city,
                  experience.region,
                  experience.postalCode,
                  experience.country,
                ]
                  .filter(Boolean)
                  .join(", ") || "Not provided"}
              </p>
              {experience.latitude !== null && experience.longitude !== null ? (
                <p className="text-text-subtle text-[12px] tabular-nums">
                  {experience.latitude.toFixed(5)}, {experience.longitude.toFixed(5)}
                </p>
              ) : (
                <p className="text-text-subtle text-[12px]">No map coordinates provided.</p>
              )}
            </section>

            {experience.inclusions.length > 0 || experience.exclusions.length > 0 ? (
              <section className="border-line grid gap-8 border-t pt-8 sm:grid-cols-2">
                <List title="Included" items={experience.inclusions} />
                <List title="Not included" items={experience.exclusions} muted />
              </section>
            ) : null}

            {experience.guestNotes ? (
              <section className="border-line flex flex-col gap-3 border-t pt-8">
                <span className="eyebrow">Guest notes</span>
                <p className="text-text-muted max-w-2xl text-[14px] leading-relaxed whitespace-pre-line">
                  {experience.guestNotes}
                </p>
              </section>
            ) : null}

            {gallery.length > 0 ? (
              <section className="border-line flex flex-col gap-4 border-t pt-8">
                <span className="eyebrow">Gallery ({experience.media.length})</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((item) => (
                    <figure key={item.id} className="flex flex-col gap-1.5">
                      <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden">
                        <Image
                          src={item.url}
                          alt={item.altText ?? ""}
                          fill
                          sizes="(min-width: 640px) 240px, 50vw"
                          className="object-cover"
                        />
                      </div>
                      {/* Alt text is shown, not hidden: whether each image is
                          described is part of what is being reviewed. */}
                      <figcaption className="text-text-subtle truncate text-[11px]">
                        {item.altText ?? "No description"}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* ── Decision and context ────────────────────────────────── */}
          <aside className="flex flex-col gap-8 lg:sticky lg:top-10">
            <DecisionPanel
              endpoint={`/api/v1/ops/experiences/${experience.id}/review`}
              options={options}
              {...(options.length === 0
                ? {
                    disabledMessage:
                      experience.status === "DRAFT"
                        ? "Nothing to decide until the host submits this listing."
                        : `A ${experience.status.toLowerCase().replace("_", " ")} listing has no decision available.`,
                  }
                : {})}
            />

            <section className="border-line bg-surface flex flex-col gap-3 border p-6">
              <span className="eyebrow">Host</span>
              <Link
                href={`/ops/hosts/${detail.host.id}`}
                className="font-display text-text hover:text-gold-deep text-[16px] transition-colors"
              >
                {detail.host.displayName}
              </Link>
              <VerificationStatusBadge status={detail.host.verificationStatus} />
              <dl className="border-line mt-2 flex flex-col gap-2 border-t pt-3 text-[12px]">
                <Row label="Account" value={detail.hostAccountEmail} />
                {detail.host.contactEmail ? (
                  <Row label="Contact" value={detail.host.contactEmail} />
                ) : null}
                {detail.host.contactPhone ? (
                  <Row label="Phone" value={detail.host.contactPhone} />
                ) : null}
                <Row label="Based in" value={detail.host.city ?? "—"} />
              </dl>
            </section>

            {experience.reviewNote ? (
              <section className="border-line bg-surface flex flex-col gap-2 border p-6">
                <span className="eyebrow">Last decision</span>
                <p className="text-text-muted text-[13px] leading-relaxed">
                  {experience.reviewNote}
                </p>
                {detail.reviewer ? (
                  <p className="text-text-subtle text-[12px]">
                    {detail.reviewer.email}
                    {experience.reviewedAt ? ` · ${formatRelativeTime(experience.reviewedAt)}` : ""}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <SectionHeading eyebrow="History" title="Submission history" />
              <ReviewTimeline events={history} emptyMessage="No activity recorded." />
            </section>
          </aside>
        </div>
      </OpsPage>
    </>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dd className="font-display text-text text-[18px] leading-none">{value}</dd>
      <dt className="eyebrow">{label}</dt>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="text-text text-right break-all">{value}</dd>
    </div>
  );
}

function List({
  title,
  items,
  muted = false,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly muted?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow">{title}</span>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item}
            className={`flex items-baseline gap-3 text-[14px] ${muted ? "text-text-subtle" : "text-text-muted"}`}
          >
            <span
              aria-hidden="true"
              className={`mt-2 h-px w-3 shrink-0 ${muted ? "bg-line-strong" : "bg-gold"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
