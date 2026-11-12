import { describe, expect, it } from "vitest";

import {
  JOURNEY_START,
  STOP_ARRIVAL_RADIUS_METRES,
  advanceJourney,
  bearingDegrees,
  fetchJourneyLegs,
  googleMapsJourneyUrl,
  hasArrived,
  haversineMetres,
  skipToNextStop,
  stopStatus,
  travelEtaSeconds,
  travelModeFor,
  type JourneyStop,
  type LatLng,
} from "@/components/map/live-map-tracking";

const stop = (name: string, lat: number, lng: number): JourneyStop => ({
  name,
  role: name,
  coordinates: { lat, lng },
  address: "",
});

/** Three stops about a kilometre apart, north-south. */
const stops = [
  stop("Prelude", 18.5, 73.9),
  stop("Centerpiece", 18.51, 73.9),
  stop("Epilogue", 18.52, 73.9),
];
const near = (to: LatLng, metresNorth: number): LatLng => ({
  lat: to.lat + metresNorth / 111_195,
  lng: to.lng,
});

describe("journey progress", () => {
  it("marks an act reached inside the arrival radius, not outside it", () => {
    const far = advanceJourney(JOURNEY_START, near(stops[0]!.coordinates, 200), stops);
    expect(far).toBe(JOURNEY_START);
    const reached = advanceJourney(JOURNEY_START, near(stops[0]!.coordinates, 50), stops);
    expect(reached).toEqual({ activeIndex: 0, arrived: true });
    expect(STOP_ARRIVAL_RADIUS_METRES).toBe(80);
  });

  it("advances once the traveller leaves a reached act", () => {
    const reached = { activeIndex: 0, arrived: true };
    expect(advanceJourney(reached, near(stops[0]!.coordinates, 100), stops)).toBe(reached);
    expect(advanceJourney(reached, near(stops[0]!.coordinates, 300), stops)).toEqual({
      activeIndex: 1,
      arrived: false,
    });
  });

  it("never advances past the last act", () => {
    const last = { activeIndex: 2, arrived: true };
    expect(advanceJourney(last, near(stops[2]!.coordinates, 5_000), stops)).toBe(last);
    expect(skipToNextStop(last, stops)).toBe(last);
    expect(skipToNextStop(JOURNEY_START, stops)).toEqual({ activeIndex: 1, arrived: false });
  });

  it("labels each act relative to the active one", () => {
    expect([0, 1, 2, 3].map((index) => stopStatus(index, 1))).toEqual([
      "done",
      "active",
      "next",
      "upcoming",
    ]);
  });

  it("takes an arrival radius for the single-pin check", () => {
    const at = near(stops[0]!.coordinates, 60);
    expect(hasArrived(at, stops[0]!.coordinates)).toBe(false);
    expect(hasArrived(at, stops[0]!.coordinates, 80)).toBe(true);
  });
});

describe("journey travel", () => {
  it("walks short legs and takes a cab for long ones", () => {
    expect(travelModeFor(1_500)).toBe("walking");
    expect(travelModeFor(5_000)).toBe("driving");
    expect(travelEtaSeconds(5_000, "driving")).toBeLessThan(travelEtaSeconds(5_000, "walking"));
  });

  it("measures bearings clockwise from north", () => {
    const origin = { lat: 18.5, lng: 73.9 };
    expect(bearingDegrees(origin, { lat: 18.51, lng: 73.9 })).toBeCloseTo(0, 0);
    expect(bearingDegrees(origin, { lat: 18.5, lng: 73.91 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(origin, { lat: 18.49, lng: 73.9 })).toBeCloseTo(180, 0);
  });

  it("links Google Maps through every act still ahead", () => {
    const url = new URL(googleMapsJourneyUrl(stops, 0, { lat: 18.4, lng: 73.8 }, "walking"));
    expect(url.searchParams.get("destination")).toBe("18.52,73.9");
    expect(url.searchParams.get("waypoints")).toBe("18.5,73.9|18.51,73.9");
    expect(url.searchParams.get("origin")).toBe("18.4,73.8");
    expect(url.searchParams.get("travelmode")).toBe("walking");

    const lastLeg = new URL(googleMapsJourneyUrl(stops, 2, null, "driving"));
    expect(lastLeg.searchParams.has("waypoints")).toBe(false);
    expect(lastLeg.searchParams.has("origin")).toBe(false);
    expect(lastLeg.searchParams.get("travelmode")).toBe("driving");
  });

  it("fetches one leg per pair of stops, falling back to straight lines", async () => {
    const failing = async () => {
      throw new TypeError("network down");
    };
    const legs = await fetchJourneyLegs(stops, { fetchImpl: failing, retries: 0 });
    expect(legs).toHaveLength(2);
    for (const leg of legs) expect(leg.source).toBe("straight");
    expect(legs[0]!.distanceMetres).toBeCloseTo(
      haversineMetres(stops[0]!.coordinates, stops[1]!.coordinates),
    );
    expect(await fetchJourneyLegs(stops.slice(0, 1))).toEqual([]);
  });
});
