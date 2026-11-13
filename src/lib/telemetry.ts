import type { CurationTrack } from "@/modules/discovery/curation";
import type { TelemetryEvent } from "@/modules/taste-genome/types";

/**
 * Client telemetry bus for the Taste Genome.
 *
 * Events queue in memory and leave in batches — on a timer, when the queue is
 * full, and with `sendBeacon` when the page is hidden, so the last few seconds
 * of browsing survive a tab close. Telemetry is best-effort: a failed send is
 * dropped, never retried into a loop, and never surfaces to the patron.
 *
 * No `"use client"` directive: this exports plain functions, which must not
 * cross the RSC boundary (tests/unit/client-boundary.test.ts). Every entry
 * point is a no-op outside a browser, so a server import is harmless.
 */

const ENDPOINT = "/api/v1/taste-genome/telemetry";
const FLUSH_INTERVAL_MS = 5_000;
/** Matches MAX_TELEMETRY_BATCH on the server. */
const MAX_BATCH = 50;
/** Visible for at least half its area before a view counts. */
const VIEW_THRESHOLD = 0.5;
const MAX_QUERY_LENGTH = 120;

type NewEvent = Omit<TelemetryEvent, "timestamp"> & { readonly timestamp?: string };

const queue: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function send(events: TelemetryEvent[], useBeacon: boolean): void {
  const body = JSON.stringify({ events });

  // A string body goes as text/plain, which needs no preflight; the route parses it as JSON.
  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    if (navigator.sendBeacon(ENDPOINT, body)) return;
  }

  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

function flush(useBeacon = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length > 0) send(queue.splice(0, MAX_BATCH), useBeacon);
}

function listenForPageHide(): void {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

export function trackEvent(event: NewEvent): void {
  if (!inBrowser()) return;
  listenForPageHide();

  queue.push({ ...event, timestamp: event.timestamp ?? new Date().toISOString() });

  if (queue.length >= MAX_BATCH) flush();
  else timer ??= setTimeout(() => flush(), FLUSH_INTERVAL_MS);
}

export function trackSearch(query: string, track?: CurationTrack): void {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return;
  trackEvent({ type: "search_query", query: trimmed, ...(track ? { track } : {}) });
}

/**
 * Watch an experience card: one `card_view` when it first becomes visible, a
 * `card_dwell` with the seconds it stayed visible each time it leaves, and a
 * `card_click` on click. The server ignores dwells of five seconds or less.
 *
 * Returns a cleanup function; call it when the card unmounts.
 */
export function observeExperienceCard(
  element: Element,
  experienceId: string,
  track?: CurationTrack,
): () => void {
  if (!inBrowser()) return () => undefined;

  const base = { experienceId, ...(track ? { track } : {}) };
  let viewed = false;
  let intersecting = false;
  let visibleSince: number | null = null;

  const endDwell = () => {
    if (visibleSince === null) return;
    const dwellSeconds = Math.round((performance.now() - visibleSince) / 100) / 10;
    visibleSince = null;
    if (dwellSeconds > 0) trackEvent({ type: "card_dwell", ...base, dwellSeconds });
  };

  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              intersecting = entry.isIntersecting && entry.intersectionRatio >= VIEW_THRESHOLD;
              if (intersecting) {
                if (!viewed) {
                  viewed = true;
                  trackEvent({ type: "card_view", ...base });
                }
                visibleSince ??= performance.now();
              } else {
                endDwell();
              }
            }
          },
          { threshold: [0, VIEW_THRESHOLD] },
        )
      : null;
  observer?.observe(element);

  const onClick = () => trackEvent({ type: "card_click", ...base });
  element.addEventListener("click", onClick);

  // A hidden tab is not dwelling. The observer does not re-fire on return, so restart here.
  const onVisibility = () => {
    if (document.visibilityState === "hidden") endDwell();
    else if (intersecting) visibleSince ??= performance.now();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    endDwell();
    observer?.disconnect();
    element.removeEventListener("click", onClick);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
