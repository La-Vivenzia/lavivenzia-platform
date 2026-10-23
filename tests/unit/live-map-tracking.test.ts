import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  ARRIVAL_RADIUS_METRES,
  MAP_TILES,
  OFF_ROUTE_METRES,
  OSRM_FOOT_BASE,
  fetchWalkingRoute,
  formatDistance,
  formatEta,
  googleMapsWalkingUrl,
  hasArrived,
  haversineMetres,
  isLatLng,
  isOffRoute,
  osrmWalkingRouteUrl,
  parseOsrmRoute,
  pointAlongRoute,
  remainingMetres,
  routeLengthMetres,
  straightRoute,
  walkingEtaSeconds,
  type LatLng,
  type WalkingRoute,
} from "@/components/map/live-map-tracking";

// Amanora Town Centre → Seasons Mall, Pune — the pilot corridor.
const AMANORA: LatLng = { lat: 18.5195, lng: 73.9312 };
const SEASONS: LatLng = { lat: 18.5189, lng: 73.9466 };

/** A three-vertex road route with an elbow, so path length ≠ crow-flies. */
const ELBOW: LatLng = { lat: 18.5245, lng: 73.939 };
const ROAD: WalkingRoute = {
  points: [AMANORA, ELBOW, SEASONS],
  distanceMetres: routeLengthMetres([AMANORA, ELBOW, SEASONS]),
  source: "road",
};

function osrmPayload(points: readonly LatLng[], distance = 1234) {
  return {
    code: "Ok",
    routes: [
      {
        distance,
        geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("geometry", () => {
  it("measures great-circle distance in metres", () => {
    expect(haversineMetres(AMANORA, AMANORA)).toBe(0);
    // ~1.62 km between the two malls.
    expect(haversineMetres(AMANORA, SEASONS)).toBeGreaterThan(1550);
    expect(haversineMetres(AMANORA, SEASONS)).toBeLessThan(1700);
    expect(haversineMetres(AMANORA, SEASONS)).toBeCloseTo(haversineMetres(SEASONS, AMANORA), 6);
  });

  it("validates coordinates", () => {
    expect(isLatLng(AMANORA)).toBe(true);
    expect(isLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isLatLng({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isLatLng({ lat: "18.5", lng: 73.9 })).toBe(false);
    expect(isLatLng(null)).toBe(false);
  });

  it("measures remaining distance along the road, not as the crow flies", () => {
    const along = remainingMetres(AMANORA, ROAD, SEASONS);
    expect(along).toBeCloseTo(ROAD.distanceMetres, 3);
    expect(along).toBeGreaterThan(haversineMetres(AMANORA, SEASONS));
    // Standing on the elbow, only the last leg remains.
    expect(remainingMetres(ELBOW, ROAD, SEASONS)).toBeCloseTo(haversineMetres(ELBOW, SEASONS), 3);
  });

  it("uses straight-line distance with no route or a straight fallback", () => {
    const crow = haversineMetres(ELBOW, SEASONS);
    expect(remainingMetres(ELBOW, null, SEASONS)).toBeCloseTo(crow, 6);
    expect(remainingMetres(ELBOW, straightRoute(AMANORA, SEASONS), SEASONS)).toBeCloseTo(crow, 6);
  });

  it("detects arrival inside the arrival radius only", () => {
    expect(hasArrived(SEASONS, SEASONS)).toBe(true);
    const near = { lat: SEASONS.lat + 0.0001, lng: SEASONS.lng }; // ~11 m
    const far = { lat: SEASONS.lat + 0.001, lng: SEASONS.lng }; // ~111 m
    expect(haversineMetres(near, SEASONS)).toBeLessThan(ARRIVAL_RADIUS_METRES);
    expect(hasArrived(near, SEASONS)).toBe(true);
    expect(hasArrived(far, SEASONS)).toBe(false);
  });

  it("flags an off-route traveller, but never against a straight fallback", () => {
    expect(isOffRoute(ELBOW, ROAD)).toBe(false);
    const detour = { lat: ELBOW.lat + 0.002, lng: ELBOW.lng }; // ~220 m off
    expect(haversineMetres(detour, ELBOW)).toBeGreaterThan(OFF_ROUTE_METRES);
    expect(isOffRoute(detour, ROAD)).toBe(true);
    expect(isOffRoute(detour, straightRoute(AMANORA, SEASONS))).toBe(false);
    expect(isOffRoute(detour, null)).toBe(false);
  });
});

describe("walk simulation", () => {
  it("interpolates along the route and clamps to its ends", () => {
    expect(pointAlongRoute(ROAD.points, -5)).toEqual(AMANORA);
    expect(pointAlongRoute(ROAD.points, 0)).toEqual(AMANORA);
    expect(pointAlongRoute(ROAD.points, ROAD.distanceMetres + 500)).toEqual(SEASONS);

    const firstLeg = haversineMetres(AMANORA, ELBOW);
    const elbow = pointAlongRoute(ROAD.points, firstLeg);
    expect(haversineMetres(elbow, ELBOW)).toBeLessThan(0.5);

    const midway = pointAlongRoute(ROAD.points, firstLeg / 2);
    expect(haversineMetres(AMANORA, midway)).toBeCloseTo(firstLeg / 2, -1);
  });

  it("arrives when it reaches the end of the route", () => {
    const end = pointAlongRoute(ROAD.points, routeLengthMetres(ROAD.points));
    expect(hasArrived(end, SEASONS)).toBe(true);
    expect(remainingMetres(end, ROAD, SEASONS)).toBeLessThan(1);
  });

  it("refuses an empty route", () => {
    expect(() => pointAlongRoute([], 10)).toThrow();
  });
});

describe("formatting", () => {
  it("formats distance", () => {
    expect(formatDistance(-3)).toBe("0 m");
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(999)).toBe("1.0 km");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(12_600)).toBe("13 km");
  });

  it("formats walking time", () => {
    expect(walkingEtaSeconds(1330)).toBeCloseTo(1000, 6);
    expect(walkingEtaSeconds(-10)).toBe(0);
    expect(formatEta(20)).toBe("<1 min");
    expect(formatEta(12 * 60)).toBe("12 min");
    expect(formatEta(60 * 60)).toBe("1 h");
    expect(formatEta(65 * 60)).toBe("1 h 5 min");
  });

  it("deep-links to Google Maps walking directions", () => {
    const toOnly = new URL(googleMapsWalkingUrl(SEASONS));
    expect(toOnly.origin + toOnly.pathname).toBe("https://www.google.com/maps/dir/");
    expect(toOnly.searchParams.get("api")).toBe("1");
    expect(toOnly.searchParams.get("destination")).toBe("18.5189,73.9466");
    expect(toOnly.searchParams.get("travelmode")).toBe("walking");
    expect(toOnly.searchParams.has("origin")).toBe(false);

    const withOrigin = new URL(googleMapsWalkingUrl(SEASONS, AMANORA));
    expect(withOrigin.searchParams.get("origin")).toBe("18.5195,73.9312");
  });

  it("uses CartoDB Voyager tiles in light mode", () => {
    expect(MAP_TILES.light.url).toContain("basemaps.cartocdn.com/rastertiles/voyager");
    expect(MAP_TILES.light.attribution).toContain("OpenStreetMap");
    expect(MAP_TILES.light.attribution).toContain("CARTO");
  });
});

describe("OSRM walking route", () => {
  it("asks the foot profile, longitude first", () => {
    const url = osrmWalkingRouteUrl(AMANORA, SEASONS);
    expect(url.startsWith(`${OSRM_FOOT_BASE}/73.9312,18.5195;73.9466,18.5189?`)).toBe(true);
    expect(url).toContain("geometries=geojson");
    expect(url).toContain("overview=full");
  });

  it("parses a route, flipping GeoJSON order to lat/lng", () => {
    const route = parseOsrmRoute(osrmPayload(ROAD.points, 1900));
    expect(route).toEqual({ points: ROAD.points, distanceMetres: 1900, source: "road" });
  });

  it("derives distance from geometry when the provider omits it", () => {
    const payload = osrmPayload(ROAD.points);
    delete (payload.routes[0] as { distance?: number }).distance;
    expect(parseOsrmRoute(payload)?.distanceMetres).toBeCloseTo(ROAD.distanceMetres, 6);
  });

  it.each([
    ["null", null],
    ["a string", "Ok"],
    ["an error code", { code: "NoRoute", routes: [] }],
    ["no routes", { code: "Ok", routes: [] }],
    ["one vertex", { code: "Ok", routes: [{ geometry: { coordinates: [[73.9, 18.5]] } }] }],
    ["a bad pair", { code: "Ok", routes: [{ geometry: { coordinates: [[73.9, 18.5], [73.9]] } }] }],
    [
      "out-of-range coordinates",
      {
        code: "Ok",
        routes: [
          {
            geometry: {
              coordinates: [
                [73.9, 18.5],
                [200, 18.5],
              ],
            },
          },
        ],
      },
    ],
  ])("rejects %s", (_label, payload) => {
    expect(parseOsrmRoute(payload)).toBeNull();
  });

  it("returns the road route when the provider answers", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(osrmPayload(ROAD.points, 1900)));
    const route = await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl });
    expect(route.source).toBe("road");
    expect(route.distanceMetres).toBe(1900);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx once, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "busy" }, 503))
      .mockResolvedValueOnce(jsonResponse(osrmPayload(ROAD.points)));
    const route = await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl });
    expect(route.source).toBe("road");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to a straight line after repeated provider errors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 502));
    const route = await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl });
    expect(route).toEqual(straightRoute(AMANORA, SEASONS));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: "InvalidQuery" }, 400));
    const route = await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl });
    expect(route.source).toBe("straight");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back on an unreadable payload", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    expect((await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl })).source).toBe("straight");
  });

  it("falls back on network errors after one retry", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const route = await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl });
    expect(route.source).toBe("straight");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("times out a hanging provider and falls back", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const route = await fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl, timeoutMs: 10 });
    expect(route.source).toBe("straight");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rethrows when the caller aborts, so a stale route is never applied", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const pending = fetchWalkingRoute(AMANORA, SEASONS, { fetchImpl, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("copilot integration", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("gives every suggestion the listing's stored coordinates as the destination", () => {
    const types = read("src/modules/copilot/types.ts");
    expect(types).toMatch(/readonly venue: \{ readonly lat: number; readonly lng: number \}/);
    const service = read("src/modules/copilot/service.ts");
    expect(service).toContain(
      "venue: { lat: item.coordinates.latitude, lng: item.coordinates.longitude }",
    );
  });

  it("lazy-loads the tracker client-side and opens it from a suggestion card", () => {
    const copilot = read("src/components/copilot/LiveTravelCopilot.tsx");
    expect(copilot).toMatch(/dynamic\(\s*\(\) => import\("@\/components\/map\/LiveMapTracker"\)/);
    expect(copilot).toContain("{ ssr: false }");
    expect(copilot).toMatch(/onLiveTrack=\{\(\) =>\s*setTrack\(\{/);
    expect(copilot).toContain("destination: suggestion.venue");
    expect(copilot).toContain("Live Track");
    expect(copilot).toContain("destination={track.destination}");
  });

  it("opens straight onto the tracker from outside the drawer", () => {
    const provider = read("src/components/copilot/CopilotProvider.tsx");
    expect(provider).toContain("parseTrackHash(hash)");
    expect(provider).toContain("export function LiveTrackTrigger");
    expect(provider).toContain("export function LiveMapTrigger");
    const copilot = read("src/components/copilot/LiveTravelCopilot.tsx");
    // A slug-only request reads the stored coordinates from the catalogue.
    expect(copilot).toContain("/api/v1/experiences/${encodeURIComponent(slug)}");
    expect(copilot).toContain("trackDestinationFromExperience(payload)");
  });

  it("offers live tracking on the experience page, headers and home", () => {
    const page = read("src/app/(site)/experiences/[slug]/page.tsx");
    expect(page).toContain("<LiveTrackButton");
    expect(read("src/components/site/location-panel.tsx")).toContain("<LiveTrackButton");
    expect(read("src/components/DesktopHeader.tsx")).toContain("<LiveMapTrigger");
    expect(read("src/components/MobileHeader.tsx")).toContain("<LiveMapTrigger");
    expect(read("src/components/MobileHome.tsx")).toContain("<LiveTrackingSection />");
    expect(read("src/components/DesktopHome.tsx")).toContain("<LiveTrackingFeature");
  });

  it("keeps Leaflet out of the server render", () => {
    const tracker = read("src/components/map/LiveMapTracker.tsx");
    expect(tracker.startsWith('"use client";')).toBe(true);
    // Only a type import at module scope; the runtime import happens in an effect.
    expect(tracker).not.toMatch(/^import (?!type)[^;]*from "leaflet";/m);
    expect(tracker).toContain('await import("leaflet")');
  });
});
