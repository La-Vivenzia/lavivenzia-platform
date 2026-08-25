import type { Metadata } from "next";
import Link from "next/link";
import { HostPage } from "@/components/host/shell";
import { ExperienceRow } from "@/components/host/experience-row";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, SectionHeading } from "@/components/ui/feedback";
import { Metric, ProgressRule, VerificationStatusBadge } from "@/components/ui/status";
import { GoldRule } from "@/components/ui/wordmark";
import { loadHostSession } from "@/lib/host-page";
import { getExperienceService } from "@/lib/container";

export const metadata: Metadata = { title: "Overview" };

/**
 * The host overview (FR-13).
 *
 * Deliberately not a wall of statistic cards. A host arriving here wants three
 * answers — where does my verification stand, what is waiting on me, and what
 * am I working on — so the page gives those three in that order and stops.
 *
 * A server component: it reads through the service directly rather than calling
 * its own HTTP API, which saves a network round trip and keeps the data
 * fetching on the server where the session already lives.
 */
export default async function HostOverviewPage() {
  const { principal, profile } = await loadHostSession();

  const experiences = profile ? await getExperienceService().listOwn(principal, profile.host) : [];

  const drafts = experiences.filter((item) => item.status === "DRAFT").length;
  const inReview = experiences.filter((item) => item.status === "IN_REVIEW").length;
  const published = experiences.filter((item) => item.status === "PUBLISHED").length;

  return (
    <>
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <section className="bg-ink text-text-inverse relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(90% 120% at 100% 0%, rgba(201,168,76,0.14), transparent 60%)",
          }}
        />
        <div className="mx-auto w-full max-w-[1120px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <div className="flex flex-col gap-5">
            <span className="text-[10px] tracking-[0.24em] text-gold-light/80 uppercase">
              Host Console
            </span>
            <h1 className="font-display max-w-2xl text-[28px] leading-[1.25] sm:text-[34px]">
              {profile ? profile.host.displayName : "Welcome to La Vivenzia"}
            </h1>
            <GoldRule />
            <p className="max-w-xl text-[14px] leading-relaxed text-text-inverse-muted">
              {profile
                ? "Your listings, verification status and everything currently waiting on you."
                : "Start by telling us who you are. Your profile is what our team reviews before your experiences can go live."}
            </p>
          </div>
        </div>
      </section>

      <HostPage>
        <div className="flex flex-col gap-14">
          {/* ── Verification ────────────────────────────────────────── */}
          {profile ? (
            <section className="border-line bg-surface flex flex-col gap-6 border p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="eyebrow">Verification</span>
                  <div className="flex items-center gap-3">
                    <VerificationStatusBadge status={profile.host.verificationStatus} />
                  </div>
                </div>
                {profile.canEdit ? (
                  <ButtonLink href="/host/profile" size="sm">
                    {profile.assessment.isComplete ? "Review profile" : "Continue profile"}
                  </ButtonLink>
                ) : null}
              </div>

              {profile.host.verificationStatus === "DRAFT" ? (
                <ProgressRule
                  completed={profile.assessment.completed}
                  total={profile.assessment.total}
                  label="Profile"
                />
              ) : null}

              <p className="text-text-muted max-w-2xl text-[13px] leading-relaxed">
                {profile.host.verificationStatus === "VERIFIED"
                  ? "Your profile is verified. Experiences you submit go straight into the review queue."
                  : profile.host.verificationStatus === "PENDING"
                    ? "Our team is reviewing your profile. You can keep building experiences in the meantime — they will be ready to submit when verification completes."
                    : profile.host.verificationStatus === "REJECTED"
                      ? (profile.host.reviewNote ??
                        "We need a few changes before we can verify your profile.")
                      : "Complete your profile and submit it for verification. You can keep drafting experiences while you wait."}
              </p>
            </section>
          ) : (
            <EmptyState
              eyebrow="First step"
              title="Tell us about your work"
              description="Your host profile is what our team reviews, and what travellers read before they book. It takes a few minutes and saves as you go."
              action={
                <ButtonLink href="/host/profile" variant="primary" size="lg">
                  Start your profile
                </ButtonLink>
              }
            />
          )}

          {/* ── Figures ─────────────────────────────────────────────── */}
          {profile ? (
            <section className="border-line grid grid-cols-2 gap-8 border-y py-8 sm:grid-cols-4">
              <Metric value={experiences.length} label="Experiences" />
              <Metric value={drafts} label="In draft" />
              <Metric value={inReview} label="Awaiting review" accent={inReview > 0} />
              <Metric value={published} label="Published" />
            </section>
          ) : null}

          {/* ── Inventory ───────────────────────────────────────────── */}
          {profile ? (
            <section className="flex flex-col gap-6">
              <SectionHeading
                eyebrow="Inventory"
                title="Your experiences"
                description="Drafts save automatically as you work. Nothing is visible to travellers until our team has approved it."
                action={
                  experiences.length > 0 ? (
                    <ButtonLink href="/host/experiences" size="sm">
                      View all
                    </ButtonLink>
                  ) : null
                }
              />

              {experiences.length === 0 ? (
                <EmptyState
                  title="No experiences yet"
                  description="Start with a working title. You can shape the rest — photographs, price, location and the story — over as many sittings as you need."
                  action={
                    <ButtonLink href="/host/experiences" variant="primary">
                      Create an experience
                    </ButtonLink>
                  }
                />
              ) : (
                <div className="border-line bg-line flex flex-col gap-px border">
                  {experiences.slice(0, 4).map((experience) => (
                    <ExperienceRow key={experience.id} experience={experience} />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <p className="text-text-subtle text-[12px] leading-relaxed">
            Availability, bookings and payouts arrive in the next milestones.{" "}
            <Link href="/host/experiences" className="underline underline-offset-4">
              Build your inventory
            </Link>{" "}
            first — everything else depends on it.
          </p>
        </div>
      </HostPage>
    </>
  );
}
