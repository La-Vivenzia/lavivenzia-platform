import { beforeEach, describe, expect, it, vi } from "vitest";

import { PILOT_EXPERIENCES, type PilotExperienceInput } from "@/data/pune-pilot";
import type { CheckoutMode } from "@/modules/booking/contract";
import {
  PREMIUM_RATING_FLOOR,
  TRIP_PARTY_MAX,
  TripDefinitionError,
  filterTripsByRating,
  listTrips,
  resolveTrips,
  type Trip,
} from "@/modules/trips/data";
import {
  SIMULATED_LINE_STATUS,
  SIMULATION_NOTICE,
  simulateTripBooking,
} from "@/modules/trips/simulate";

// The routes reach the container and the rate limiter; neither is under test.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789012345678901234567890123456789012345678901234567890123";
const checkout = vi.hoisted(() => ({ mode: "demo" as CheckoutMode }));
vi.mock("@/lib/container", () => ({ getCheckoutService: () => ({ mode: checkout.mode }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceIpRateLimit: vi.fn(async () => undefined) }));

const catalogue = new Map(PILOT_EXPERIENCES.map((listing) => [listing.slug, listing]));
const fixedBytes = (size: number) => new Uint8Array(size).map((_, index) => index * 7);

function allScores(trip: Trip): number[] {
  return [
    trip.stay.curation.score,
    ...trip.days.flatMap((plan) => plan.lines.map((line) => line.curation.score)),
  ];
}

describe("curated trips — definitions", () => {
  const trips = listTrips();

  it("defines the three launch trips", () => {
    expect(trips.map((trip) => trip.title)).toEqual([
      "The 48-Hour Mulshi Rainforest & Adventure Retreat",
      "The East Pune High-Octane & Nightlife Sprint",
      "The Pawna Stargazing & Acoustic Glamping Escape",
    ]);
    expect(new Set(trips.map((trip) => trip.id)).size).toBe(trips.length);
  });

  it("gives every trip a stay and a day 1 and day 2 timeline", () => {
    for (const trip of trips) {
      expect(trip.stay.nights).toBe(1);
      expect(trip.days.map((plan) => plan.day)).toEqual([1, 2]);
      for (const plan of trip.days) expect(plan.lines.length).toBeGreaterThan(0);
    }
  });

  it("orders each day without overlaps, inside the day", () => {
    for (const trip of trips) {
      for (const plan of trip.days) {
        plan.lines.forEach((line, index) => {
          expect(line.day).toBe(plan.day);
          expect(line.endMinute).toBe(line.startMinute + line.durationMinutes);
          expect(line.endMinute).toBeLessThanOrEqual(24 * 60);
          const previous = plan.lines[index - 1];
          if (previous) expect(line.startMinute).toBeGreaterThanOrEqual(previous.endMinute);
        });
      }
    }
  });

  it("starts day 1 after check-in and never runs a day 2 line across check-out", () => {
    for (const trip of trips) {
      const [day1, day2] = trip.days;
      expect(day1.lines[0]!.startMinute).toBeGreaterThanOrEqual(trip.stay.checkInMinute);
      for (const line of day2.lines) {
        const across =
          line.startMinute < trip.stay.checkOutMinute && line.endMinute > trip.stay.checkOutMinute;
        expect(across).toBe(false);
      }
    }
  });

  it("uses the requested stays and experiences", () => {
    const shape = Object.fromEntries(
      trips.map((trip) => [
        trip.id,
        [trip.stay.title, ...trip.days.flatMap((plan) => plan.lines.map((line) => line.title))],
      ]),
    );
    expect(shape).toEqual({
      "mulshi-rainforest-retreat": [
        "Hillside Glass Villa",
        "Sunset Pottery Masterclass",
        "Vineyard Farm Dinner",
        "Private Guided Lake Kayaking",
      ],
      "east-pune-nightlife-sprint": [
        "Amanora Luxury Suite",
        catalogue.get("smaaash-vr-twilight-bowling-amanora")!.title,
        catalogue.get("spice-factory-rooftop-cocktails-hadapsar")!.title,
        catalogue.get("effingut-brewhouse-craft-tasting-seasons")!.title,
      ],
      "pawna-stargazing-glamping": [
        "Luxury Dome Glamping",
        "Acoustic Barbecue by the Lake",
        "Telescope Stargazing Session",
        "Morning Fort Trek",
      ],
    });
  });

  it("copies listing lines from the catalogue and marks everything else indicative", () => {
    for (const trip of trips) {
      expect(trip.stay.priceBasis).toBe("indicative");
      for (const line of trip.days.flatMap((plan) => plan.lines)) {
        if (line.experienceSlug) {
          const listing = catalogue.get(line.experienceSlug)!;
          expect(line.priceBasis).toBe("listing");
          expect(line.priceMinor).toBe(listing.basePriceMinor);
          expect(line.durationMinutes).toBe(listing.durationMinutes);
          expect(line.title).toBe(listing.title);
        } else {
          expect(line.priceBasis).toBe("indicative");
        }
      }
      expect(trip.hasIndicativePricing).toBe(true);
    }
  });

  it("sums the per-person price from the stay and every line", () => {
    for (const trip of trips) {
      const lines = trip.days.flatMap((plan) => plan.lines);
      expect(trip.perPersonPriceMinor).toBe(
        trip.stay.priceMinor + lines.reduce((sum, line) => sum + line.priceMinor, 0),
      );
      expect(Number.isInteger(trip.perPersonPriceMinor)).toBe(true);
    }
  });

  it("caps the party at the smallest listing maximum", () => {
    const sprint = trips.find((trip) => trip.id === "east-pune-nightlife-sprint")!;
    const listingMax = Math.min(
      ...sprint.days
        .flatMap((plan) => plan.lines)
        .map((line) => catalogue.get(line.experienceSlug!)!.maxGuests),
    );
    expect(sprint.maxPartySize).toBe(Math.min(TRIP_PARTY_MAX, listingMax));
  });

  it("refuses a trip that names a listing missing from the catalogue", () => {
    const withoutSmaaash: PilotExperienceInput[] = PILOT_EXPERIENCES.filter(
      (listing) => listing.slug !== "smaaash-vr-twilight-bowling-amanora",
    );
    expect(() => resolveTrips(withoutSmaaash)).toThrow(TripDefinitionError);
  });

  it("refuses a group-priced listing it cannot sum per person", () => {
    const grouped = PILOT_EXPERIENCES.map((listing) =>
      listing.slug === "effingut-brewhouse-craft-tasting-seasons"
        ? { ...listing, pricingUnit: "PER_GROUP" as const }
        : listing,
    );
    expect(() => resolveTrips(grouped)).toThrow(/not priced per person/);
  });

  it("refuses a listing whose new duration would overlap the next line", () => {
    const longer = PILOT_EXPERIENCES.map((listing) =>
      listing.slug === "smaaash-vr-twilight-bowling-amanora"
        ? { ...listing, durationMinutes: 6 * 60 }
        : listing,
    );
    expect(() => resolveTrips(longer)).toThrow(/starts before/);
  });
});

describe("curated trips — curator scores", () => {
  const trips = listTrips();

  it("puts every stay and line at or above the premium floor", () => {
    expect(PREMIUM_RATING_FLOOR).toBe(4.8);
    for (const trip of trips) {
      for (const score of allScores(trip)) {
        expect(score).toBeGreaterThanOrEqual(PREMIUM_RATING_FLOOR);
        expect(score).toBeLessThanOrEqual(5);
      }
      expect(trip.minCuratorScore).toBe(Math.min(...allScores(trip)));
    }
  });

  it("gives every score a curator note", () => {
    for (const trip of trips) {
      expect(trip.stay.curation.note.trim()).not.toBe("");
      for (const line of trip.days.flatMap((plan) => plan.lines)) {
        expect(line.curation.note.trim()).not.toBe("");
      }
    }
  });

  it("ships every score as provisional until a curator signs it off", () => {
    for (const trip of trips) {
      expect(trip.stay.curation.verified).toBe(false);
      expect(trip.fullyVerified).toBe(false);
    }
  });

  it("keeps all trips at the default floor and drops them above it", () => {
    expect(filterTripsByRating(trips)).toHaveLength(3);
    expect(filterTripsByRating(trips, { minScore: 4.85 }).map((trip) => trip.id)).toEqual([]);
    expect(filterTripsByRating(trips, { minScore: 5 })).toEqual([]);
  });

  it("returns nothing for verified-only while every score is provisional", () => {
    expect(filterTripsByRating(trips, { verifiedOnly: true })).toEqual([]);
  });

  it("filters on the weakest line, not the average", () => {
    const [first] = trips;
    const weak: Trip = { ...first!, minCuratorScore: 4.2 };
    expect(filterTripsByRating([weak, ...trips.slice(1)]).map((trip) => trip.id)).toEqual(
      trips.slice(1).map((trip) => trip.id),
    );
  });
});

describe("simulated trip booking — domain", () => {
  const deps = {
    mode: "demo" as const,
    now: () => new Date("2026-10-30T10:00:00.000Z"),
    random: fixedBytes,
  };

  it("prices every line for the party and charges nothing", () => {
    const trip = listTrips()[0]!;
    const booking = simulateTripBooking({ tripId: trip.id, partySize: 3 }, deps);

    expect(booking.simulated).toBe(true);
    expect(booking.payment.provider).toBe("none");
    expect(booking.payment.status).toBe("SIMULATED");
    expect(booking.payment.chargedMinor).toBe(0);
    expect(booking.payment.amountMinor).toBe(trip.perPersonPriceMinor * 3);
    expect(booking.payment.currency).toBe("INR");
    expect(booking.notice).toBe(SIMULATION_NOTICE);
    expect(booking.issuedAt).toBe("2026-10-30T10:00:00.000Z");
  });

  it("pre-books the stay and every sub-experience", () => {
    const trip = listTrips()[1]!;
    const booking = simulateTripBooking({ tripId: trip.id, partySize: 2 }, deps);
    const lineCount = trip.days.reduce((sum, plan) => sum + plan.lines.length, 0);

    expect(booking.lines).toHaveLength(lineCount + 1);
    expect(booking.lines[0]!.kind).toBe("stay");
    for (const line of booking.lines) {
      expect(line.status).toBe(SIMULATED_LINE_STATUS);
      expect(line.quantity).toBe(2);
      expect(line.totalMinor).toBe(line.unitPriceMinor * 2);
    }
  });

  it("issues a DEMO reference, a simulated transaction id and a scannable QR", () => {
    const booking = simulateTripBooking({ tripId: listTrips()[2]!.id, partySize: 1 }, deps);

    expect(booking.bookingReference).toMatch(/^DEMO-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(booking.payment.transactionId).toMatch(/^SIMTXN-[0-9A-F]{12}$/);
    expect(booking.voucher.payload).toContain(`ref=${booking.bookingReference}`);
    expect(booking.voucher.payload).toContain("simulated=1");
    expect(booking.voucher.qrDataUri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(booking.voucher.qrDataUri.split(",")[1]!, "base64").toString("utf8");
    expect(svg).toContain("<svg");
  });

  it("refuses while checkout is off", () => {
    expect(() =>
      simulateTripBooking({ tripId: listTrips()[0]!.id, partySize: 2 }, { ...deps, mode: "off" }),
    ).toThrow(/not open/);
  });

  it("refuses an unknown trip and a party outside the trip's limits", () => {
    expect(() => simulateTripBooking({ tripId: "nowhere", partySize: 2 }, deps)).toThrow(
      /does not exist/,
    );
    const trip = listTrips()[0]!;
    expect(() => simulateTripBooking({ tripId: trip.id, partySize: 0 }, deps)).toThrow();
    expect(() =>
      simulateTripBooking({ tripId: trip.id, partySize: trip.maxPartySize + 1 }, deps),
    ).toThrow(/travellers/);
  });
});

describe("trips API routes", () => {
  beforeEach(() => {
    checkout.mode = "demo";
  });

  const post = (body: unknown) =>
    new Request("http://localhost/api/v1/trips/simulate-book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("GET /api/v1/trips lists the trips at the premium floor", async () => {
    const { GET } = await import("@/app/api/v1/trips/route");
    const response = await GET(new Request("http://localhost/api/v1/trips"), undefined);
    const body = (await response.json()) as { trips: Trip[] };

    expect(response.status).toBe(200);
    expect(body.trips.map((trip) => trip.id)).toEqual(listTrips().map((trip) => trip.id));
  });

  it("GET /api/v1/trips honours minRating and verifiedOnly", async () => {
    const { GET } = await import("@/app/api/v1/trips/route");
    const strict = await GET(new Request("http://localhost/api/v1/trips?minRating=4.9"), undefined);
    expect(((await strict.json()) as { trips: Trip[] }).trips).toEqual([]);

    const verified = await GET(
      new Request("http://localhost/api/v1/trips?verifiedOnly=true"),
      undefined,
    );
    expect(((await verified.json()) as { trips: Trip[] }).trips).toEqual([]);

    const invalid = await GET(new Request("http://localhost/api/v1/trips?minRating=9"), undefined);
    expect(invalid.status).toBe(400);
  });

  it("POST simulate-book returns a simulated booking priced by the server", async () => {
    const { POST } = await import("@/app/api/v1/trips/simulate-book/route");
    const trip = listTrips()[0]!;
    // A client-sent price is not part of the contract and must not be honoured.
    const response = await POST(post({ tripId: trip.id, partySize: 2, amountMinor: 1 }), undefined);
    const body = (await response.json()) as ReturnType<typeof simulateTripBooking>;

    expect(response.status).toBe(201);
    expect(body.simulated).toBe(true);
    expect(body.payment.amountMinor).toBe(trip.perPersonPriceMinor * 2);
    expect(body.payment.chargedMinor).toBe(0);
    expect(body.lines.every((line) => line.status === SIMULATED_LINE_STATUS)).toBe(true);
  });

  it("POST simulate-book is closed when checkout is off", async () => {
    checkout.mode = "off";
    const { POST } = await import("@/app/api/v1/trips/simulate-book/route");
    const response = await POST(post({ tripId: listTrips()[0]!.id, partySize: 2 }), undefined);

    expect(response.status).toBe(409);
  });

  it("POST simulate-book rejects bad input and unknown trips", async () => {
    const { POST } = await import("@/app/api/v1/trips/simulate-book/route");

    expect((await POST(post({ tripId: listTrips()[0]!.id, partySize: 99 }), undefined)).status).toBe(
      400,
    );
    expect((await POST(post({ partySize: 2 }), undefined)).status).toBe(400);
    expect((await POST(post({ tripId: "nowhere", partySize: 2 }), undefined)).status).toBe(404);
  });
});
