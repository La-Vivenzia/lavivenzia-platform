import { isLatLng, type LatLng } from "@/components/map/live-map-tracking";

/**
 * Deep links into the live map tracker.
 *
 * `#track=<slug>` opens the copilot straight onto the tracker for one listing,
 * from any page — the same idea as `#copilot`, so a server-rendered anchor
 * reaches the map without client code of its own.
 *
 * A caller that already holds the listing's stored coordinates (the experience
 * page does) passes them directly and skips the lookup. A caller with only a
 * slug gets them from `GET /api/v1/experiences/:slug` — the published
 * catalogue, never a guess (CLAUDE.md §7).
 *
 * A plain module, not `"use client"`, so these helpers can be unit-tested and
 * imported from either side of the RSC boundary.
 */

export const TRACK_HASH_PREFIX = "#track=";

/** The slug alphabet `slugify` produces, with headroom for collision suffixes. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_LIMIT = 120;

export interface TrackTarget {
  readonly slug: string;
  /** Shown on the tracker; looked up with the coordinates when omitted. */
  readonly title?: string;
  /** The listing's stored coordinates, when the caller already has them. */
  readonly destination?: LatLng;
}

export function isTrackSlug(value: string): boolean {
  return value.length > 0 && value.length <= SLUG_LIMIT && SLUG_PATTERN.test(value);
}

/** `#track=<slug>` for a listing. */
export function trackHash(slug: string): string {
  return `${TRACK_HASH_PREFIX}${encodeURIComponent(slug)}`;
}

/** The slug in a `#track=<slug>` hash, or null if the hash is anything else. */
export function parseTrackHash(hash: string): string | null {
  if (!hash.startsWith(TRACK_HASH_PREFIX)) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(hash.slice(TRACK_HASH_PREFIX.length)).trim().toLowerCase();
  } catch {
    return null;
  }
  return isTrackSlug(slug) ? slug : null;
}

/**
 * The tracker's destination from an experience detail response, or null when
 * the listing has no pinned location or the payload is not one we recognise.
 */
export function trackDestinationFromExperience(
  payload: unknown,
): { readonly destination: LatLng; readonly title: string } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { latitude, longitude, title } = payload as {
    latitude?: unknown;
    longitude?: unknown;
    title?: unknown;
  };
  const destination = { lat: latitude, lng: longitude };
  if (!isLatLng(destination) || typeof title !== "string" || title.trim() === "") return null;
  return { destination, title };
}
