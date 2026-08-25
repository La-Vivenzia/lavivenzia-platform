import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_LIMITS,
  assessExperienceReadiness,
  type ExperienceReadinessInput,
} from "@/modules/experiences/readiness";
import { SLUG_MAX_LENGTH, buildAvailableSlug, slugify } from "@/modules/experiences/slug";

const READY: ExperienceReadinessInput = {
  title: "An evening of Chettinad cooking",
  summary: "Cook and eat with a family who have done it for four generations.",
  description: "d".repeat(EXPERIENCE_LIMITS.description.min),
  categoryId: "8f1c0f2e-0000-4000-8000-000000000000",
  city: "Karaikudi",
  country: "IN",
  durationMinutes: 180,
  maxGuests: 8,
  basePriceMinor: 450_000,
  media: [{ altText: "A brass pot over a wood fire" }],
};

describe("assessExperienceReadiness", () => {
  it("passes a complete listing", () => {
    const readiness = assessExperienceReadiness(READY);
    expect(readiness.isReady).toBe(true);
    expect(readiness.issues).toEqual([]);
    expect(readiness.completed).toBe(readiness.total);
  });

  it("requires each of the fields a reviewer needs", () => {
    const cases: readonly [keyof ExperienceReadinessInput, Partial<ExperienceReadinessInput>][] = [
      ["summary", { summary: null }],
      ["description", { description: null }],
      ["categoryId", { categoryId: null }],
      ["city", { city: null }],
      ["durationMinutes", { durationMinutes: null }],
      ["maxGuests", { maxGuests: null }],
      ["basePriceMinor", { basePriceMinor: null }],
    ];

    for (const [field, override] of cases) {
      const readiness = assessExperienceReadiness({ ...READY, ...override });
      expect(readiness.isReady, `${field} should be required`).toBe(false);
      expect(readiness.issues.some((issue) => issue.field === field)).toBe(true);
    }
  });

  it("accepts a price of zero", () => {
    // A complimentary experience is a real listing. Only an absent price is
    // incomplete, and treating 0 as missing is the classic falsy-check bug.
    expect(assessExperienceReadiness({ ...READY, basePriceMinor: 0 }).isReady).toBe(true);
  });

  it("requires at least one photograph", () => {
    const readiness = assessExperienceReadiness({ ...READY, media: [] });
    expect(readiness.issues.some((issue) => issue.field === "media")).toBe(true);
  });

  it("requires alternative text on every photograph", () => {
    const readiness = assessExperienceReadiness({
      ...READY,
      media: [{ altText: "Described" }, { altText: null }],
    });

    expect(readiness.isReady).toBe(false);
    expect(readiness.issues.some((issue) => issue.field === "media.altText")).toBe(true);
  });

  it("does not also complain about alt text when there are no images", () => {
    // Reporting both for an empty gallery is noise rather than guidance.
    const readiness = assessExperienceReadiness({ ...READY, media: [] });
    expect(readiness.issues.some((issue) => issue.field === "media.altText")).toBe(false);
  });

  it("rejects text that is present but below the useful minimum", () => {
    const readiness = assessExperienceReadiness({ ...READY, description: "Too short." });
    expect(readiness.issues.some((issue) => issue.field === "description")).toBe(true);
  });

  it("gives every issue a sentence a host can act on", () => {
    const readiness = assessExperienceReadiness({
      title: "",
      summary: null,
      description: null,
      categoryId: null,
      city: null,
      country: "IN",
      durationMinutes: null,
      maxGuests: null,
      basePriceMinor: null,
      media: [],
    });

    expect(readiness.issues.length).toBeGreaterThan(0);
    for (const issue of readiness.issues) {
      expect(issue.message.length).toBeGreaterThan(10);
      expect(issue.message.endsWith(".")).toBe(true);
    }
  });
});

describe("slugify", () => {
  it("lower-cases and hyphenates", () => {
    expect(slugify("An Evening of Chettinad Cooking")).toBe("an-evening-of-chettinad-cooking");
  });

  it("keeps accented letters as their base letter", () => {
    // Dropping the letter entirely would turn "Café" into "caf".
    expect(slugify("Café Terrace Supper")).toBe("cafe-terrace-supper");
  });

  it("collapses punctuation and trims the edges", () => {
    expect(slugify("  --- Sunrise & Silk: A Journey!  ")).toBe("sunrise-silk-a-journey");
  });

  it("never ends in a hyphen, even when the length cut lands mid-word", () => {
    const slug = slugify(`${"word ".repeat(40)}`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns an empty string for input with nothing to slugify", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("日本語のみ")).toBe("");
  });
});

describe("buildAvailableSlug", () => {
  it("uses the plain slug when it is free", async () => {
    expect(await buildAvailableSlug("Sunrise Sail", async () => false)).toBe("sunrise-sail");
  });

  it("appends a suffix when the slug is taken", async () => {
    const taken = new Set(["sunrise-sail"]);
    const slug = await buildAvailableSlug("Sunrise Sail", async (candidate) =>
      taken.has(candidate),
    );

    expect(slug).not.toBe("sunrise-sail");
    expect(slug.startsWith("sunrise-sail-")).toBe(true);
  });

  it("falls back to a usable base when the title slugifies to nothing", async () => {
    // A title in a non-Latin script must not create a row with an empty slug.
    const slug = await buildAvailableSlug("日本語のみ", async () => false);
    expect(slug).toBe("experience");
  });

  it("stays within the length limit even with a suffix", async () => {
    const slug = await buildAvailableSlug(
      "a".repeat(200),
      async (candidate) => candidate === "a".repeat(SLUG_MAX_LENGTH),
    );

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
  });

  it("gives up rather than looping forever", async () => {
    await expect(buildAvailableSlug("Sunrise Sail", async () => true, 3)).rejects.toThrow();
  });
});
