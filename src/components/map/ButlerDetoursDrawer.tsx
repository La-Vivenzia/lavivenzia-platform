"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Crown, Mail, X } from "lucide-react";

import { Alert, Skeleton } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import type { CompanionNearbyResponse } from "@/modules/companion/ports";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly data: CompanionNearbyResponse };

type Send =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "sent" }
  | { readonly kind: "failed"; readonly message: string };

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

/**
 * "Butler Detours" — curated gems within easy reach of the act the traveller
 * is at, read from the live butler (`GET /api/v1/companion/nearby`), with the
 * option to have the same note sent to their inbox (`POST /companion/dispatch`).
 *
 * Every line is the companion service's: titles, perks, curator secrets and
 * distances are catalogue facts, and times are labelled estimates. Nothing
 * here states availability — each card links to the experience page, where
 * slots are live (CLAUDE.md §7).
 */
export function ButlerDetoursDrawer({
  activeSlug,
  actLabel,
  onClose,
}: {
  readonly activeSlug: string;
  /** "Act II · Main Course", for the heading. */
  readonly actLabel: string;
  readonly onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [send, setSend] = useState<Send>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CompanionNearbyResponse>(
        `/api/v1/companion/nearby?activeSlug=${encodeURIComponent(activeSlug)}`,
      )
      .then((data) => {
        if (!cancelled) setLoad({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({
            kind: "failed",
            message: messageOf(error, "The butler couldn’t be reached. Please try again."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug, attempt]);

  function retry() {
    setLoad({ kind: "loading" });
    setAttempt((n) => n + 1);
  }

  function sendToInbox() {
    setSend({ kind: "sending" });
    api
      .post("/api/v1/companion/dispatch", { activeSlug })
      .then(() => setSend({ kind: "sent" }))
      .catch((error: unknown) =>
        setSend({
          kind: "failed",
          message: messageOf(error, "The note wasn’t sent. Please try again."),
        }),
      );
  }

  const recommendations = load.kind === "ready" ? load.data.recommendations : [];

  return (
    <section
      aria-labelledby="butler-detours-title"
      className="flex max-h-[min(60vh,520px)] flex-col overflow-hidden rounded-card border border-accent/40 bg-panel text-panel-fg shadow-editorial"
    >
      <header className="flex items-start justify-between gap-3 border-b border-accent/25 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <p className="eyebrow text-[10px] text-accent">Butler Detours · Curated Nearby</p>
          <h3
            id="butler-detours-title"
            className="mt-1 font-display text-[17px] leading-snug text-panel-fg"
          >
            Around {actLabel}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close butler detours"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-panel-fg/25 text-panel-fg transition-colors duration-200 hover:bg-panel-fg/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3" aria-busy={load.kind === "loading"}>
        {load.kind === "loading" ? (
          <div className="flex flex-col gap-3" aria-label="Loading curated detours">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : load.kind === "failed" ? (
          <div className="flex flex-col gap-3">
            <Alert tone="danger" title="No detours just now">
              {load.message}
            </Alert>
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-10 items-center justify-center self-start rounded-pill border border-panel-fg/30 px-4 text-[12.5px] font-medium text-panel-fg transition-colors duration-200 hover:bg-panel-fg/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-panel-fg/90">{load.data.butlerNote}</p>
            {recommendations.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-panel-fg/75">
                Nothing we have curated is within easy reach of {load.data.zone} just yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {recommendations.map((recommendation) => (
                  <li
                    key={recommendation.slug}
                    className="rounded-card border border-accent/25 bg-panel-fg/5 px-3.5 py-3"
                  >
                    <p className="text-[10px] tracking-[0.16em] text-accent uppercase">
                      {recommendation.categoryName ?? recommendation.trackLabel}
                      <span className="tracking-normal normal-case text-panel-fg/75">
                        {" "}
                        · {recommendation.distanceOrTime}
                      </span>
                    </p>
                    <a
                      href={recommendation.experienceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group mt-1 inline-flex items-start gap-1 font-display text-[15px] leading-snug text-panel-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {recommendation.title}
                      <ArrowUpRight
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        strokeWidth={1.6}
                        aria-hidden="true"
                      />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-panel-fg/90">
                      <Crown
                        className="mt-0.5 h-3 w-3 shrink-0 text-accent"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      {recommendation.vipPerk}
                    </p>
                    <p className="mt-1.5 border-l-2 border-accent/60 pl-2.5 text-[12px] leading-relaxed font-light text-panel-fg/80 italic">
                      {recommendation.curatorSecret}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {load.kind === "ready" && recommendations.length > 0 ? (
        <footer className="flex flex-col gap-2 border-t border-accent/25 px-4 py-3">
          {send.kind === "failed" ? <Alert tone="danger">{send.message}</Alert> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] leading-snug text-panel-fg/75" role="status">
              {send.kind === "sent"
                ? "Sent to your inbox."
                : "Times are estimates; tables are confirmed on each page."}
            </p>
            <button
              type="button"
              onClick={sendToInbox}
              disabled={send.kind === "sending" || send.kind === "sent"}
              aria-busy={send.kind === "sending" || undefined}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-accent px-4 text-[12.5px] font-medium text-accent-fg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {send.kind === "sending" ? "Sending…" : send.kind === "sent" ? "Sent" : "Send to me"}
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
