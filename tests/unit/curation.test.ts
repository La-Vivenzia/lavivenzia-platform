import { describe, expect, it } from "vitest";

import { createPilotDiscoveryRepository } from "@/adapters/persistence/prisma/pilot-discovery-fallback";
import { PILOT_EXPERIENCES, pilotCurationFor } from "@/data/pune-pilot";
import { CURATION_TRACKS, isCurationTrack, timeSavedLabel } from "@/modules/discovery/curation";
import { parseFilters } from "@/modules/discovery/service";

/**
 * The editorial layer. Curation is what a traveller is promised when they book
 * through us instead of walking in, so a listing with a blank perk or an
 * absurd time-saved figure is a broken promise, not a cosmetic gap.
 */

describe("pilot curation data", () => {
  it("curates every pilot listing", () => {
    expect(PILOT_EXPERIENCES).toHaveLength(19);
    for (const experience of PILOT_EXPERIENCES) {
      expect(experience.curation, experience.slug).toBeDefined();
    }
  });

  it("gives every listing concrete perks, a secret and a plausible time saved", () => {
    for (const { slug, curation } of PILOT_EXPERIENCES) {
      expect(curation.vipPerks.length, slug).toBeGreaterThanOrEqual(1);
      expect(curation.vipPerks.length, slug).toBeLessThanOrEqual(4);
      for (const perk of curation.vipPerks) expect(perk.trim().length, slug).toBeGreaterThan(10);
      expect(curation.curatorSecret.trim().length, slug).toBeGreaterThan(40);
      expect(Number.isInteger(curation.timeSavedMinutes), slug).toBe(true);
      expect(curation.timeSavedMinutes, slug).toBeGreaterThan(0);
      expect(curation.timeSavedMinutes, slug).toBeLessThanOrEqual(120);
      expect(isCurationTrack(curation.curationTrack), slug).toBe(true);
      if (curation.curatedPairing !== undefined) {
        expect(curation.curatedPairing.trim().length, slug).toBeGreaterThan(10);
      }
    }
  });

  it("never repeats a perk or a secret across listings", () => {
    // Copy-pasted curation is exactly the generic directory feel it exists to replace.
    const secrets = PILOT_EXPERIENCES.map((experience) => experience.curation.curatorSecret);
    expect(new Set(secrets).size).toBe(secrets.length);
  });

  it("covers every mood track, so contrasting tracks can always be offered", () => {
    const used = new Set(PILOT_EXPERIENCES.map((experience) => experience.curation.curationTrack));
    expect([...used].sort()).toEqual([...CURATION_TRACKS].sort());
  });

  it("looks curation up by slug and reports an uncurated listing as null", () => {
    const toit = PILOT_EXPERIENCES.find((experience) => experience.slug.startsWith("toit"))!;
    expect(pilotCurationFor(toit.slug)).toBe(toit.curation);
    expect(pilotCurationFor("a-host-created-listing")).toBeNull();
  });
});

describe("timeSavedLabel", () => {
  it("states minutes, and hours past the hour", () => {
    expect(timeSavedLabel(45)).toBe("Saves ~45 min of research and queueing");
    expect(timeSavedLabel(60)).toBe("Saves ~1 h of research and queueing");
    expect(timeSavedLabel(75)).toBe("Saves ~1 h 15 min of research and queueing");
  });

  it("claims nothing for a zero or nonsensical figure", () => {
    expect(timeSavedLabel(0)).toBeNull();
    expect(timeSavedLabel(-5)).toBeNull();
    expect(timeSavedLabel(Number.NaN)).toBeNull();
  });
});

describe("curation through discovery", () => {
  const repository = createPilotDiscoveryRepository((key) => key);

  it("carries curation on every summary in a listing page", async () => {
    const page = await repository.listExperiences(parseFilters({}));
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.curation, item.slug).toEqual(pilotCurationFor(item.slug));
    }
  });

  it("carries curation on the detail view", async () => {
    const slug = PILOT_EXPERIENCES[0]!.slug;
    const detail = await repository.findExperienceBySlug(slug);
    expect(detail?.curation).toEqual(PILOT_EXPERIENCES[0]!.curation);
  });
});
