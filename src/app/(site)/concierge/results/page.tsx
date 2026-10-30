import type { Metadata } from "next";
import { RotateCcw } from "lucide-react";

import { ConciergeMatchCard } from "@/components/concierge/ConciergeMatchCard";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { requestFromQuery } from "@/modules/concierge/conversation";
import { cravingDisplay } from "@/modules/concierge/options";
import { findVibeMatches, type ConciergeResult } from "@/modules/concierge/service";

export const metadata: Metadata = {
  title: "Your concierge picks",
  description: "Spots that fit where you are, what you're craving, your party and your budget.",
  // One traveller's answers, not a page anyone should land on from a search engine.
  robots: { index: false },
};

/**
 * The concierge's results — what the conversation at `/concierge` was for.
 *
 * Everything is in the URL and re-derived here on the server, through the same
 * parser the conversation used to build it, so the page is shareable, survives
 * a reload, and cannot show anything the conversation did not ask for. Prices
 * are the booking quote for the party; distances are measured from the
 * listing's stored coordinates (CLAUDE.md §7).
 */
export default async function ConciergeResultsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const request = requestFromQuery(params);

  if (!request) {
    return (
      <PageBody>
        {/* Width on an inner element: `cn` concatenates, so a max-width passed to
            PageBody would race its own rather than replace it. */}
        <div className="mx-auto w-full max-w-3xl">
          <EmptyState
            eyebrow="Concierge"
            title="Tell us what you're after first"
            description="Answer three quick questions — where you are, what you're craving, and who's with you — and your picks will appear here."
            action={
              <ButtonLink href="/concierge" variant="primary">
                Ask the Concierge
              </ButtonLink>
            }
          />
        </div>
      </PageBody>
    );
  }

  const result = findVibeMatches(request);
  const craving = cravingDisplay(request.craving);
  const party = result.party.size === 1 ? "Just you" : `${result.party.size} people`;

  return (
    <PageBody>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <PageHeader
          eyebrow="Your concierge picks"
          title={`${craving.charAt(0).toUpperCase()}${craving.slice(1)} near ${result.location.label}`}
          action={
            <ButtonLink href="/concierge" variant="secondary">
              <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Change answers
            </ButtonLink>
          }
        />

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
          <Answer term="Where" value={result.location.label} />
          <Answer term="Craving" value={craving} />
          <Answer term="Party" value={party} />
          <Answer term="Budget" value={result.budget.label} />
        </dl>

        {result.location.notice ? <Alert tone="info">{result.location.notice}</Alert> : null}

        {result.matches.length === 0 ? (
          <NoMatch result={result} craving={craving} params={params} />
        ) : (
          <section aria-labelledby="concierge-picks" className="flex flex-col gap-4">
            <h2
              id="concierge-picks"
              className="text-[11px] tracking-[0.16em] text-fg-subtle uppercase"
            >
              {result.matches.length === 1 ? "1 pick" : `${result.matches.length} picks`} that fit
            </h2>
            <ol className="flex flex-col gap-4">
              {result.matches.map((match, index) => (
                <ConciergeMatchCard
                  key={match.slug}
                  match={match}
                  top={index === 0}
                  partySize={result.party.size}
                />
              ))}
            </ol>
            <p className="text-[12px] leading-relaxed text-fg-muted">
              Distances are straight-line estimates from {result.location.label}; walking times
              assume an easy pace. Prices are the full booking price for your party.
            </p>
          </section>
        )}
      </div>
    </PageBody>
  );
}

function Answer({ term, value }: { readonly term: string; readonly value: string }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <dt className="eyebrow text-[10px] text-fg-subtle">{term}</dt>
      <dd className="mt-1 truncate text-[14px] text-heading">{value}</dd>
    </div>
  );
}

/**
 * Nothing fitted. When something was excluded only on price, say exactly what
 * it costs and offer that number — a real catalogue price, not a guess at what
 * might fit.
 */
function NoMatch({
  result,
  craving,
  params,
}: {
  readonly result: ConciergeResult;
  readonly craving: string;
  readonly params: Record<string, string | string[] | undefined>;
}) {
  const { stretch } = result;

  if (stretch && result.budget.cap) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const text = Array.isArray(value) ? value[0] : value;
      if (text !== undefined) next.set(key, text);
    }
    next.set("budget", String(Math.ceil(stretch.amountMinor / 100)));

    return (
      <EmptyState
        eyebrow="Nothing within budget"
        title={`Nothing for ${craving.toLowerCase()} fits ${result.budget.label}`}
        description={`The closest is ${stretch.title}, at ${stretch.label}.`}
        action={
          <ButtonLink href={`/concierge/results?${next.toString()}`} variant="primary">
            Show options up to {stretch.label}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <EmptyState
      eyebrow="No match yet"
      title={`Nothing for ${craving.toLowerCase()} near ${result.location.label}`}
      description="Our East Pune pilot is still growing. Try a different craving, or a smaller party — some venues cap their tables."
      action={
        <ButtonLink href="/concierge" variant="primary">
          Try another craving
        </ButtonLink>
      }
    />
  );
}
