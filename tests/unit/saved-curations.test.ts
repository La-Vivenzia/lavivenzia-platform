import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAVED_CURATIONS_MAX,
  addSavedCuration,
  getSavedCurations,
  isCurationSaved,
  normaliseCurationIds,
  parseSavedCurationsCookie,
  serialiseSavedCurations,
  subscribeSavedCurations,
  toCurationSummary,
  withCuration,
} from "@/lib/saved-curations";
import { curatedItineraryEmailVariables } from "@/modules/journeys/curated-itinerary-email";
import { findJourney } from "@/modules/journeys/data";
import { renderEmailTemplate } from "@/modules/notifications/email-templates";

const journey = findJourney("starlit-romance")!;

describe("saved curation format", () => {
  it("round-trips ids through the cookie value", () => {
    const value = serialiseSavedCurations(["starlit-romance", "a-second-arc"]);
    expect(parseSavedCurationsCookie(value)).toEqual(["starlit-romance", "a-second-arc"]);
    expect(parseSavedCurationsCookie(encodeURIComponent(value))).toEqual([
      "starlit-romance",
      "a-second-arc",
    ]);
  });

  it("discards tampered, duplicate and malformed entries", () => {
    expect(parseSavedCurationsCookie("ok-one,<script>,ok-one,,UPPER,ok-two")).toEqual([
      "ok-one",
      "ok-two",
    ]);
    expect(parseSavedCurationsCookie("%E0%A4%A")).toEqual([]);
    expect(parseSavedCurationsCookie(undefined)).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: SAVED_CURATIONS_MAX + 10 }, (_, i) => `arc-${i}`);
    expect(normaliseCurationIds(many)).toHaveLength(SAVED_CURATIONS_MAX);
  });

  it("moves a re-saved journey to the front without duplicating it", () => {
    expect(withCuration(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("summarises a journey without price or status", () => {
    const summary = toCurationSummary(journey);
    expect(summary).toMatchObject({
      id: journey.id,
      title: journey.title,
      mood: journey.mood,
      actCount: journey.chapters.length,
      totalDurationMinutes: journey.totalDurationMinutes,
    });
    expect(Object.keys(summary)).not.toContain("totalPriceMinor");
  });
});

/** A minimal browser: one cookie jar, one localStorage, window events. */
function fakeBrowser() {
  const jar = new Map<string, string>();
  const store = new Map<string, string>();
  const events = new EventTarget();
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair] = raw.split("; ");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    },
  });
  vi.stubGlobal("window", {
    location: { protocol: "https:" },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  return { jar, store };
}

describe("saved curations in the browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is empty and inert on the server", () => {
    expect(getSavedCurations()).toEqual([]);
    expect(isCurationSaved(journey.id)).toBe(false);
    expect(addSavedCuration(journey.id)).toEqual([]);
  });

  it("persists to both localStorage and the cookie", () => {
    const { jar, store } = fakeBrowser();
    addSavedCuration(journey.id);
    expect(isCurationSaved(journey.id)).toBe(true);
    expect(parseSavedCurationsCookie(jar.get("lv_saved_curations"))).toEqual([journey.id]);
    expect(JSON.parse(store.get("lv.saved-curations.v1")!)).toEqual([journey.id]);
  });

  it("restores the cookie from localStorage after it is cleared", () => {
    const { jar } = fakeBrowser();
    addSavedCuration(journey.id);
    jar.clear();
    expect(getSavedCurations()).toEqual([journey.id]);
    expect(jar.get("lv_saved_curations")).toBe(encodeURIComponent(journey.id));
  });

  it("notifies subscribers when a journey is saved", () => {
    fakeBrowser();
    const onChange = vi.fn();
    const unsubscribe = subscribeSavedCurations(onChange);
    addSavedCuration(journey.id);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    addSavedCuration("another-arc");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("curated itinerary email", () => {
  it("prints every act from the catalogue and links back with the map open", () => {
    const variables = curatedItineraryEmailVariables(journey, 2, "https://lavivenzia.test");
    expect(variables.acts).toHaveLength(journey.chapters.length);
    expect(variables.acts[0]!.title).toBe(journey.chapters[0]!.experienceTitle);
    expect(variables.journeyUrl).toBe(`https://lavivenzia.test/journeys/${journey.id}?map=1`);

    const email = renderEmailTemplate("traveler.curated-itinerary", variables);
    expect(email.subject).toContain(journey.title);
    expect(email.text).toContain("2 guests");
    expect(email.text).toContain("Nothing has been booked");
    expect(email.html).toContain("Start my journey");
    // No price, no keyword: saving a curation reserves nothing.
    expect(email.text).not.toMatch(/₹|INR|keyword/i);
  });

  it("omits the party when none was given", () => {
    const variables = curatedItineraryEmailVariables(journey, null, "https://lavivenzia.test");
    expect(renderEmailTemplate("traveler.curated-itinerary", variables).text).not.toContain(
      "guest",
    );
  });
});
