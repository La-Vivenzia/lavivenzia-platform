import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOTSPOT,
  MOOD_OPTIONS,
  PILOT_HOTSPOTS,
  RADIUS_STOPS_KM,
  copilotErrorMessage,
  distanceKm,
  findHotspot,
  isWithinPilotCorridor,
} from "@/components/copilot/copilot-options";
import { COPILOT_RADIUS_KM, CopilotRequest, isCopilotMood } from "@/modules/copilot/types";

describe("copilot drawer options", () => {
  it("defaults to Amanora Town Centre", () => {
    expect(DEFAULT_HOTSPOT).toMatchObject({ id: "amanora", lat: 18.5195, lng: 73.9312 });
    expect(findHotspot("unknown")).toBe(DEFAULT_HOTSPOT);
    expect(findHotspot("hadapsar").label).toBe("Hadapsar");
  });

  it("only offers moods the API understands", () => {
    for (const option of MOOD_OPTIONS) expect(isCopilotMood(option.mood)).toBe(true);
  });

  it("only offers radii the API accepts without clamping", () => {
    for (const stop of RADIUS_STOPS_KM) {
      expect(stop).toBeGreaterThanOrEqual(COPILOT_RADIUS_KM.min);
      expect(stop).toBeLessThanOrEqual(COPILOT_RADIUS_KM.max);
    }
  });

  it("builds requests the API validates for every hotspot", () => {
    for (const hotspot of PILOT_HOTSPOTS) {
      const parsed = CopilotRequest.safeParse({ lat: hotspot.lat, lng: hotspot.lng, radiusKm: 3 });
      expect(parsed.success).toBe(true);
    }
  });
});

describe("distance helpers", () => {
  it("measures short distances in the corridor", () => {
    const magarpatta = findHotspot("magarpatta");
    const km = distanceKm(DEFAULT_HOTSPOT, magarpatta);
    expect(km).toBeGreaterThan(0.4);
    expect(km).toBeLessThan(1.5);
    expect(distanceKm(DEFAULT_HOTSPOT, DEFAULT_HOTSPOT)).toBe(0);
  });

  it("recognises a point outside the pilot", () => {
    expect(isWithinPilotCorridor({ lat: 18.5204, lng: 73.8567 })).toBe(true); // Pune centre
    expect(isWithinPilotCorridor({ lat: 19.076, lng: 72.8777 })).toBe(false); // Mumbai
  });
});

describe("copilotErrorMessage", () => {
  it("explains rate limiting", () => {
    expect(copilotErrorMessage(429, null)).toMatch(/few minutes/);
  });

  it("passes through a client error's message", () => {
    expect(copilotErrorMessage(400, { error: { message: "lat is out of range" } })).toBe(
      "lat is out of range",
    );
  });

  it("never surfaces server error detail or unreadable bodies", () => {
    expect(copilotErrorMessage(500, { error: { message: "stack trace" } })).not.toMatch(/stack/);
    expect(copilotErrorMessage(400, "<html>")).toMatch(/try again/);
  });
});
