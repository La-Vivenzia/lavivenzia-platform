import { describe, expect, it } from "vitest";
import { DISCOVERY_LIMITS, isSortOption, parseFilters } from "@/modules/discovery/service";
import { SORT_OPTIONS } from "@/modules/discovery/ports";
import { MAX_PAGE_SIZE, PAGE_SIZE, normalisePaging, toPage } from "@/modules/shared/pagination";

/**
 * Filter parsing is the only place traveller-supplied input reaches the
 * discovery query, so it is where the input hygiene lives.
 *
 * The governing rule: **malformed input is dropped, not rejected.** A browsing
 * surface should show experiences to someone who arrived on a mangled link, not
 * an error page. Nothing here can widen what is visible — the status filter is
 * fixed in the repository — so dropping is safe as well as friendly.
 */

describe("parseFilters — defaults", () => {
  it("defaults to the first page, standard size, most recent", () => {
    expect(parseFilters({})).toEqual({ page: 1, pageSize: PAGE_SIZE, sort: "recent" });
  });

  it("omits every filter that was not supplied", () => {
    const filters = parseFilters({});
    expect(filters.search).toBeUndefined();
    expect(filters.categoryKey).toBeUndefined();
    expect(filters.destinationSlug).toBeUndefined();
    expect(filters.minPriceMinor).toBeUndefined();
    expect(filters.maxPriceMinor).toBeUndefined();
  });

  it("treats an empty string as absent rather than as a filter", () => {
    // Submitting the form with everything blank must not filter to nothing.
    const filters = parseFilters({ search: "", category: "", destination: "", minPrice: "" });
    expect(filters.search).toBeUndefined();
    expect(filters.categoryKey).toBeUndefined();
    expect(filters.minPriceMinor).toBeUndefined();
  });
});

describe("parseFilters — hostile and malformed input", () => {
  it("ignores an unrecognised sort rather than erroring", () => {
    expect(parseFilters({ sort: "; DROP TABLE experiences" }).sort).toBe("recent");
    expect(parseFilters({ sort: "priceASC" }).sort).toBe("recent");
    expect(parseFilters({ sort: "" }).sort).toBe("recent");
  });

  it("falls back when a sort is asked for without the input it needs", () => {
    // A hand-edited or stale link, not an error. Ordering by a relevance score
    // with nothing to score against would be an arbitrary order presented as a
    // ranking, which is worse than admitting there is no ranking.
    expect(parseFilters({ sort: "relevance" }).sort).toBe("recent");
    expect(parseFilters({ sort: "distance" }).sort).toBe("recent");
    // A radius without coordinates is not a location.
    expect(parseFilters({ sort: "distance", radiusKm: "25" }).sort).toBe("recent");
  });

  it("accepts every published sort option, given the input that option needs", () => {
    // `relevance` needs a term to score against and `distance` needs a point to
    // measure from. Supplied here so the loop tests acceptance rather than the
    // fallback, which has its own tests below.
    const inputs = {
      search: "pottery",
      lat: "26.9124",
      lng: "75.7873",
    } as const;

    for (const option of SORT_OPTIONS) {
      expect(parseFilters({ ...inputs, sort: option }).sort).toBe(option);
    }
  });

  it("drops a non-numeric price instead of passing it through", () => {
    expect(parseFilters({ minPrice: "free" }).minPriceMinor).toBeUndefined();
    expect(parseFilters({ maxPrice: "1e999" }).maxPriceMinor).toBeUndefined();
    expect(parseFilters({ minPrice: "NaN" }).minPriceMinor).toBeUndefined();
    expect(parseFilters({ maxPrice: "Infinity" }).maxPriceMinor).toBeUndefined();
  });

  it("drops a negative price", () => {
    expect(parseFilters({ minPrice: "-500" }).minPriceMinor).toBeUndefined();
  });

  it("accepts a fractional major amount and rounds to the nearest minor unit", () => {
    // The field holds rupees, so 12.50 is a legitimate thing to type.
    expect(parseFilters({ minPrice: "12.50" }).minPriceMinor).toBe(1250);
  });

  it("caps an absurd price rather than sending it to the database", () => {
    expect(parseFilters({ maxPrice: "999999999999999" }).maxPriceMinor).toBe(
      DISCOVERY_LIMITS.price.max,
    );
  });

  it("reads the same parameter identically however it arrived", () => {
    // The page and the API both hand the raw query value to parseFilters. This
    // is the assertion that keeps them from drifting apart again.
    expect(parseFilters({ minPrice: "4500" }).minPriceMinor).toBe(450_000);
  });

  it("caps an absurd duration", () => {
    expect(parseFilters({ maxDuration: "99999999" }).maxDurationMinutes).toBe(
      DISCOVERY_LIMITS.duration.max,
    );
  });

  it("truncates an oversized search term", () => {
    // The term becomes an ILIKE pattern; unbounded input is a cheap way to make
    // the database work hard on every keystroke.
    const filters = parseFilters({ search: "x".repeat(5000) });
    expect(filters.search?.length).toBe(DISCOVERY_LIMITS.search.max);
  });

  it("trims a search term", () => {
    expect(parseFilters({ search: "  chettinad  " }).search).toBe("chettinad");
  });

  it("keeps a search term containing SQL as literal text", () => {
    // Prisma parameterises; the term is data, never a fragment. Asserted so a
    // future hand-written query cannot quietly change that.
    const term = "'; DROP TABLE experiences; --";
    expect(parseFilters({ search: term }).search).toBe(term);
  });

  it("survives a page number that is junk", () => {
    for (const page of ["0", "-3", "abc", "1.5", ""]) {
      expect(parseFilters({ page }).page).toBe(1);
    }
  });

  it("caps the page number rather than producing an enormous offset", () => {
    expect(parseFilters({ page: "999999999" }).page).toBe(100_000);
  });
});

describe("parseFilters — price range", () => {
  it("reads the query string as major units and returns minor units", () => {
    // A person searching under ₹500 types 500. The domain only ever handles
    // integer minor units, and this boundary is where the two meet.
    const filters = parseFilters({ minPrice: "100", maxPrice: "500" });
    expect(filters.minPriceMinor).toBe(10_000);
    expect(filters.maxPriceMinor).toBe(50_000);
  });

  it("swaps an inverted range rather than matching nothing", () => {
    // min above max matches zero rows, which reads to a traveller as a broken
    // site. Swapping is friendlier and cannot mislead.
    const filters = parseFilters({ minPrice: "500", maxPrice: "100" });
    expect(filters.minPriceMinor).toBe(10_000);
    expect(filters.maxPriceMinor).toBe(50_000);
  });

  it("accepts a lone bound on either side", () => {
    expect(parseFilters({ minPrice: "100" }).maxPriceMinor).toBeUndefined();
    expect(parseFilters({ maxPrice: "100" }).minPriceMinor).toBeUndefined();
  });

  it("accepts zero as a real lower bound", () => {
    // Free experiences exist; 0 must not be read as "not supplied".
    expect(parseFilters({ minPrice: "0" }).minPriceMinor).toBe(0);
  });
});

describe("parseFilters — no status escape hatch", () => {
  it("has no way to ask for an unpublished listing", () => {
    // The whole security posture of the public surface. `parseFilters` returns
    // a typed object with no status field, so even a request naming one cannot
    // reach the query.
    const filters = parseFilters({
      ...({ status: "DRAFT", published: "false" } as Record<string, string>),
    });

    expect("status" in filters).toBe(false);
    expect(Object.keys(filters).sort()).toEqual(["page", "pageSize", "sort"]);
  });
});

describe("parseFilters — the sort a query implies", () => {
  it("ranks by relevance when a term is given and no sort is", () => {
    // Someone who typed a search meant "best match". Publication order would
    // bury the exact title they typed under whatever was approved most recently.
    expect(parseFilters({ search: "pottery" }).sort).toBe("relevance");
  });

  it("ranks by distance when a location is given and no sort is", () => {
    expect(parseFilters({ lat: "26.9124", lng: "75.7873" }).sort).toBe("distance");
  });

  it("prefers relevance over distance when both are given", () => {
    // The words are the stronger statement of intent; distance still shapes the
    // result set through the radius filter.
    expect(parseFilters({ search: "pottery", lat: "26.9124", lng: "75.7873" }).sort).toBe(
      "relevance",
    );
  });

  it("keeps an explicit choice over the implied one", () => {
    expect(parseFilters({ search: "pottery", sort: "price_asc" }).sort).toBe("price_asc");
  });

  it("still defaults to most recent for undirected browsing", () => {
    expect(parseFilters({}).sort).toBe("recent");
    expect(parseFilters({ category: "culinary" }).sort).toBe("recent");
  });
});

describe("parseFilters — location", () => {
  it("builds a proximity filter from coordinates and a radius", () => {
    expect(parseFilters({ lat: "26.9124", lng: "75.7873", radiusKm: "10" }).near).toEqual({
      latitude: 26.9124,
      longitude: 75.7873,
      radiusMetres: 10_000,
    });
  });

  it("drops a malformed coordinate rather than failing the request", () => {
    expect(parseFilters({ lat: "north", lng: "75.7873" }).near).toBeUndefined();
    expect(parseFilters({ lat: "999", lng: "75.7873" }).near).toBeUndefined();
  });

  it("omits the location entirely when none was given", () => {
    expect("near" in parseFilters({})).toBe(false);
  });
});

describe("isSortOption", () => {
  it("narrows only the published options", () => {
    expect(isSortOption("recent")).toBe(true);
    expect(isSortOption("price_asc")).toBe(true);
    expect(isSortOption("random")).toBe(false);
    // Must not be fooled by inherited properties.
    expect(isSortOption("toString")).toBe(false);
  });
});

describe("shared pagination", () => {
  it("clamps an oversized page size", () => {
    expect(normalisePaging({ pageSize: 10_000 }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("rejects a fractional page, which would produce a fractional offset", () => {
    expect(normalisePaging({ page: 2.5 }).page).toBe(1);
  });

  it("builds a page whose totals agree", () => {
    const page = toPage(["a", "b"], 5, { page: 1, pageSize: 2 });
    expect(page).toEqual({ items: ["a", "b"], total: 5, page: 1, pageSize: 2, totalPages: 3 });
  });

  it("reports at least one page when nothing matched", () => {
    // Otherwise the UI renders "page 1 of 0".
    expect(toPage([], 0, { page: 1, pageSize: 20 }).totalPages).toBe(1);
  });
});
