/**
 * Pure logic behind the live map tracker — geometry, formatting, the walking
 * route provider and the walk simulation.
 *
 * Kept free of Leaflet, React and the DOM so it can be unit-tested in Node,
 * and kept out of the `"use client"` module so its constants never cross the
 * RSC boundary as client-reference proxies (see client-boundary.test.ts).
 *
 * Nothing here invents a fact (CLAUDE.md §7). The destination is the listing's
 * stored coordinates; distance and ETA are arithmetic over a real route or,
 * when the routing provider fails, over the straight line — and the HUD says
 * which one it is showing.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface WalkingRoute {
  /** Ordered vertices from origin to destination. At least two. */
  readonly points: readonly LatLng[];
  readonly distanceMetres: number;
  /** "road" when the provider answered; "straight" when we fell back. */
  readonly source: "road" | "straight";
}

/* ---------------------------------------------------------------- tiles */

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** CartoDB basemaps — Voyager in light mode, Dark Matter in dark mode. */
export const MAP_TILES = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
  },
  subdomains: "abcd",
  maxZoom: 20,
} as const;

/* ------------------------------------------------------------- geometry */

const EARTH_RADIUS_METRES = 6_371_008.8;

/** Typical adult walking pace, ~4.8 km/h. */
export const WALKING_SPEED_MPS = 1.33;

/** Within this distance of the venue, the traveller has arrived. */
export const ARRIVAL_RADIUS_METRES = 25;

/** Further than this from the drawn route, the route is redrawn from here. */
export const OFF_ROUTE_METRES = 45;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== "object" || value === null) return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Great-circle distance in metres. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a polyline in metres, optionally from vertex `from` onwards. */
export function routeLengthMetres(points: readonly LatLng[], from = 0): number {
  let total = 0;
  for (let i = Math.max(1, from + 1); i < points.length; i += 1) {
    total += haversineMetres(points[i - 1]!, points[i]!);
  }
  return total;
}

function nearestVertex(position: LatLng, points: readonly LatLng[]) {
  let index = 0;
  let distance = Infinity;
  points.forEach((point, i) => {
    const d = haversineMetres(position, point);
    if (d < distance) {
      distance = d;
      index = i;
    }
  });
  return { index, distance };
}

/** A two-point route — what we draw when the routing provider is unavailable. */
export function straightRoute(from: LatLng, to: LatLng): WalkingRoute {
  return { points: [from, to], distanceMetres: haversineMetres(from, to), source: "straight" };
}

/**
 * Metres still to walk: from the traveller to the nearest route vertex, then
 * along the route to its end. Straight-line distance when there is no route.
 */
export function remainingMetres(position: LatLng, route: WalkingRoute | null, to: LatLng): number {
  if (!route || route.source === "straight" || route.points.length < 2) {
    return haversineMetres(position, to);
  }
  const { index, distance } = nearestVertex(position, route.points);
  return distance + routeLengthMetres(route.points, index);
}

/** True when the traveller has strayed far enough that the route should be redrawn. */
export function isOffRoute(position: LatLng, route: WalkingRoute | null): boolean {
  if (!route || route.source !== "road") return false;
  return nearestVertex(position, route.points).distance > OFF_ROUTE_METRES;
}

export function hasArrived(position: LatLng, to: LatLng): boolean {
  return haversineMetres(position, to) <= ARRIVAL_RADIUS_METRES;
}

/** The point `metres` along the route, clamped to its ends. */
export function pointAlongRoute(points: readonly LatLng[], metres: number): LatLng {
  const first = points[0];
  if (!first) throw new Error("pointAlongRoute needs at least one point");
  if (metres <= 0 || points.length === 1) return first;

  let travelled = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = haversineMetres(a, b);
    if (travelled + segment >= metres) {
      const t = segment === 0 ? 0 : (metres - travelled) / segment;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    travelled += segment;
  }
  return points[points.length - 1]!;
}

/* ----------------------------------------------------------- formatting */

export function walkingEtaSeconds(metres: number): number {
  return Math.max(0, metres) / WALKING_SPEED_MPS;
}

/** "350 m", "1.2 km", "12 km". */
export function formatDistance(metres: number): string {
  const m = Math.max(0, metres);
  const rounded = Math.round(m / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** "<1 min", "12 min", "1 h 5 min". */
export function formatEta(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Google Maps walking directions, from the traveller when we know where they are. */
export function googleMapsWalkingUrl(to: LatLng, from?: LatLng | null): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${to.lat},${to.lng}`,
    travelmode: "walking",
  });
  if (from) params.set("origin", `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/* -------------------------------------------------------- walking route */

/**
 * The FOSSGIS-hosted OSRM foot profile. The project-osrm.org demo ignores the
 * profile name and always routes for cars, so it cannot draw a walking route.
 */
export const OSRM_FOOT_BASE = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";

export const ROUTE_TIMEOUT_MS = 8_000;

export function osrmWalkingRouteUrl(from: LatLng, to: LatLng): string {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  return `${OSRM_FOOT_BASE}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;
}

/**
 * Reads an OSRM `/route` response. Returns null for anything that is not a
 * usable route — an error code, no routes, or malformed geometry — so a bad
 * payload degrades to the straight line instead of drawing garbage.
 */
export function parseOsrmRoute(payload: unknown): WalkingRoute | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { code, routes } = payload as { code?: unknown; routes?: unknown };
  if (code !== "Ok" || !Array.isArray(routes) || routes.length === 0) return null;

  const route = routes[0] as { distance?: unknown; geometry?: { coordinates?: unknown } };
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const points: LatLng[] = [];
  for (const pair of coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    // GeoJSON order is [longitude, latitude].
    const point = { lat: pair[1] as unknown, lng: pair[0] as unknown };
    if (!isLatLng(point)) return null;
    points.push(point);
  }

  const distance = route.distance;
  const distanceMetres =
    typeof distance === "number" && Number.isFinite(distance) && distance >= 0
      ? distance
      : routeLengthMetres(points);

  return { points, distanceMetres, source: "road" };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetches a walking route, never throwing for provider trouble.
 *
 * Timeouts, network errors, non-2xx answers and unreadable payloads all fall
 * back to the straight line. A network error or 5xx is retried once — the
 * request is a GET, so a retry is safe. A caller's abort is respected and
 * rethrown, so a superseded request does not overwrite a newer one.
 */
export async function fetchWalkingRoute(
  from: LatLng,
  to: LatLng,
  {
    signal,
    fetchImpl = fetch,
    timeoutMs = ROUTE_TIMEOUT_MS,
    retries = 1,
  }: {
    readonly signal?: AbortSignal;
    readonly fetchImpl?: FetchLike;
    readonly timeoutMs?: number;
    readonly retries?: number;
  } = {},
): Promise<WalkingRoute> {
  const url = osrmWalkingRouteUrl(from, to);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (response.status >= 500 && attempt < retries) continue;
      if (!response.ok) break;
      const payload: unknown = await response.json().catch(() => null);
      return parseOsrmRoute(payload) ?? straightRoute(from, to);
    } catch (error) {
      if (signal?.aborted) throw error;
      // Timed out or the network failed: retry if allowed, else fall back.
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return straightRoute(from, to);
}

/* ---------------------------------------------------- walk simulation */

/** How far one simulation tick moves the beacon — about 10× walking pace. */
export const SIMULATION_TICK_MS = 1_000;
export const SIMULATION_METRES_PER_TICK = WALKING_SPEED_MPS * 10;
