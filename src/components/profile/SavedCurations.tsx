"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookmarkCheck, Clock, Navigation, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import { getSavedCurations, type SavedCurationSummary } from "@/lib/saved-curations";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly curations: readonly SavedCurationSummary[] };

async function fetchCurations(): Promise<LoadState> {
  getSavedCurations();
  try {
    const { curations } = await api.get<{ readonly curations: SavedCurationSummary[] }>(
      "/api/v1/user/curations",
    );
    return { kind: "ready", curations };
  } catch (error: unknown) {
    return {
      kind: "failed",
      message: error instanceof ApiError ? error.message : "Your curations could not be loaded.",
    };
  }
}

/**
 * The "My Curations" tab: every journey saved on this device, each one a
 * direct way back into the evening with the companion map open.
 *
 * Read from `GET /api/v1/user/curations`, which resolves the saved ids against
 * the catalogue. `getSavedCurations()` runs first so the cookie the server
 * reads is re-synced from localStorage if it was cleared.
 */
export function SavedCurations() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void fetchCurations().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [attempt]);

  if (state.kind === "loading") {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2" aria-busy="true">
        <p className="sr-only" role="status">
          Loading your curations…
        </p>
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <Alert tone="danger" title="Your curations could not be loaded">
        {state.message}{" "}
        <button
          type="button"
          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={() => {
            setState({ kind: "loading" });
            setAttempt((count) => count + 1);
          }}
        >
          Try again
        </button>
      </Alert>
    );
  }

  if (state.curations.length === 0) {
    return (
      <EmptyState
        eyebrow="My Curations"
        title="Your first evening is waiting to be chosen"
        description="Save a signature journey and it lives here, its itinerary in your inbox and the companion ready the moment you set out."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/journeys" variant="primary">
              Explore Curations
            </ButtonLink>
            <ButtonLink href="/viveniq" variant="secondary">
              <Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Ask VivenIQ
            </ButtonLink>
          </div>
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {state.curations.map((curation) => (
        <CurationCard key={curation.id} curation={curation} />
      ))}
    </ul>
  );
}

function CurationCard({ curation }: { readonly curation: SavedCurationSummary }) {
  const acts = curation.actCount === 2 ? "Two acts" : "Three acts";
  const href = `/journeys/${encodeURIComponent(curation.id)}`;

  return (
    <li>
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 transition-colors duration-200 hover:border-gold/50">
        <div className="relative aspect-[16/9] bg-surface-2">
          <Image
            src={curation.coverImage}
            alt={curation.coverAlt}
            fill
            sizes="(min-width: 640px) 420px, 100vw"
            className="object-cover"
          />
          {/* Fixed translucent treatment over photography, as JourneyRail. */}
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-pill bg-black/35 px-3 py-1 text-[11px] font-medium tracking-wide text-white ring-1 ring-white/25 backdrop-blur-[6px] ring-inset">
            <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            Saved
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-6">
          <p className="eyebrow text-[10px] text-gold">
            {curation.mood} · {acts}
          </p>
          <h3 className="font-display text-lg leading-snug text-text">
            <Link href={href} className="transition-colors hover:text-gold">
              {curation.title}
            </Link>
          </h3>
          <p className="text-[13px] leading-relaxed font-light text-text-subtle">
            {curation.tagline}
          </p>
          <p className="inline-flex items-center gap-1.5 text-[12px] text-text-muted tabular-nums">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
            {formatDuration(curation.totalDurationMinutes)}
          </p>

          <div className="mt-auto pt-3">
            <ButtonLink href={`${href}?map=1`} variant="primary" className="w-full">
              <Navigation className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Start My Journey
            </ButtonLink>
          </div>
        </div>
      </article>
    </li>
  );
}
