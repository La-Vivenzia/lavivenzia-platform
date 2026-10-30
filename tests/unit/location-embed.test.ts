import { describe, expect, it } from "vitest";
import { buildLocationEmbed } from "@/components/map/location-embed";

/**
 * The location panel's embedded map: Google Embed when a browser key is
 * configured, OpenStreetMap when it is not, and nothing when there is nothing
 * truthful to centre on.
 */

const JAIPUR = { latitude: 26.9124, longitude: 75.7873 } as const;

describe("buildLocationEmbed", () => {
  it("uses the Google Maps Embed API when a key is configured", () => {
    const embed = buildLocationEmbed({ ...JAIPUR, googleApiKey: "browser-key" });

    expect(embed?.provider).toBe("google");
    const url = new URL(embed!.src);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/place");
    expect(url.searchParams.get("key")).toBe("browser-key");
    expect(url.searchParams.get("q")).toBe("26.9124,75.7873");
  });

  it("uses OpenStreetMap when no key is configured", () => {
    for (const googleApiKey of [undefined, null, "", "   "]) {
      const embed = buildLocationEmbed({ ...JAIPUR, googleApiKey });

      expect(embed?.provider).toBe("openstreetmap");
      const url = new URL(embed!.src);
      expect(url.origin + url.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
      expect(url.searchParams.get("marker")).toBe("26.9124,75.7873");
      expect(url.searchParams.get("key")).toBeNull();
    }
  });

  it("frames the pin inside the OpenStreetMap bounding box", () => {
    const embed = buildLocationEmbed(JAIPUR);
    const [west, south, east, north] = new URL(embed!.src).searchParams
      .get("bbox")!
      .split(",")
      .map(Number);

    expect(west).toBeLessThan(JAIPUR.longitude);
    expect(east).toBeGreaterThan(JAIPUR.longitude);
    expect(south).toBeLessThan(JAIPUR.latitude);
    expect(north).toBeGreaterThan(JAIPUR.latitude);
  });

  it("lets Google search the published address when there is no pin", () => {
    const embed = buildLocationEmbed({
      latitude: null,
      longitude: null,
      address: "Amber Fort, Jaipur, India",
      googleApiKey: "browser-key",
    });

    expect(new URL(embed!.src).searchParams.get("q")).toBe("Amber Fort, Jaipur, India");
  });

  it("prefers the pin over the address", () => {
    const embed = buildLocationEmbed({ ...JAIPUR, address: "Jaipur", googleApiKey: "k" });

    expect(new URL(embed!.src).searchParams.get("q")).toBe("26.9124,75.7873");
  });

  it("shows no map without a pin when only OpenStreetMap is available", () => {
    expect(buildLocationEmbed({ latitude: null, longitude: null, address: "Jaipur" })).toBeNull();
  });

  it("treats an out-of-range coordinate as no pin", () => {
    expect(buildLocationEmbed({ latitude: 120, longitude: 75 })).toBeNull();
  });
});
