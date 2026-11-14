/**
 * The traveller's saved curations: the journeys they have added to "My
 * Curations".
 *
 * Kept on the device, in localStorage and in the `lv_saved_curations` cookie.
 * The cookie is what the server reads (`GET /api/v1/user/curations`); the
 * localStorage copy survives the cookie being cleared and is written back into
 * it on the next read. Both hold journey ids only — never a title, price or
 * status, which the server resolves from the catalogue (CLAUDE.md §7).
 *
 * The parse/serialise helpers are framework-free so the route handler shares
 * the exact format; the browser helpers are inert on the server.
 */

import type { Journey } from "@/modules/journeys/data";

export const SAVED_CURATIONS_COOKIE = "lv_saved_curations";

const STORAGE_KEY = "lv.saved-curations.v1";
const CHANGE_EVENT = "lv:saved-curations";

/** A journey id is a catalogue slug; anything else is discarded on read. */
const JOURNEY_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** A ceiling on the cookie, comfortably under any browser's 4 KB limit. */
export const SAVED_CURATIONS_MAX = 24;

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function isJourneyId(value: unknown): value is string {
  return typeof value === "string" && JOURNEY_ID.test(value);
}

/** Valid, de-duplicated ids, most recently saved first, capped. */
export function normaliseCurationIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (isJourneyId(id)) seen.add(id);
    if (seen.size >= SAVED_CURATIONS_MAX) break;
  }
  return [...seen];
}

/** The cookie's value → ids. Tolerates a missing, encoded or tampered value. */
export function parseSavedCurationsCookie(value: string | undefined | null): string[] {
  if (!value) return [];
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return [];
  }
  return normaliseCurationIds(decoded.split(","));
}

export function serialiseSavedCurations(ids: readonly string[]): string {
  return normaliseCurationIds(ids).join(",");
}

/** `ids` with `journeyId` moved to the front. */
export function withCuration(ids: readonly string[], journeyId: string): string[] {
  return normaliseCurationIds([journeyId, ...ids.filter((id) => id !== journeyId)]);
}

/** Attributes for the cookie. Readable by script on purpose: it holds no secret. */
export function savedCurationsCookieAttributes(secure: boolean) {
  return {
    httpOnly: false,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}

/** A saved journey as `GET /api/v1/user/curations` returns it. No price, no status. */
export interface SavedCurationSummary {
  readonly id: string;
  readonly title: string;
  readonly mood: string;
  readonly tagline: string;
  readonly actCount: number;
  readonly totalDurationMinutes: number;
  readonly coverImage: string;
  readonly coverAlt: string;
}

export function toCurationSummary(journey: Journey): SavedCurationSummary {
  return {
    id: journey.id,
    title: journey.title,
    mood: journey.mood,
    tagline: journey.tagline,
    actCount: journey.chapters.length,
    totalDurationMinutes: journey.totalDurationMinutes,
    coverImage: journey.coverImage,
    coverAlt: journey.coverAlt,
  };
}

// ── Browser ────────────────────────────────────────────────────────────────

const inBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? normaliseCurationIds(parsed) : [];
  } catch {
    // Private mode, a full quota or a hand-edited value: the cookie still answers.
    return [];
  }
}

function readCookie(): string[] {
  const prefix = `${SAVED_CURATIONS_COOKIE}=`;
  const entry = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return parseSavedCurationsCookie(entry?.slice(prefix.length));
}

function write(ids: readonly string[]): void {
  const value = serialiseSavedCurations(ids);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value ? value.split(",") : []));
  } catch {
    // The cookie below is still written.
  }
  const attributes = savedCurationsCookieAttributes(window.location.protocol === "https:");
  document.cookie = [
    `${SAVED_CURATIONS_COOKIE}=${encodeURIComponent(value)}`,
    `Path=${attributes.path}`,
    `Max-Age=${attributes.maxAge}`,
    "SameSite=Lax",
    ...(attributes.secure ? ["Secure"] : []),
  ].join("; ");
}

/** Every saved journey id, most recent first. Re-syncs the two stores when they differ. */
export function getSavedCurations(): string[] {
  if (!inBrowser()) return [];
  const cookie = readCookie();
  const merged = normaliseCurationIds([...cookie, ...readStorage()]);
  if (merged.join(",") !== cookie.join(",")) write(merged);
  return merged;
}

export function isCurationSaved(journeyId: string): boolean {
  return getSavedCurations().includes(journeyId);
}

/** Save a journey on this device. Returns the updated list. */
export function addSavedCuration(journeyId: string): string[] {
  if (!inBrowser() || !isJourneyId(journeyId)) return getSavedCurations();
  const next = withCuration(getSavedCurations(), journeyId);
  write(next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

/**
 * Subscribe to changes from this tab or another one — the shape
 * `useSyncExternalStore` expects.
 */
export function subscribeSavedCurations(onChange: () => void): () => void {
  if (!inBrowser()) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
