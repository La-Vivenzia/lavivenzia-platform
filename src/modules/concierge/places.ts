import { parseCoordinates, type Coordinates } from "@/modules/discovery/geo";
import {
  DEFAULT_HOTSPOT_ID,
  HOTSPOTS,
  type Hotspot,
  type HotspotId,
} from "@/modules/concierge/options";

/**
 * Where the traveller is — hotspots, GPS fixes and the arithmetic between them.
 *
 * Kept apart from `service.ts` because it needs no catalogue: the conversation
 * runs in the browser and resolves "Hadapsar" or a GPS fix to a place without
 * shipping every listing to the client.
 */

/** A GPS fix this close to a hotspot's centre is treated as being in it. */
const HOTSPOT_SNAP_METRES = 250;

/** Further than this from every hotspot, the traveller is outside the pilot. */
export const PILOT_AREA_METRES = 25_000;

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function findHotspot(id: string | undefined | null): Hotspot | null {
  if (!id) return null;
  const key = id.trim().toLowerCase();
  return HOTSPOTS.find((hotspot) => hotspot.id === key) ?? null;
}

function defaultHotspot(): Hotspot {
  return findHotspot(DEFAULT_HOTSPOT_ID)!;
}

export type LocationSource = "gps" | "hotspot" | "fallback";

export interface ResolvedLocation {
  readonly source: LocationSource;
  /** The hotspot the traveller is in, or null when a GPS fix is between hotspots. */
  readonly hotspotId: HotspotId | null;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Set on a fallback, explaining it to the traveller. */
  readonly notice: string | null;
}

/**
 * Coordinates first, then a hotspot id, then the default hotspot.
 *
 * Never throws: a denied geolocation prompt, a mangled coordinate or an
 * unknown hotspot should still produce recommendations, with a notice saying
 * where they are measured from.
 */
export function resolveLocation(input: {
  readonly latitude?: string | number | undefined;
  readonly longitude?: string | number | undefined;
  readonly hotspot?: string | undefined;
}): ResolvedLocation {
  const coordinates = parseCoordinates(input.latitude, input.longitude);
  const fromHotspot = (hotspot: Hotspot, source: LocationSource, notice: string | null) => ({
    source,
    hotspotId: hotspot.id,
    label: hotspot.label,
    latitude: hotspot.latitude,
    longitude: hotspot.longitude,
    notice,
  });

  if (coordinates) {
    let nearest = defaultHotspot();
    let nearestMetres = Infinity;
    for (const hotspot of HOTSPOTS) {
      const metres = distanceMetres(coordinates, hotspot);
      if (metres < nearestMetres) {
        nearest = hotspot;
        nearestMetres = metres;
      }
    }

    if (nearestMetres > PILOT_AREA_METRES) {
      const fallback = findHotspot(input.hotspot) ?? defaultHotspot();
      return fromHotspot(
        fallback,
        "fallback",
        `You're outside our East Pune pilot, so we're showing picks around ${fallback.label}.`,
      );
    }

    const snapped = nearestMetres <= HOTSPOT_SNAP_METRES;
    return {
      source: "gps",
      hotspotId: snapped ? nearest.id : null,
      label: snapped ? nearest.label : `Near ${nearest.label}`,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      notice: null,
    };
  }

  const hotspot = findHotspot(input.hotspot);
  if (hotspot) return fromHotspot(hotspot, "hotspot", null);

  const fallback = defaultHotspot();
  return fromHotspot(
    fallback,
    "fallback",
    `We couldn't place you, so we're showing picks around ${fallback.label}.`,
  );
}

/** Lower-case, accents stripped, so "Café" and "cafe" are one word. */
export function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * A hotspot named in free text — "Seasons Mall", "near amanora", "Hadapsar".
 * Longest alias first, so "amanora town centre" is not read as a shorter one.
 */
export function findHotspotInText(text: string): Hotspot | null {
  const haystack = ` ${normalise(text).replace(/[^a-z0-9]+/g, " ")} `;
  const candidates = HOTSPOTS.flatMap((hotspot) =>
    [hotspot.id, hotspot.label.toLowerCase(), ...hotspot.aliases].map((alias) => ({
      hotspot,
      alias: normalise(alias),
    })),
  ).sort((a, b) => b.alias.length - a.alias.length);
  return candidates.find(({ alias }) => haystack.includes(` ${alias} `))?.hotspot ?? null;
}
