import type { Metadata } from "next";

import { ConciergeChat } from "@/components/concierge/ConciergeChat";
import { PageBody, PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Ask the Concierge",
  description:
    "Three quick questions — where you are, what you're craving, who's with you — and the spots that fit, at real prices.",
};

/**
 * The concierge conversation. `?ask=` carries whatever was typed into the home
 * page's chat bar, which the conversation takes as the craving and does not
 * ask for again.
 */
export default async function ConciergePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ask = Array.isArray(params.ask) ? params.ask[0] : params.ask;

  return (
    <PageBody>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <PageHeader
          eyebrow="Concierge"
          title="Where should we go right now?"
          description="Three quick questions, then the spots that fit — with real prices for your party and real walking distances."
        />
        {/* Keyed on the seed so a fresh `?ask=` starts a fresh conversation. */}
        <ConciergeChat key={ask ?? ""} {...(ask?.trim() ? { initialCraving: ask } : {})} />
      </div>
    </PageBody>
  );
}
