import { describe, expect, it } from "vitest";

import {
  isTrackSlug,
  parseTrackHash,
  trackDestinationFromExperience,
  trackHash,
} from "@/components/copilot/track-target";

describe("track deep links", () => {
  it("round-trips a slug through the hash", () => {
    expect(trackHash("sunset-kayak-pune")).toBe("#track=sunset-kayak-pune");
    expect(parseTrackHash(trackHash("sunset-kayak-pune"))).toBe("sunset-kayak-pune");
  });

  it("normalises case and surrounding whitespace", () => {
    expect(parseTrackHash("#track=Sunset-Kayak")).toBe("sunset-kayak");
    expect(parseTrackHash("#track=%20cafe-crawl%20")).toBe("cafe-crawl");
  });

  it("ignores other hashes", () => {
    expect(parseTrackHash("")).toBeNull();
    expect(parseTrackHash("#copilot")).toBeNull();
    expect(parseTrackHash("#live-map")).toBeNull();
    expect(parseTrackHash("#tracker=abc")).toBeNull();
  });

  it("rejects anything that is not a slug", () => {
    expect(parseTrackHash("#track=")).toBeNull();
    expect(parseTrackHash("#track=../../api")).toBeNull();
    expect(parseTrackHash("#track=a%2Fb")).toBeNull();
    expect(parseTrackHash("#track=-leading")).toBeNull();
    expect(parseTrackHash("#track=double--hyphen")).toBeNull();
    expect(parseTrackHash("#track=%E0%A4%A")).toBeNull(); // malformed escape
    expect(parseTrackHash(`#track=${"a".repeat(121)}`)).toBeNull();
    expect(isTrackSlug("a".repeat(120))).toBe(true);
  });
});

describe("trackDestinationFromExperience", () => {
  it("reads the stored coordinates and title", () => {
    expect(
      trackDestinationFromExperience({ title: "Bowling night", latitude: 18.51, longitude: 73.93 }),
    ).toEqual({ title: "Bowling night", destination: { lat: 18.51, lng: 73.93 } });
  });

  it("returns null when the listing has no pinned point", () => {
    expect(
      trackDestinationFromExperience({ title: "Bowling", latitude: null, longitude: null }),
    ).toBeNull();
  });

  it("returns null for payloads it does not recognise", () => {
    expect(trackDestinationFromExperience(null)).toBeNull();
    expect(trackDestinationFromExperience("nope")).toBeNull();
    expect(trackDestinationFromExperience({ latitude: 18.5, longitude: 73.9 })).toBeNull();
    expect(
      trackDestinationFromExperience({ title: "  ", latitude: 18.5, longitude: 73.9 }),
    ).toBeNull();
    expect(
      trackDestinationFromExperience({ title: "Far", latitude: 120, longitude: 73.9 }),
    ).toBeNull();
    expect(
      trackDestinationFromExperience({ title: "Str", latitude: "18.5", longitude: "73.9" }),
    ).toBeNull();
  });
});
