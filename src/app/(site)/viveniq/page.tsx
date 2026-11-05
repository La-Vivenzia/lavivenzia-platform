import type { Metadata } from "next";

import { PageBody } from "@/components/PageHeader";
import { VivenIQChat } from "@/components/viveniq/VivenIQChat";

export const metadata: Metadata = {
  title: "VivenIQ — Curated Conversational Intelligence",
  description: "Describe the moment. We’ll curate the rest.",
};

/**
 * VivenIQ. `?q=` carries what was typed into the site search bar and `?ask=`
 * what was typed into the home page's chat bar; either opens the conversation
 * with that as the first message.
 */
export default async function VivenIQPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string): string => {
    const value = params[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const q = read("q") || read("ask");

  return (
    <PageBody>
      {/* Keyed on the query so a fresh `?q=` starts a fresh conversation. */}
      <VivenIQChat key={q} {...(q ? { initialQuery: q } : {})} />
    </PageBody>
  );
}
