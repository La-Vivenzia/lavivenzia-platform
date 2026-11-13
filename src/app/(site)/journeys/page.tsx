import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, ShieldCheck, Sparkles } from "lucide-react";

import { PageBody, PageHeader } from "@/components/PageHeader";
import { formatClock, formatMoneyMinor } from "@/lib/format";
import { listCuratedJourneys } from "@/modules/journeys/data";

export const metadata: Metadata = {
  title: "Signature Journeys — Choreographed Evenings in Pune",
  description:
    "Curated multi-venue evening progressions across Amanora, Seasons, and Magarpatta. Reserved in one pass with exclusive VIP privileges.",
};

const NUMERALS = ["I", "II", "III"] as const;

export default function JourneysIndexPage() {
  const journeys = listCuratedJourneys();

  return (
    <PageBody>
      <div className="flex flex-col gap-10">
        <PageHeader
          eyebrow="Curated Progressions"
          title="Signature Journeys"
          description="Two and three-venue sequences across Amanora, Seasons, and Magarpatta. One reservation, exclusive privileges at every stop, and live companion routing."
        />

        {/* VivenIQ Custom Arc Callout */}
        <div className="rounded-card border border-accent/30 bg-surface/80 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-card">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
              <Sparkles className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="font-display text-xl text-heading">Want a Personalized Evening?</h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted font-light max-w-2xl">
                Tell VivenIQ what you are celebrating, your culinary taste, or who you are with.
                Our AI concierge will choreograph a bespoke multi-stop evening with verified host privileges in seconds.
              </p>
            </div>
          </div>
          <Link
            href="/viveniq"
            className="shrink-0 inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-6 text-[13.5px] font-medium text-accent-fg shadow-card transition-transform hover:-translate-y-px hover:bg-accent-ink"
          >
            Curate with VivenIQ
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Journeys List */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {journeys.map((journey) => (
            <article
              key={journey.id}
              className="group flex flex-col justify-between rounded-card border border-line bg-surface p-7 shadow-card transition-all duration-300 hover:border-line-strong hover:shadow-raised"
            >
              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="eyebrow inline-flex items-center gap-1.5 text-[11px] font-medium text-accent uppercase tracking-wider">
                    <Compass className="h-3.5 w-3.5" />
                    {journey.mood} Mood
                  </span>
                  <span className="text-[14px] font-medium text-heading">
                    {formatMoneyMinor(journey.totalPriceMinor, journey.currency)}
                    <span className="text-xs text-fg-muted font-light"> / guest</span>
                  </span>
                </div>

                <h3 className="mt-3 font-display text-2xl text-heading group-hover:text-accent transition-colors">
                  <Link href={`/journeys/${journey.id}`}>
                    {journey.title}
                  </Link>
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted font-light">
                  {journey.tagline}
                </p>

                {/* Chapters Timeline */}
                <div className="mt-6 space-y-3 rounded-xl border border-line/70 bg-surface-2/40 p-4">
                  {journey.chapters.map((chapter, idx) => (
                    <div key={chapter.role} className="flex items-start gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-medium text-accent">
                        {NUMERALS[idx]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-heading">
                            {chapter.experienceTitle}
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            {formatClock(chapter.startMinute)}
                          </span>
                        </div>
                        <p className="text-[12px] text-accent font-light">
                          ★ {chapter.privilege.title}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-7 flex items-center justify-between gap-4 border-t border-line pt-5">
                <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted font-light">
                  <ShieldCheck className="h-4 w-4 text-accent" /> Single VIP Pass
                </span>
                <Link
                  href={`/journeys/${journey.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent transition-colors hover:text-accent-ink"
                >
                  View Journey Arc & Map →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </PageBody>
  );
}
