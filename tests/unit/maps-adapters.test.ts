import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { GoogleMapsAdapter, classifyFailure } from "@/adapters/maps/google";
import { FallbackMapsAdapter } from "@/adapters/maps/fallback";
import { resolveMapsProvider } from "@/adapters/maps/provider";
import type { Coordinates, MapsPort, PlaceSuggestion } from "@/ports/maps";
import {
  InternalError,
  NotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  ValidationError,
} from "@/lib/errors";

/**
 * Location providers, tested without a network or a key.
 *
 * No Google account has been arranged for this project yet, so the adapter has
 * never spoken to Google. That does not make these assertions weaker: what
 * needs proving is that the right request is constructed, that the key never
 * reaches a URL, that every failure lands on the right error, and that an
 * outage falls back rather than propagating. All of that is observable from a
 * fake `fetch`.
 */

const silentLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as Logger;

const CONFIG = { apiKey: "test-key-not-a-real-credential" } as const;

/** A fake `fetch` that records what it was asked for. */
function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];

  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof globalThis.fetch;

  return { fetch: fn, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveMapsProvider", () => {
  it("selects Google when a key is configured", () => {
    const plan = resolveMapsProvider({ apiKey: "abc123" });
    expect(plan.kind).toBe("google");
  });

  it("selects the catalogue provider when no key is configured", () => {
    // Unlike email, an unconfigured provider is not an error: location search
    // has a real degraded mode, so an absent key must not stop the app starting.
    expect(resolveMapsProvider({ apiKey: undefined }).kind).toBe("local");
    expect(resolveMapsProvider({ apiKey: "   " }).kind).toBe("local");
  });
});

describe("GoogleMapsAdapter construction", () => {
  it("refuses to build without a key", () => {
    expect(() => new GoogleMapsAdapter({ apiKey: "" }, { logger: silentLogger })).toThrow(
      InternalError,
    );
  });
});

describe("GoogleMapsAdapter autocomplete", () => {
  it("sends the key in a header and never in the URL", async () => {
    // A URL is written to access logs, proxy logs and browser history.
    const { fetch, calls } = fakeFetch(() => jsonResponse({ suggestions: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await adapter.autocomplete("Jaipur", 5);

    expect(calls[0]!.url).not.toContain(CONFIG.apiKey);
    expect((calls[0]!.init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      CONFIG.apiKey,
    );
  });

  it("sends a field mask, which is what bounds the bill", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ suggestions: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await adapter.autocomplete("Jaipur", 5);

    expect((calls[0]!.init.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain(
      "placeId",
    );
  });

  it("maps predictions onto suggestions", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        suggestions: [
          { placePrediction: { placeId: "p1", text: { text: "Jaipur, Rajasthan, India" } } },
        ],
      }),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([
      { providerPlaceId: "p1", description: "Jaipur, Rajasthan, India" },
    ]);
  });

  it("skips a prediction with no place id rather than emitting a broken one", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        suggestions: [
          { placePrediction: { text: { text: "No id here" } } },
          { queryPrediction: {} },
        ],
      }),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([]);
  });

  it("honours the limit", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        suggestions: Array.from({ length: 10 }, (_, index) => ({
          placePrediction: { placeId: `p${index}`, text: { text: `Place ${index}` } },
        })),
      }),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("Jaipur", 3)).resolves.toHaveLength(3);
  });

  it("does not call the provider for a one-character query", async () => {
    // Billed per request, and a single keystroke is never a real place.
    const { fetch, calls } = fakeFetch(() => jsonResponse({ suggestions: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("J", 5)).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("GoogleMapsAdapter geocode", () => {
  it("returns the point from the details response", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ location: { latitude: 26.9124, longitude: 75.7873 } }),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.geocode("p1")).resolves.toEqual({
      latitude: 26.9124,
      longitude: 75.7873,
    });
  });

  it("encodes the place id into the path", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ location: { latitude: 1, longitude: 1 } }),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await adapter.geocode("a/b?c");

    // The id reaches us from a browser, so it is caller input in a path segment.
    expect(calls[0]!.url).toContain("a%2Fb%3Fc");
  });

  it("reports a response with no usable point as not found", async () => {
    // Terminal, not retryable: asking again returns the same thing.
    const { fetch } = fakeFetch(() => jsonResponse({}));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.geocode("p1")).rejects.toThrow(NotFoundError);
  });

  it("rejects an out-of-range coordinate from the provider", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ location: { latitude: 900, longitude: 75 } }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.geocode("p1")).rejects.toThrow(NotFoundError);
  });
});

describe("GoogleMapsAdapter failures", () => {
  it("treats an aborted request as a timeout", async () => {
    const { fetch } = fakeFetch(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("Jaipur", 5)).rejects.toThrow(ProviderTimeoutError);
  });

  it("treats a network failure as unavailable", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("network");
    });
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("Jaipur", 5)).rejects.toThrow(ProviderUnavailableError);
  });

  it("marks a 4xx terminal and a 5xx not", async () => {
    const rejected = fakeFetch(() => jsonResponse({ error: {} }, 403));
    const unavailable = fakeFetch(() => jsonResponse({ error: {} }, 503));

    const forbidden = await new GoogleMapsAdapter(CONFIG, {
      logger: silentLogger,
      fetch: rejected.fetch,
    })
      .autocomplete("Jaipur", 5)
      .catch((caught: unknown) => caught);

    const down = await new GoogleMapsAdapter(CONFIG, {
      logger: silentLogger,
      fetch: unavailable.fetch,
    })
      .autocomplete("Jaipur", 5)
      .catch((caught: unknown) => caught);

    expect((forbidden as ProviderUnavailableError).context.isTerminal).toBe(true);
    expect((down as ProviderUnavailableError).context.isTerminal).toBe(false);
  });

  it("classifies 403 API_KEY_SERVICE_BLOCKED as a retryable access failure", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        {
          error: {
            code: 403,
            message: `Requests to this API are blocked. key=${CONFIG.apiKey}`,
            status: "PERMISSION_DENIED",
            details: [{ reason: "API_KEY_SERVICE_BLOCKED", domain: "googleapis.com" }],
          },
        },
        403,
      ),
    );

    const caught = await new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch })
      .autocomplete("Jaipur", 5)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const error = caught as ProviderUnavailableError;
    // Retryable is what lets the fallback take over.
    expect(error.isRetryable).toBe(true);
    expect(error.context).toMatchObject({
      status: 403,
      failure: "access",
      reason: "API_KEY_SERVICE_BLOCKED",
      accessDenied: true,
    });
    // The free-text message, which echoes the key, is never carried.
    expect(JSON.stringify(error.context)).not.toContain(CONFIG.apiKey);
  });

  it("treats a 401 as an access failure too", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ error: { status: "UNAUTHENTICATED" } }, 401));

    const caught = (await new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch })
      .geocode("p1")
      .catch((error: unknown) => error)) as ProviderUnavailableError;

    expect(caught.context).toMatchObject({ failure: "access", reason: "UNAUTHENTICATED" });
  });

  it("does not mark an unknown place id as an access failure", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ error: { status: "INVALID_ARGUMENT" } }, 400));

    const caught = (await new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch })
      .geocode("city:jaipur")
      .catch((error: unknown) => error)) as ProviderUnavailableError;

    expect(caught.context).toMatchObject({ failure: "request", accessDenied: false });
  });

  it("ignores a reason that is not a bare enum token", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ error: { details: [{ reason: `leak ${CONFIG.apiKey}` }] } }, 403),
    );

    const caught = (await new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch })
      .autocomplete("Jaipur", 5)
      .catch((error: unknown) => error)) as ProviderUnavailableError;

    expect(caught.context.reason).toBeUndefined();
  });

  it("classifies statuses by what should happen next", () => {
    expect(classifyFailure(401)).toBe("access");
    expect(classifyFailure(403)).toBe("access");
    expect(classifyFailure(400)).toBe("request");
    expect(classifyFailure(404)).toBe("request");
    expect(classifyFailure(429)).toBe("availability");
    expect(classifyFailure(503)).toBe("availability");
  });

  it("does not log the response body, which can echo the key back", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
    const { fetch } = fakeFetch(() => jsonResponse({ error: { message: CONFIG.apiKey } }, 400));

    await new GoogleMapsAdapter(CONFIG, { logger: () => logger, fetch })
      .autocomplete("Jaipur", 5)
      .catch(() => undefined);

    const logged = JSON.stringify((logger.warn as unknown as { mock: { calls: unknown[] } }).mock);
    expect(logged).not.toContain(CONFIG.apiKey);
  });

  it("returns an unreadable body as unavailable rather than crashing", async () => {
    const { fetch } = fakeFetch(() => new Response("not json", { status: 200 }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.autocomplete("Jaipur", 5)).rejects.toThrow(ProviderUnavailableError);
  });
});

// ── The fallback ───────────────────────────────────────────────────────────

function stubProvider(
  name: string,
  behaviour: {
    autocomplete?: () => Promise<readonly PlaceSuggestion[]>;
    geocode?: () => Promise<Coordinates>;
  },
): MapsPort {
  return {
    provider: name,
    autocomplete: behaviour.autocomplete ?? (() => Promise.resolve([])),
    geocode: behaviour.geocode ?? (() => Promise.resolve({ latitude: 0, longitude: 0 })),
  };
}

describe("FallbackMapsAdapter", () => {
  const suggestion: PlaceSuggestion = { providerPlaceId: "city:jaipur", description: "Jaipur" };

  it("uses the primary when it succeeds", async () => {
    const fallback = vi.fn();
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", { autocomplete: () => Promise.resolve([suggestion]) }),
      stubProvider("local", { autocomplete: fallback as never }),
      silentLogger,
    );

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([suggestion]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when the primary is unavailable", async () => {
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", {
        autocomplete: () => Promise.reject(new ProviderUnavailableError("down")),
      }),
      stubProvider("local", { autocomplete: () => Promise.resolve([suggestion]) }),
      silentLogger,
    );

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([suggestion]);
  });

  it("falls back on a timeout", async () => {
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", {
        geocode: () => Promise.reject(new ProviderTimeoutError("slow")),
      }),
      stubProvider("local", {
        geocode: () => Promise.resolve({ latitude: 26.9124, longitude: 75.7873 }),
      }),
      silentLogger,
    );

    await expect(adapter.geocode("city:jaipur")).resolves.toEqual({
      latitude: 26.9124,
      longitude: 75.7873,
    });
  });

  it("does NOT fall back on a not-found", async () => {
    // A not-found is the provider answering, not an outage. Retrying it against
    // a different provider would turn "no such place" into a different place.
    const fallback = vi.fn();
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", { geocode: () => Promise.reject(new NotFoundError("no such place")) }),
      stubProvider("local", { geocode: fallback as never }),
      silentLogger,
    );

    await expect(adapter.geocode("p1")).rejects.toThrow(NotFoundError);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when Google has the Places API blocked for our key", async () => {
    // End to end through the real Google adapter: 403 API_KEY_SERVICE_BLOCKED
    // must reach the traveller as catalogue suggestions, not an empty box.
    const { fetch } = fakeFetch(() =>
      jsonResponse({ error: { details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } }, 403),
    );
    const adapter = new FallbackMapsAdapter(
      new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch }),
      stubProvider("local", { autocomplete: () => Promise.resolve([suggestion]) }),
      silentLogger,
    );

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([suggestion]);
  });

  it("falls back on a terminal request failure", async () => {
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", {
        geocode: () =>
          Promise.reject(
            new ProviderUnavailableError("rejected", { isTerminal: true, failure: "request" }),
          ),
      }),
      stubProvider("local", {
        geocode: () => Promise.resolve({ latitude: 26.9124, longitude: 75.7873 }),
      }),
      silentLogger,
    );

    await expect(adapter.geocode("city:jaipur")).resolves.toEqual({
      latitude: 26.9124,
      longitude: 75.7873,
    });
  });

  it("falls back on an error that is not an AppError at all", async () => {
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", { autocomplete: () => Promise.reject(new TypeError("boom")) }),
      stubProvider("local", { autocomplete: () => Promise.resolve([suggestion]) }),
      silentLogger,
    );

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([suggestion]);
  });

  it("falls back on a non-retryable provider fault that is not an answer", async () => {
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", {
        autocomplete: () => Promise.reject(new InternalError("misconfigured")),
      }),
      stubProvider("local", { autocomplete: () => Promise.resolve([suggestion]) }),
      silentLogger,
    );

    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([suggestion]);
  });

  it("skips the primary for a cooldown after a rejected key, then asks again", async () => {
    let now = 1_000;
    const primary = vi.fn(() =>
      Promise.reject(new ProviderUnavailableError("blocked", { accessDenied: true })),
    );
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", { autocomplete: primary }),
      stubProvider("local", { autocomplete: () => Promise.resolve([suggestion]) }),
      silentLogger,
      { now: () => now, accessDeniedCooldownMs: 60_000 },
    );

    await adapter.autocomplete("Ja", 5);
    await adapter.autocomplete("Jai", 5);
    await adapter.autocomplete("Jaip", 5);
    expect(primary).toHaveBeenCalledTimes(1);

    now += 60_000;
    await expect(adapter.autocomplete("Jaipur", 5)).resolves.toEqual([suggestion]);
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it("does not open the circuit for a transient failure", async () => {
    const primary = vi.fn(() => Promise.reject(new ProviderUnavailableError("down")));
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", { autocomplete: primary }),
      stubProvider("local", { autocomplete: () => Promise.resolve([suggestion]) }),
      silentLogger,
    );

    await adapter.autocomplete("Ja", 5);
    await adapter.autocomplete("Jai", 5);
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it("does NOT fall back on a validation error", async () => {
    const fallback = vi.fn();
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", { geocode: () => Promise.reject(new ValidationError("bad id")) }),
      stubProvider("local", { geocode: fallback as never }),
      silentLogger,
    );

    await expect(adapter.geocode("p1")).rejects.toThrow(ValidationError);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("names both providers, so a log line says what actually served", () => {
    const adapter = new FallbackMapsAdapter(
      stubProvider("google", {}),
      stubProvider("local", {}),
      silentLogger,
    );

    expect(adapter.provider).toBe("google+local");
  });
});

describe("GoogleMapsAdapter findPlaceId", () => {
  it("sends the key in a header and never in the URL", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ places: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await adapter.findPlaceId({ query: "Smaaash Arena", latitude: 18.518012, longitude: 73.934521 });

    expect(calls[0]!.url).not.toContain(CONFIG.apiKey);
    expect(calls[0]!.url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect((calls[0]!.init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      CONFIG.apiKey,
    );
  });

  it("sends field mask places.id,places.displayName,places.formattedAddress", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ places: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await adapter.findPlaceId({ query: "Smaaash Arena", latitude: 18.518012, longitude: 73.934521 });

    expect((calls[0]!.init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe(
      "places.id,places.displayName,places.formattedAddress",
    );
  });

  it("sends regionCode 'in' and locationBias circle 500m at the coordinates", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ places: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await adapter.findPlaceId({ query: "Smaaash Arena", latitude: 18.518012, longitude: 73.934521 });

    const body = JSON.parse(calls[0]!.init.body as string) as {
      textQuery: string;
      regionCode: string;
      locationBias: { circle: { center: { latitude: number; longitude: number }; radius: number } };
    };

    expect(body.textQuery).toBe("Smaaash Arena");
    expect(body.regionCode).toBe("in");
    expect(body.locationBias).toEqual({
      circle: {
        center: { latitude: 18.518012, longitude: 73.934521 },
        radius: 500,
      },
    });
  });

  it("returns the top match with id, name, and address", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        places: [
          {
            id: "place_smaaash",
            displayName: { text: "Smaaash Arena", languageCode: "en" },
            formattedAddress: "Amanora Mall, Hadapsar, Pune",
          },
          {
            id: "place_other",
            displayName: { text: "Other Place" },
            formattedAddress: "Other Address",
          },
        ],
      }),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const result = await adapter.findPlaceId({
      query: "Smaaash Arena",
      latitude: 18.518012,
      longitude: 73.934521,
    });

    expect(result).toEqual({
      id: "place_smaaash",
      name: "Smaaash Arena",
      address: "Amanora Mall, Hadapsar, Pune",
    });
  });

  it("returns null when no places match", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ places: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const result = await adapter.findPlaceId({
      query: "Nonexistent Place",
      latitude: 18.518012,
      longitude: 73.934521,
    });

    expect(result).toBeNull();
  });

  it("returns null when query is blank without making a network request", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ places: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const result = await adapter.findPlaceId({
      query: "   ",
      latitude: 18.518012,
      longitude: 73.934521,
    });

    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns null when coordinates are invalid without calling provider", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ places: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const result = await adapter.findPlaceId({
      query: "Smaaash",
      latitude: 999,
      longitude: 73.934521,
    });

    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("reuses failure classification when findPlaceId fails", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        {
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            details: [{ reason: "API_KEY_SERVICE_BLOCKED" }],
          },
        },
        403,
      ),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const caught = await adapter
      .findPlaceId({ query: "Smaaash", latitude: 18.518012, longitude: 73.934521 })
      .catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const error = caught as ProviderUnavailableError;
    expect(error.context).toMatchObject({
      status: 403,
      failure: "access",
      reason: "API_KEY_SERVICE_BLOCKED",
      accessDenied: true,
    });
  });

  it("treats an aborted findPlaceId request as a timeout", async () => {
    const { fetch } = fakeFetch(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(
      adapter.findPlaceId({ query: "Smaaash", latitude: 18.518012, longitude: 73.934521 }),
    ).rejects.toThrow(ProviderTimeoutError);
  });
});

describe("GoogleMapsAdapter getPhoto", () => {
  it("requests photos field mask, takes the first photo, and calls /media with key only in header", async () => {
    const photoBytes = new Uint8Array([137, 80, 78, 71]);
    const { fetch, calls } = fakeFetch((url) => {
      if (url.includes("/media")) {
        return new Response(photoBytes, {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      return jsonResponse({
        photos: [
          {
            name: "places/ChIJ123/photos/AU3C456",
            widthPx: 1600,
            heightPx: 1200,
            authorAttributions: [
              {
                displayName: "Pune Guide",
                uri: "https://maps.google.com/contrib/123",
                photoUri: "https://lh3.googleusercontent.com/123",
              },
            ],
          },
          {
            name: "places/ChIJ123/photos/AU3C789",
            widthPx: 800,
            heightPx: 600,
          },
        ],
      });
    });

    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });
    const result = await adapter.getPhoto("ChIJ123", 800);

    expect(calls).toHaveLength(2);

    // 1. Details call
    expect(calls[0]!.url).toBe("https://places.googleapis.com/v1/places/ChIJ123");
    expect(calls[0]!.url).not.toContain(CONFIG.apiKey);
    expect((calls[0]!.init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("photos");
    expect((calls[0]!.init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      CONFIG.apiKey,
    );

    // 2. Media call
    expect(calls[1]!.url).toBe(
      "https://places.googleapis.com/v1/places/ChIJ123/photos/AU3C456/media?maxWidthPx=800",
    );
    expect(calls[1]!.url).not.toContain(CONFIG.apiKey);
    expect((calls[1]!.init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      CONFIG.apiKey,
    );

    // Result
    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes).toEqual(photoBytes);
    expect(result.authorAttributions).toEqual([
      {
        displayName: "Pune Guide",
        uri: "https://maps.google.com/contrib/123",
        photoUri: "https://lh3.googleusercontent.com/123",
      },
    ]);
  });

  it("handles photo resource names that do not start with places/", async () => {
    const photoBytes = new Uint8Array([1, 2, 3]);
    const { fetch, calls } = fakeFetch((url) => {
      if (url.includes("/media")) {
        return new Response(photoBytes, {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }
      return jsonResponse({
        photos: [{ name: "photo_reference_simple" }],
      });
    });

    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });
    const result = await adapter.getPhoto("place_xyz");

    expect(calls[1]!.url).toBe(
      "https://places.googleapis.com/v1/places/place_xyz/photos/photo_reference_simple/media?maxWidthPx=1200",
    );
    expect(result.contentType).toBe("image/webp");
    expect(result.bytes).toEqual(photoBytes);
    expect(result.authorAttributions).toEqual([]);
  });

  it("throws NotFoundError when place id is blank", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({}));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.getPhoto("   ")).rejects.toThrow(NotFoundError);
    expect(calls).toHaveLength(0);
  });

  it("throws NotFoundError when place details has no photos", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ photos: [] }));
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.getPhoto("place_without_photos")).rejects.toThrow(NotFoundError);
  });

  it("reuses error classification when details call fails", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        {
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            details: [{ reason: "API_KEY_SERVICE_BLOCKED" }],
          },
        },
        403,
      ),
    );
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const caught = await adapter.getPhoto("place_123").catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const error = caught as ProviderUnavailableError;
    expect(error.context).toMatchObject({
      status: 403,
      failure: "access",
      reason: "API_KEY_SERVICE_BLOCKED",
      accessDenied: true,
    });
  });

  it("reuses error classification when media call fails", async () => {
    const { fetch } = fakeFetch((url) => {
      if (url.includes("/media")) {
        return jsonResponse(
          {
            error: {
              code: 503,
              status: "UNAVAILABLE",
            },
          },
          503,
        );
      }
      return jsonResponse({
        photos: [{ name: "places/p1/photos/photo1" }],
      });
    });

    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    const caught = await adapter.getPhoto("p1").catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const error = caught as ProviderUnavailableError;
    expect(error.context).toMatchObject({
      status: 503,
      failure: "availability",
      isTerminal: false,
    });
  });

  it("treats an aborted photo call as a timeout", async () => {
    const { fetch } = fakeFetch(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const adapter = new GoogleMapsAdapter(CONFIG, { logger: silentLogger, fetch });

    await expect(adapter.getPhoto("place_123")).rejects.toThrow(ProviderTimeoutError);
  });
});
