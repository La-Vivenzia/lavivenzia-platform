/**
 * Coordinates and proximity (FR-03).
 *
 * Framework-free, and deliberately separate from the discovery service: these
 * are the rules about what a coordinate *is*, and they are needed by the
 * discovery filters, by the maps port and by anything that later renders a map.
 * Putting them in the service would make the maps adapter import a service to
 * find out whether a latitude is valid.
 *
 * Nothing here talks to PostGIS. The database does the distance arithmetic —
 * it has the spatial index and the correct geodesic maths — so this module's
 * job is to decide whether a request is well formed before it becomes SQL.
 */

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * A proximity constraint, in the form the repository can execute directly.
 *
 * Radius is metres rather than kilometres because that is what `ST_DWithin`
 * takes on a `geography` column. Converting once, here, means no query has to
 * remember to multiply by a thousand.
 */
export interface ProximityFilter extends Coordinates {
  readonly radiusMetres: number;
}

export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;

/**
 * Radius bounds.
 *
 * The floor exists because a radius of zero matches only an exact coordinate
 * collision, which reads to a traveller as "nothing near me" rather than as the
 * degenerate query it is. The ceiling exists because beyond a few hundred
 * kilometres "nearby" has stopped meaning anything and the spatial index stops
 * helping — an unbounded radius is a full table scan wearing a filter's
 * clothing.
 */
export const RADIUS_METRES = {
  min: 100,
  default: 25_000,
  max: 500_000,
} as const;

/**
 * Coordinate precision, in decimal places.
 *
 * Six places is roughly 11 cm and is what `Decimal(9,6)` stores, so more than
 * that is noise. Rounding is not only tidiness: an un-rounded coordinate from a
 * device GPS is a high-entropy identifier, and echoing it back in a shareable
 * URL is a privacy leak in a way a rounded one is not. See docs/ASSUMPTIONS.md
 * → A-015.
 */
const COORDINATE_DECIMALS = 6;

function round(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= LATITUDE_RANGE.min && value <= LATITUDE_RANGE.max;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= LONGITUDE_RANGE.min && value <= LONGITUDE_RANGE.max;
}

/**
 * Parse a coordinate pair, or return null.
 *
 * Null rather than a throw, because every caller so far runs on query-string
 * input from a browsing surface: a mangled `lat` should drop the proximity
 * filter and show results, not produce an error page. An endpoint that genuinely
 * cannot proceed without a location should reject the null itself, rather than
 * this module growing a throwing variant nothing calls.
 */
export function parseCoordinates(
  latitude: string | number | undefined,
  longitude: string | number | undefined,
): Coordinates | null {
  if (latitude === undefined || longitude === undefined) return null;
  if (typeof latitude === "string" && latitude.trim() === "") return null;
  if (typeof longitude === "string" && longitude.trim() === "") return null;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;

  // 0,0 is Null Island in the Gulf of Guinea. It is overwhelmingly more likely
  // to be an uninitialised variable than a real request, and treating it as a
  // location sends the traveller 6,000 km into the Atlantic.
  if (lat === 0 && lng === 0) return null;

  return { latitude: round(lat), longitude: round(lng) };
}

/** Clamp a caller-supplied radius in kilometres into the allowed metre range. */
export function parseRadiusMetres(radiusKm: string | number | undefined): number {
  if (radiusKm === undefined) return RADIUS_METRES.default;
  if (typeof radiusKm === "string" && radiusKm.trim() === "") return RADIUS_METRES.default;

  const km = Number(radiusKm);
  if (!Number.isFinite(km) || km <= 0) return RADIUS_METRES.default;

  return Math.min(Math.max(Math.round(km * 1000), RADIUS_METRES.min), RADIUS_METRES.max);
}

/**
 * Build a proximity filter from raw input, or null when there is no usable
 * location. A radius without coordinates is meaningless and is dropped with it.
 */
export function parseProximity(
  latitude: string | number | undefined,
  longitude: string | number | undefined,
  radiusKm: string | number | undefined,
): ProximityFilter | null {
  const coordinates = parseCoordinates(latitude, longitude);
  if (!coordinates) return null;

  return { ...coordinates, radiusMetres: parseRadiusMetres(radiusKm) };
}

/**
 * The radius choices offered in the UI, in kilometres.
 *
 * Here rather than in the component because a `"use client"` module cannot be
 * the home of a plain data export that a server component reads: across the RSC
 * boundary it arrives as a client-reference proxy rather than as an array, and
 * calling `.filter` on it fails at request time with a message that names
 * neither the file nor the cause. It is derived from the bounds above, so this
 * is also where it belongs on the merits.
 */
export const RADIUS_CHOICES_KM: readonly number[] = [
  5,
  10,
  RADIUS_METRES.default / 1000,
  50,
  100,
  RADIUS_METRES.max / 1000,
];

/**
 * Human-readable distance.
 *
 * Metres below a kilometre, then one decimal place up to ten kilometres, then
 * whole kilometres. The precision drops as the number grows because "12.7 km
 * away" implies an accuracy that a straight-line distance between two points
 * does not have.
 */
export function formatDistance(metres: number | null): string | null {
  if (metres === null || !Number.isFinite(metres) || metres < 0) return null;

  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;

  const km = metres / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
