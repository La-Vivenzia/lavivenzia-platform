import { describe, expect, it } from "vitest";

import { createPilotDiscoveryRepository } from "@/adapters/persistence/prisma/pilot-discovery-fallback";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  COMPANION_LIMITS,
  CompanionService,
  describeJourney,
  zoneOf,
} from "@/modules/companion/service";
import type { CompanionCatalogue } from "@/modules/companion/ports";
import { DiscoveryService } from "@/modules/discovery/service";
import type { ExperienceDetail, ExperienceSummary } from "@/modules/discovery/ports";
import type { Page } from "@/modules/shared/pagination";
import type { EmailMessage, EmailPort } from "@/ports/email";

/**
 * The in-journey live butler. It must recommend only curated, published
 * listings within easy reach, choose what *complements* the current moment
 * rather than repeats it, and never send an email with nothing in it.
 */

function recordingEmail(): EmailPort & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
      return { providerMessageId: `msg-${sent.length}` };
    },
  };
}

const pilotCatalogue = new DiscoveryService({
  discovery: createPilotDiscoveryRepository((key) => key),
});

function service(catalogue: CompanionCatalogue = pilotCatalogue) {
  const email = recordingEmail();
  return {
    email,
    companion: new CompanionService({ catalogue, email, appUrl: "https://lavivenzia.test" }),
  };
}

const SMAAASH = "smaaash-vr-twilight-bowling-amanora";
const TOIT = "toit-brewery-craft-beer-tasting-kalyani-viman";
const SPA = "o2-spa-aromatherapy-and-reflexology-seasons";

describe("describeJourney", () => {
  it("walks short distances and drives longer ones", () => {
    expect(describeJourney(450)).toEqual({
      mode: "walk",
      minutes: 6,
      label: "~6-min walk · 450 m",
    });
    expect(describeJourney(2_100)).toEqual({
      mode: "drive",
      minutes: 9,
      label: "~9-min drive · 2.1 km",
    });
  });

  it("never claims a zero-minute journey", () => {
    expect(describeJourney(5).minutes).toBe(1);
  });
});

describe("zoneOf", () => {
  it("names the neighbourhood from the listing's own address", () => {
    expect(
      zoneOf({ addressLine: "Metro Station Road, Kalyani Nagar", title: "Toit", city: "Pune" }),
    ).toBe("Kalyani Nagar");
    expect(zoneOf({ addressLine: "Level 1, Seasons Mall", title: "Spa", city: "Pune" })).toBe(
      "Magarpatta",
    );
    expect(zoneOf({ addressLine: null, title: "Somewhere", city: "Pune" })).toBe("Pune");
  });
});

describe("CompanionService.getInJourneyRecommendations", () => {
  it("recommends curated listings within reach, never the active one", async () => {
    const { companion } = service();
    const result = await companion.getInJourneyRecommendations({
      activeExperienceSlug: SMAAASH,
    });

    expect(result.recommendations).toHaveLength(2);
    for (const recommendation of result.recommendations) {
      expect(recommendation.slug).not.toBe(SMAAASH);
      expect(recommendation.distanceMetres).toBeLessThanOrEqual(COMPANION_LIMITS.radiusMetres);
      expect(recommendation.vipPerk.length).toBeGreaterThan(0);
      expect(recommendation.curatorSecret.length).toBeGreaterThan(0);
      expect(recommendation.experienceUrl).toBe(
        `https://lavivenzia.test/experiences/${recommendation.slug}`,
      );
    }
    expect(result.active.zone).toBe("Amanora");
  });

  it("offers two different ideas, not two of the same", async () => {
    const { companion } = service();
    const result = await companion.getInJourneyRecommendations({ activeExperienceSlug: SPA });

    const tracks = result.recommendations.map((recommendation) => recommendation.track);
    expect(new Set(tracks).size).toBe(tracks.length);
  });

  it("follows an adrenaline hour with a slower table, not more adrenaline", async () => {
    const { companion } = service();
    const result = await companion.getInJourneyRecommendations({
      activeExperienceSlug: SMAAASH,
    });

    expect(result.recommendations[0]!.track).toBe("CONNOISSEUR");
    expect(result.recommendations.map((r) => r.track)).not.toContain("HIGH_OCTANE_NIGHTLIFE");
  });

  it("follows a spa with coffee or calm rather than a nightclub", async () => {
    const { companion } = service();
    const result = await companion.getInJourneyRecommendations({ activeExperienceSlug: SPA });

    expect(result.recommendations[0]!.track).toBe("ARTISANAL_FOCUS");
  });

  it("bounds the number of recommendations", async () => {
    const { companion } = service();
    const many = await companion.getInJourneyRecommendations({
      activeExperienceSlug: SMAAASH,
      limit: 50,
    });
    const few = await companion.getInJourneyRecommendations({
      activeExperienceSlug: SMAAASH,
      limit: 0,
    });

    expect(many.recommendations).toHaveLength(COMPANION_LIMITS.maxRecommendations);
    expect(few.recommendations).toHaveLength(1);
  });

  it("writes a personal note from the facts it recommends", async () => {
    const { companion } = service();
    const result = await companion.getInJourneyRecommendations({
      activeExperienceSlug: TOIT,
      patronName: "  Asha  ",
    });
    const [first] = result.recommendations;

    expect(result.patronName).toBe("Asha");
    expect(result.butlerNote).toMatch(/^Asha, you’re at Toit Brewery in Kalyani Nagar\./);
    expect(result.butlerNote).toContain(`${first!.minutes}-minute ${first!.mode} away`);
    expect(result.butlerNote).toContain("One tap reserves your pass");
  });

  it("acknowledges taste only when a recommendation reflects it", async () => {
    const { companion } = service();
    const calm = await companion.getInJourneyRecommendations({
      activeExperienceSlug: SPA,
      tastePreferences: { dietary: [], vibes: ["culinary_tastings"], clusters: [] },
    });
    const none = await companion.getInJourneyRecommendations({ activeExperienceSlug: SPA });

    expect(calm.butlerNote).toContain("penchant for culinary tastings");
    expect(none.butlerNote).not.toContain("penchant");
  });

  it("rejects an unknown or unpublished experience as not found", async () => {
    const { companion } = service();
    await expect(
      companion.getInJourneyRecommendations({ activeExperienceSlug: "no-such-place" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to curate around an experience with no location", async () => {
    const detail = (await pilotCatalogue.getExperience(SPA)) as ExperienceDetail;
    const { companion } = service({
      getExperience: async () => ({ ...detail, latitude: null, longitude: null }),
      browse: pilotCatalogue.browse.bind(pilotCatalogue),
    });

    await expect(
      companion.getInJourneyRecommendations({ activeExperienceSlug: SPA }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("skips listings without curation or beyond the radius", async () => {
    const detail = await pilotCatalogue.getExperience(SPA);
    const near = (await pilotCatalogue.browse({
      near: { latitude: detail.latitude!, longitude: detail.longitude!, radiusMetres: 2_500 },
      sort: "distance",
      page: 1,
      pageSize: 50,
    })) as Page<ExperienceSummary>;
    const [a, b] = near.items.filter((item) => item.slug !== SPA);

    const { companion } = service({
      getExperience: async () => detail,
      browse: async () =>
        ({
          ...near,
          items: [
            { ...a!, curation: null },
            { ...b!, distanceMetres: 9_000 },
          ],
        }) as Page<ExperienceSummary>,
    });

    const result = await companion.getInJourneyRecommendations({ activeExperienceSlug: SPA });
    expect(result.recommendations).toEqual([]);
  });
});

describe("CompanionService.dispatch", () => {
  it("sends one companion email and returns the provider id", async () => {
    const { companion, email } = service();
    const result = await companion.dispatch({
      to: "traveller@example.test",
      activeExperienceSlug: TOIT,
      patronName: "Asha",
    });

    expect(result.providerMessageId).toBe("msg-1");
    expect(email.sent).toHaveLength(1);

    const [message] = email.sent;
    expect(message!.to).toBe("traveller@example.test");
    expect(message!.template).toBe("traveler.in-journey-companion");
    if (message!.template !== "traveler.in-journey-companion") throw new Error("wrong template");
    expect(message!.variables).toMatchObject({
      patronName: "Asha",
      activeVenueTitle: "Toit Brewery",
      activeZone: "Kalyani Nagar",
      butlerNote: result.butlerNote,
    });
    expect(message!.variables.recommendations).toHaveLength(result.recommendations.length);
  });

  it("sends nothing when nothing curated is within reach", async () => {
    const detail = await pilotCatalogue.getExperience(SPA);
    const { companion, email } = service({
      getExperience: async () => detail,
      browse: async () =>
        ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 1 }) as Page<ExperienceSummary>,
    });

    await expect(
      companion.dispatch({ to: "traveller@example.test", activeExperienceSlug: SPA }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(email.sent).toHaveLength(0);
  });

  it("lets a provider failure reach the caller rather than reporting a send", async () => {
    const companion = new CompanionService({
      catalogue: pilotCatalogue,
      appUrl: "https://lavivenzia.test",
      email: {
        send: async () => {
          throw new Error("provider down");
        },
      },
    });

    await expect(
      companion.dispatch({ to: "traveller@example.test", activeExperienceSlug: TOIT }),
    ).rejects.toThrow("provider down");
  });
});
