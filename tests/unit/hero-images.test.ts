import { describe, expect, it } from "vitest";

import { resolveHeroSlides, toHeroImage, toHeroImages } from "@/lib/home-content";
import type { ExperienceSummary } from "@/modules/discovery/ports";

function experience(id: string, coverUrl: string | null): ExperienceSummary {
  return {
    id,
    slug: id,
    title: `Listing ${id}`,
    summary: null,
    city: "Pune",
    region: "Maharashtra",
    country: "India",
    categoryKey: null,
    categoryName: "Culinary & Dining",
    durationMinutes: null,
    minGuests: 1,
    maxGuests: null,
    basePriceMinor: null,
    currency: "INR",
    pricingUnit: "PER_PERSON",
    coverUrl,
    coverAlt: `Alt ${id}`,
    hostName: "Host",
    publishedAt: null,
    distanceMetres: null,
  };
}

describe("toHeroImages", () => {
  it("falls back to the brand photograph when no listing has a cover", () => {
    const images = toHeroImages([experience("a", null)]);

    expect(images).toHaveLength(1);
    expect(images[0]!.src).toBe("/images/hero-positano.jpg");
  });

  it("keeps catalogue order, skips listings without a cover and repeated photographs", () => {
    const images = toHeroImages([
      experience("a", "/a.jpg"),
      experience("b", null),
      experience("c", "/a.jpg"),
      experience("d", "/d.jpg"),
    ]);

    expect(images.map((image) => image.src)).toEqual(["/a.jpg", "/d.jpg"]);
    expect(images[0]!.alt).toBe("Alt a");
  });

  it("caps the carousel at five slides", () => {
    const many = Array.from({ length: 9 }, (_, i) => experience(String(i), `/${i}.jpg`));

    expect(toHeroImages(many)).toHaveLength(5);
  });

  it("leaves toHeroImage as the first slide", () => {
    const list = [experience("a", null), experience("b", "/b.jpg")];

    expect(toHeroImage(list)).toEqual(toHeroImages(list)[0]);
  });
});

describe("resolveHeroSlides", () => {
  const single = toHeroImages([experience("x", "/x.jpg")])[0]!;

  it("prefers the list, then the single image, then the fallback", () => {
    expect(resolveHeroSlides([single], undefined)).toEqual([single]);
    expect(resolveHeroSlides([], single)).toEqual([single]);
    expect(resolveHeroSlides(undefined, undefined)[0]!.src).toBe("/images/hero-positano.jpg");
  });
});
