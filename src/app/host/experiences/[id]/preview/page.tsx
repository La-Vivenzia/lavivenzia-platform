import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHostProfile } from "@/lib/host-page";
import { getExperienceService } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { createCategoryRepository } from "@/adapters/persistence/prisma/experience-repositories";
import { Alert } from "@/components/ui/feedback";
import { GoldRule, Wordmark } from "@/components/ui/wordmark";
import { formatDuration, formatGuestRange, formatMoneyMinor } from "@/lib/format";

export const metadata: Metadata = { title: "Preview" };

/**
 * Traveller-facing preview of a listing.
 *
 * This is the one place in the host console that is genuinely dark and
 * cinematic, because it is standing in for the traveller experience rather than
 * being a working surface — DESIGN.md §15 in miniature. A host should be able
 * to see exactly what their listing will look like before anyone else does.
 *
 * It reads through the same ownership-scoped service as the editor, so a
 * preview cannot be used to view a listing the caller does not own.
 */
export default async function PreviewPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const { principal, host } = await requireHostProfile();

  let view;
  try {
    view = await getExperienceService().getOwn(principal, host, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const experience = view.experience;
  const categories = await createCategoryRepository(prisma).listActive();
  const category = categories.find((entry) => entry.id === experience.categoryId);

  const cover = experience.media[0];
  const gallery = experience.media.slice(1);
  const price = formatMoneyMinor(experience.basePriceMinor, experience.currency);
  const duration = formatDuration(experience.durationMinutes);

  return (
    <div className="bg-ink text-text-inverse min-h-dvh">
      {/* Unmistakably a preview, so it is never confused with the live page. */}
      <div className="border-line-inverse bg-ink/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <span className="text-gold-light text-[10px] tracking-[0.2em] uppercase">
            Preview · not visible to travellers
          </span>
          <Link
            href={`/host/experiences/${experience.id}`}
            className="text-text-inverse-muted hover:text-gold-light text-[11px] tracking-[0.14em] uppercase transition-colors"
          >
            Back to editor
          </Link>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <header className="relative isolate">
        <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[21/9]">
          {cover ? (
            <Image
              src={cover.url}
              alt={cover.altText ?? ""}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="bg-charcoal absolute inset-0" />
          )}
          {/* Scrim, so the display type stays legible over any photograph. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(23,20,15,0.94) 0%, rgba(23,20,15,0.45) 45%, rgba(23,20,15,0.15) 100%)",
            }}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[1120px] px-6 pb-10 sm:px-10 sm:pb-14">
            <div className="flex flex-col gap-4">
              {category ? (
                <span className="text-gold-light text-[10px] tracking-[0.24em] uppercase">
                  {category.name}
                </span>
              ) : null}
              <h1 className="font-display max-w-3xl text-[28px] leading-[1.2] sm:text-[42px]">
                {experience.title}
              </h1>
              {experience.city ? (
                <p className="text-text-inverse-muted text-[13px] tracking-[0.12em] uppercase">
                  {[experience.city, experience.region].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] px-6 py-12 sm:px-10 lg:py-16">
        {!view.readiness.isReady ? (
          <div className="mb-12">
            <Alert tone="warning" title="This is an incomplete draft">
              {view.readiness.issues.length} item
              {view.readiness.issues.length === 1 ? " is" : "s are"} still missing, so the preview
              shows gaps a traveller would see.
            </Alert>
          </div>
        ) : null}

        <div className="flex flex-col gap-14 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-20">
          <div className="flex min-w-0 flex-col gap-12">
            {experience.summary ? (
              <p className="font-display max-w-2xl text-[19px] leading-[1.6] sm:text-[22px]">
                {experience.summary}
              </p>
            ) : null}

            <GoldRule />

            {experience.description ? (
              <div className="max-w-2xl">
                <p className="text-text-inverse/85 text-[15px] leading-[1.85] whitespace-pre-line">
                  {experience.description}
                </p>
              </div>
            ) : (
              <p className="text-text-inverse-muted text-[14px] italic">
                No description written yet.
              </p>
            )}

            {experience.inclusions.length > 0 || experience.exclusions.length > 0 ? (
              <section className="border-line-inverse grid gap-10 border-t pt-10 sm:grid-cols-2">
                {experience.inclusions.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <span className="text-gold-light text-[10px] tracking-[0.2em] uppercase">
                      Included
                    </span>
                    <ul className="flex flex-col gap-2.5">
                      {experience.inclusions.map((item) => (
                        <li
                          key={item}
                          className="text-text-inverse/85 flex items-baseline gap-3 text-[14px]"
                        >
                          <span
                            aria-hidden="true"
                            className="bg-gold-light mt-2 h-px w-3 shrink-0"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {experience.exclusions.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <span className="text-text-inverse-muted text-[10px] tracking-[0.2em] uppercase">
                      Not included
                    </span>
                    <ul className="flex flex-col gap-2.5">
                      {experience.exclusions.map((item) => (
                        <li
                          key={item}
                          className="text-text-inverse-muted flex items-baseline gap-3 text-[14px]"
                        >
                          <span
                            aria-hidden="true"
                            className="bg-text-inverse-muted/50 mt-2 h-px w-3 shrink-0"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {experience.guestNotes ? (
              <section className="border-line-inverse flex flex-col gap-4 border-t pt-10">
                <span className="text-gold-light text-[10px] tracking-[0.2em] uppercase">
                  Good to know
                </span>
                <p className="text-text-inverse/80 max-w-2xl text-[14px] leading-relaxed whitespace-pre-line">
                  {experience.guestNotes}
                </p>
              </section>
            ) : null}

            {gallery.length > 0 ? (
              <section className="border-line-inverse flex flex-col gap-6 border-t pt-10">
                <span className="text-gold-light text-[10px] tracking-[0.2em] uppercase">
                  Gallery
                </span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((item) => (
                    <div
                      key={item.id}
                      className="bg-charcoal relative aspect-[4/3] overflow-hidden"
                    >
                      <Image
                        src={item.url}
                        alt={item.altText ?? ""}
                        fill
                        sizes="(min-width: 640px) 33vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* ── Booking panel ─────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24">
            <div className="border-line-inverse flex flex-col gap-6 border p-7">
              <div className="flex flex-col gap-1">
                <span className="text-text-inverse-muted text-[10px] tracking-[0.2em] uppercase">
                  From
                </span>
                <span className="font-display text-[30px] leading-none">{price ?? "—"}</span>
                <span className="text-text-inverse-muted text-[12px]">
                  {experience.pricingUnit === "PER_PERSON" ? "per person" : "per group"}
                </span>
              </div>

              <dl className="border-line-inverse flex flex-col gap-3 border-t pt-5 text-[13px]">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-text-inverse-muted">Duration</dt>
                  <dd>{duration ?? "—"}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-text-inverse-muted">Guests</dt>
                  <dd>{formatGuestRange(experience.minGuests, experience.maxGuests)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-text-inverse-muted">Hosted by</dt>
                  <dd className="text-right">{host.displayName}</dd>
                </div>
              </dl>

              {/*
               * Inert on purpose. Booking is a later milestone, and a button
               * that looks live but does nothing is worse in a preview than one
               * that says what it is.
               */}
              <div
                aria-disabled="true"
                className="border-line-inverse text-text-inverse-muted cursor-not-allowed border px-5 py-3 text-center text-[11px] tracking-[0.14em] uppercase"
              >
                Booking opens later
              </div>

              <p className="text-text-inverse-muted/70 text-[11px] leading-relaxed">
                Cancellation terms and taxes are shown at checkout once those are finalised.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <footer className="border-line-inverse mt-8 border-t">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-10 sm:px-10">
          <Wordmark size="sm" tone="gold" />
        </div>
      </footer>
    </div>
  );
}
