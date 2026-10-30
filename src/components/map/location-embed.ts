import { isValidLatitude, isValidLongitude } from "@/modules/discovery/geo";

/**
 * Which embedded map the location panel shows, and where it loads from.
 *
 * Pure, so the URLs can be unit-tested in Node without rendering anything.
 *
 * - With `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, the **Maps Embed API** `place`
 *   mode. It is a no-cost, unlimited-use Google product and needs no script on
 *   our page — only an iframe.
 * - Without it, the **OpenStreetMap** embed, which needs no key or account.
 *   That is why the panel always has a map when the listing is pinned.
 *
 * The embed key is published to the browser by design: it appears in the
 * iframe URL. It must therefore be a **separate browser key** restricted by
 * HTTP referrer and to the Maps Embed API only — never `GOOGLE_MAPS_API_KEY`,
 * which is the server's Places key (CLAUDE.md §8).
 */

export type LocationEmbedProvider = "google" | "openstreetmap";

export interface LocationEmbed {
  readonly provider: LocationEmbedProvider;
  readonly src: string;
}

export interface LocationEmbedInput {
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** The published address, used by Google when the listing has no pin. */
  readonly address?: string | null;
  readonly googleApiKey?: string | null | undefined;
}

/** Street level: close enough to find the door, wide enough to see the area. */
const GOOGLE_ZOOM = 15;

/**
 * Half-width of the OpenStreetMap view, in degrees. The OSM embed takes a
 * bounding box rather than a zoom; ~0.006° of latitude is ~650 m each way,
 * which renders at roughly the same scale as `GOOGLE_ZOOM`.
 */
const OSM_HALF_SPAN_LAT = 0.006;
const OSM_HALF_SPAN_LNG = 0.01;

export function buildLocationEmbed(input: LocationEmbedInput): LocationEmbed | null {
  const point =
    input.latitude !== null &&
    input.longitude !== null &&
    isValidLatitude(input.latitude) &&
    isValidLongitude(input.longitude)
      ? { lat: input.latitude, lng: input.longitude }
      : null;

  const apiKey = input.googleApiKey?.trim();
  const address = input.address?.trim();

  if (apiKey) {
    // A pin beats an address: coordinates are what the host placed, and an
    // address can geocode to the wrong side of a large city.
    const q = point ? `${point.lat},${point.lng}` : address;
    if (q) {
      const params = new URLSearchParams({ key: apiKey, q, zoom: String(GOOGLE_ZOOM) });
      return {
        provider: "google",
        src: `https://www.google.com/maps/embed/v1/place?${params.toString()}`,
      };
    }
  }

  // The OSM embed cannot search by address, so without a pin there is nothing
  // truthful to centre on — the panel says so rather than guessing.
  if (!point) return null;

  const bbox = [
    Math.max(point.lng - OSM_HALF_SPAN_LNG, -180),
    Math.max(point.lat - OSM_HALF_SPAN_LAT, -90),
    Math.min(point.lng + OSM_HALF_SPAN_LNG, 180),
    Math.min(point.lat + OSM_HALF_SPAN_LAT, 90),
  ].join(",");

  const params = new URLSearchParams({
    bbox,
    layer: "mapnik",
    marker: `${point.lat},${point.lng}`,
  });

  return {
    provider: "openstreetmap",
    src: `https://www.openstreetmap.org/export/embed.html?${params.toString()}`,
  };
}
