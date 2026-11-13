import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ButlerDetoursDrawer } from "@/components/map/ButlerDetoursDrawer";
import { DigitalVipPass } from "@/components/journeys/DigitalVipPass";
import { LiveMapTracker } from "@/components/map/LiveMapTracker";
import {
  KEYWORD_REVEAL_RADIUS_METRES,
  STOP_ARRIVAL_RADIUS_METRES,
  haversineMetres,
  isKeywordRevealed,
  legFraction,
  type JourneyStop,
  type LatLng,
} from "@/components/map/live-map-tracking";
import { NotFoundError, ProviderUnavailableError, ValidationError } from "@/lib/errors";
import { chapterNumeral, departureStatus } from "@/modules/booking/journey-chapters";
import { JourneyPassService, type JourneyListing } from "@/modules/booking/journey-pass";
import type { JourneyPass } from "@/modules/booking/journey-pass-contract";
import {
  actDirectionsUrl,
  journeyPassEmailVariables,
  sendJourneyPassConfirmation,
} from "@/modules/booking/journey-pass-email";
import { findJourney } from "@/modules/journeys/data";
import { renderEmailTemplate } from "@/modules/notifications/email-templates";
import type { EmailMessage, EmailPort } from "@/ports/email";

const journey = findJourney("starlit-romance")!;

async function issuePass(holderName = "Aanya"): Promise<JourneyPass> {
  const live = new Map<string, JourneyListing>(
    journey.chapters.map((chapter) => [
      chapter.experienceSlug,
      {
        slug: chapter.experienceSlug,
        title: chapter.experienceTitle,
        basePriceMinor: chapter.priceMinor,
        currency: "INR",
        pricingUnit: "PER_PERSON",
        minGuests: 1,
        maxGuests: 8,
      },
    ]),
  );
  const service = new JourneyPassService({
    mode: "demo",
    findJourney,
    findListing: async (slug) => {
      const listing = live.get(slug);
      if (!listing) throw new NotFoundError("Not found");
      return listing;
    },
    signingKey: "k".repeat(64),
    now: () => new Date("2026-11-14T12:00:00Z"),
    random: (size) => new Uint8Array(size).fill(7),
  });
  return service.issue({ journeyId: journey.id, partySize: 2, holderName });
}

/** A point `metres` due north of `from`. */
function north(from: LatLng, metres: number): LatLng {
  return { lat: from.lat + metres / 111_320, lng: from.lng };
}

describe("chapter numbering", () => {
  it("numbers chapters in Roman numerals, then digits", () => {
    expect([0, 1, 2].map(chapterNumeral)).toEqual(["I", "II", "III"]);
    expect(chapterNumeral(10)).toBe("11");
  });

  it("names the first venue on the departure line", () => {
    expect(departureStatus("Sunset Terrace")).toBe("Ready to Depart · Chapter I Sunset Terrace");
  });
});

describe("keyword reveal radius", () => {
  const stop: LatLng = { lat: 18.5195, lng: 73.9312 };

  it("is 250 m, and wider than the radius that marks arrival", () => {
    expect(KEYWORD_REVEAL_RADIUS_METRES).toBe(250);
    expect(KEYWORD_REVEAL_RADIUS_METRES).toBeGreaterThan(STOP_ARRIVAL_RADIUS_METRES);
  });

  it("reveals within 250 m and not beyond", () => {
    expect(haversineMetres(north(stop, 240), stop)).toBeLessThan(250);
    expect(isKeywordRevealed(north(stop, 240), stop, false)).toBe(true);
    expect(isKeywordRevealed(north(stop, 260), stop, false)).toBe(false);
  });

  it("stays revealed once the act is reached, wherever the fix drifts", () => {
    expect(isKeywordRevealed(north(stop, 900), stop, true)).toBe(true);
  });
});

describe("leg progress", () => {
  it("runs from 0 at the leg's start to 1 at the door", () => {
    expect(legFraction(1_000, 1_000)).toBe(0);
    expect(legFraction(250, 1_000)).toBe(0.75);
    expect(legFraction(0, 1_000)).toBe(1);
  });

  it("clamps, and survives a zero-length leg", () => {
    expect(legFraction(1_200, 1_000)).toBe(0);
    expect(legFraction(-5, 1_000)).toBe(1);
    expect(legFraction(0, 0)).toBe(1);
    expect(legFraction(10, 0)).toBe(0);
    expect(legFraction(10, Number.NaN)).toBe(0);
  });
});

describe("journey pass confirmation email", () => {
  it("is built from the issued pass alone — route, keyword and reference", async () => {
    const pass = await issuePass();
    const variables = journeyPassEmailVariables(pass, "https://lavivenzia.com");

    expect(variables.secretKeyword).toBe(pass.secretKeyword);
    expect(variables.reference).toBe(pass.reference);
    expect(variables.simulated).toBe(true);
    expect(variables.acts).toHaveLength(pass.acts.length);
    expect(variables.acts[0]!.heading).toBe(`Chapter I · ${pass.acts[0]!.label}`);
    expect(variables.acts[0]!.title).toBe(pass.acts[0]!.title);
    expect(variables.acts[0]!.directionsUrl).toBe(actDirectionsUrl(pass.acts[0]!.coordinates));
    expect(variables.journeyUrl).toBe(`https://lavivenzia.com/journeys/${journey.id}`);
  });

  it("points directions at the act's stored pin", () => {
    const url = new URL(actDirectionsUrl({ lat: 18.5195, lng: 73.9312 }));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("query")).toBe("18.5195,73.9312");
  });

  it("renders the keyword, every act and the simulation notice", async () => {
    const pass = await issuePass();
    const rendered = renderEmailTemplate(
      "traveler.journey-pass-confirmation",
      journeyPassEmailVariables(pass, "https://lavivenzia.com"),
    );

    expect(rendered.subject).toContain(pass.reference);
    expect(rendered.subject).toContain("Simulated");
    for (const body of [rendered.text, rendered.html]) {
      expect(body).toContain(pass.secretKeyword);
      expect(body).toContain(pass.notice);
      for (const act of pass.acts) expect(body).toContain(act.label);
    }
    expect(rendered.text).not.toContain("<");
  });

  it("escapes the holder's name in the HTML body", async () => {
    const pass = await issuePass("<img src=x onerror=alert(1)>");
    const { html } = renderEmailTemplate(
      "traveler.journey-pass-confirmation",
      journeyPassEmailVariables(pass, "https://lavivenzia.com"),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("sends to the given address with the pass template", async () => {
    const pass = await issuePass();
    const send = vi.fn(async (_message: EmailMessage) => ({ providerMessageId: "m-1" }));
    const result = await sendJourneyPassConfirmation(
      { send },
      { to: "aanya@example.com", pass, appUrl: "https://lavivenzia.com" },
    );

    expect(result.providerMessageId).toBe("m-1");
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: "aanya@example.com",
      template: "traveler.journey-pass-confirmation",
    });
  });

  it("retries once on a transient provider failure", async () => {
    const pass = await issuePass();
    const send = vi
      .fn<EmailPort["send"]>()
      .mockRejectedValueOnce(new ProviderUnavailableError("busy"))
      .mockResolvedValueOnce({ providerMessageId: "m-2" });

    const result = await sendJourneyPassConfirmation(
      { send },
      { to: "a@example.com", pass, appUrl: "https://lavivenzia.com" },
    );
    expect(result.providerMessageId).toBe("m-2");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejection that repeating cannot fix", async () => {
    const pass = await issuePass();
    const send = vi.fn<EmailPort["send"]>().mockRejectedValue(new ValidationError("bad address"));

    await expect(
      sendJourneyPassConfirmation(
        { send },
        { to: "a@example.com", pass, appUrl: "https://lavivenzia.com" },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("Digital VIP Pass — begin evening journey", () => {
  it("offers the journey start and names the first chapter when wired", async () => {
    const pass = await issuePass();
    const html = renderToStaticMarkup(
      createElement(DigitalVipPass, { pass, onStartJourney: () => {} }),
    );

    expect(html).toContain("Begin Evening Journey");
    expect(html).toContain(departureStatus(pass.acts[0]!.title).replace("&", "&amp;"));
    expect(html).toContain("lv-gold-glow");
  });

  it("stays a plain pass without a start handler", async () => {
    const pass = await issuePass();
    const html = renderToStaticMarkup(createElement(DigitalVipPass, { pass }));

    expect(html).not.toContain("Begin Evening Journey");
    expect(html).not.toContain("Ready to Depart");
    expect(html).toContain(pass.secretKeyword);
  });
});

describe("Live map tracker — journey mode", () => {
  const stops: readonly JourneyStop[] = journey.chapters.map((chapter) => ({
    name: chapter.experienceTitle,
    role: chapter.label,
    coordinates: chapter.coordinates,
    address: chapter.addressLine,
    slug: chapter.experienceSlug,
  }));
  const first = stops[0]!;

  function render(origin: LatLng, extra: Record<string, unknown> = {}) {
    return renderToStaticMarkup(
      createElement(LiveMapTracker, {
        stops,
        journeyTitle: journey.title,
        fallbackOrigin: origin,
        onClose: () => {},
        allowSimulation: false,
        ...extra,
      }),
    );
  }

  it("shows the active chapter and leg progress", () => {
    const html = render(north(first.coordinates, 2_000));
    expect(html).toContain(`Chapter I · ${first.role}`);
    expect(html).toContain(`Leg 1 of ${stops.length}`);
    expect(html).toContain('role="progressbar"');
  });

  it("raises the keyword banner within 250 m of the act", () => {
    const html = render(north(first.coordinates, 200), { secretKeyword: "EMERALD BREEZE" });
    expect(html).toContain("You have arrived. State discreet keyword:");
    expect(html).toContain("EMERALD BREEZE");
  });

  it("keeps the keyword hidden while the act is still far off", () => {
    const html = render(north(first.coordinates, 1_500), { secretKeyword: "EMERALD BREEZE" });
    expect(html).not.toContain("EMERALD BREEZE");
  });

  it("offers Curated Nearby only for a booked journey", () => {
    const far = north(first.coordinates, 1_500);
    expect(render(far, { butlerDetours: true })).toContain("Curated Nearby");
    expect(render(far)).not.toContain("Curated Nearby");
  });

  it("marks an evening begun from the pass", () => {
    const far = north(first.coordinates, 1_500);
    expect(render(far, { navigating: true })).toContain("Evening Journey · Chapter I");
    expect(render(far)).not.toContain("Evening Journey · Chapter I");
  });
});

describe("Butler detours drawer", () => {
  it("opens in its loading state, labelled for the act", () => {
    const html = renderToStaticMarkup(
      createElement(ButlerDetoursDrawer, {
        activeSlug: "some-venue",
        actLabel: "Chapter II · Main Course",
        onClose: () => {},
      }),
    );
    expect(html).toContain("Butler Detours · Curated Nearby");
    expect(html).toContain("Around Chapter II · Main Course");
    expect(html).toContain('aria-busy="true"');
  });
});
