import { describe, expect, it } from "vitest";
import {
  RADIUS_METRES,
  formatDistance,
  isValidLatitude,
  isValidLongitude,
  parseCoordinates,
  parseProximity,
  parseRadiusMetres,
} from "@/modules/discovery/geo";

/**
 * Coordinate handling.
 *
 * Every value here arrives from a query string or a device API, so the tests
 * are written against hostile input rather than against the happy path — the
 * question each one answers is "what does this do when the input is wrong",
 * because that is the input this module exists to handle.
 */

describe("coordinate validity", () => {
  it("accepts the poles and the antimeridian", () => {
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
  });

  it("rejects values outside the range", () => {
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLongitude(-180.1)).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    // `Number("abc")` is NaN, and NaN passes a naive range check because every
    // comparison against it is false — including the ones that would reject it.
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLatitude(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidLongitude(Number.NaN)).toBe(false);
  });
});

describe("parseCoordinates", () => {
  it("reads a pair from strings, as a URL supplies them", () => {
    expect(parseCoordinates("26.9124", "75.7873")).toEqual({
      latitude: 26.9124,
      longitude: 75.7873,
    });
  });

  it("rounds to the precision the column stores", () => {
    // Decimal(9,6) is ~11 cm. Anything beyond it is noise, and an un-rounded
    // device coordinate in a shareable URL is a privacy leak (A-015).
    expect(parseCoordinates("26.91241234567", "75.78739876543")).toEqual({
      latitude: 26.912412,
      longitude: 75.787399,
    });
  });

  it("returns null rather than throwing on junk", () => {
    // A browsing surface must show results, not an error page.
    expect(parseCoordinates("abc", "75.7873")).toBeNull();
    expect(parseCoordinates("26.9124", "")).toBeNull();
    expect(parseCoordinates(undefined, undefined)).toBeNull();
  });

  it("rejects Null Island", () => {
    // 0,0 is in the Gulf of Guinea. It is far more often an uninitialised
    // variable than a real position, and honouring it sends the traveller
    // 6,000 km into the Atlantic.
    expect(parseCoordinates("0", "0")).toBeNull();
  });

  it("keeps a genuine zero on one axis", () => {
    // The equator and the prime meridian are real places; only the pair is suspect.
    expect(parseCoordinates("0", "75.7873")).not.toBeNull();
    expect(parseCoordinates("26.9124", "0")).not.toBeNull();
  });
});

describe("parseRadiusMetres", () => {
  it("converts kilometres to metres", () => {
    expect(parseRadiusMetres("25")).toBe(25_000);
  });

  it("falls back to the default when absent or unusable", () => {
    expect(parseRadiusMetres(undefined)).toBe(RADIUS_METRES.default);
    expect(parseRadiusMetres("")).toBe(RADIUS_METRES.default);
    expect(parseRadiusMetres("abc")).toBe(RADIUS_METRES.default);
    expect(parseRadiusMetres("-5")).toBe(RADIUS_METRES.default);
  });

  it("clamps rather than honouring an extreme radius", () => {
    // An unbounded radius is a full table scan wearing a filter's clothing.
    expect(parseRadiusMetres("100000")).toBe(RADIUS_METRES.max);
    expect(parseRadiusMetres("0.001")).toBe(RADIUS_METRES.min);
  });
});

describe("parseProximity", () => {
  it("builds a filter from a full set of inputs", () => {
    expect(parseProximity("26.9124", "75.7873", "10")).toEqual({
      latitude: 26.9124,
      longitude: 75.7873,
      radiusMetres: 10_000,
    });
  });

  it("drops the radius with the coordinates", () => {
    // A radius around nowhere is not a filter, it is a leftover parameter.
    expect(parseProximity(undefined, undefined, "10")).toBeNull();
  });

  it("supplies the default radius when only coordinates are given", () => {
    expect(parseProximity("26.9124", "75.7873", undefined)?.radiusMetres).toBe(
      RADIUS_METRES.default,
    );
  });
});

describe("formatDistance", () => {
  it("uses metres below a kilometre, rounded to ten", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(834)).toBe("830 m");
  });

  it("uses one decimal place up to ten kilometres", () => {
    expect(formatDistance(2_450)).toBe("2.5 km");
  });

  it("drops the decimal beyond ten kilometres", () => {
    // "12.7 km away" implies an accuracy a straight-line distance does not have.
    expect(formatDistance(12_700)).toBe("13 km");
  });

  it("returns null for absent or impossible input", () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(-1)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
  });
});
