import type { Logger } from "pino";
import type { Coordinates, MapsPort, PlaceSuggestion } from "@/ports/maps";
import { isValidLatitude, isValidLongitude } from "@/modules/discovery/geo";
import {
  InternalError,
  NotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/errors";

/**
 * Google Places adapter (FR-03).
 *
 * The only file in the codebase that knows Google exists. Everything above it
 * depends on `MapsPort`, so replacing the provider is a change here and a line
 * in the factory.
 *
 * Uses the Places API (New) surface — `places:autocomplete` and `places/{id}` —
 * rather than the legacy endpoints, which Google has placed on a deprecation
 * path.
 */

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_DETAILS_BASE = "https://places.googleapis.com/v1/places";

/**
 * Network budget.
 *
 * Autocomplete runs on a person's keystrokes, so a slow provider has to fail
 * quickly and leave the rest of the page working rather than hold the request
 * open. Two seconds is longer than a healthy Places call and shorter than a
 * traveller's patience.
 */
const REQUEST_TIMEOUT_MS = 2_000;

/**
 * Restrict suggestions to India.
 *
 * The platform is India-only at launch (docs/ASSUMPTIONS.md → A-014), and an
 * unrestricted autocomplete offers places nobody can book, which reads as a
 * broken search rather than a wide one. This is configuration, not a business
 * rule: widening it is a one-line change when the catalogue is multi-country.
 */
const REGION_CODES = ["in"] as const;

/**
 * Field masks.
 *
 * Required by the Places API (New), and also a cost control: it is what stops
 * us being billed for fields the adapter immediately discards.
 */
const FIELD_MASKS = {
  autocomplete: "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
  details: "location",
} as const;

export interface GoogleMapsConfig {
  readonly apiKey: string;
  /** Biases suggestions toward a language. ISO 639-1. */
  readonly languageCode?: string;
}

export interface GoogleMapsDeps {
  /** Resolved per call, so the correlation ID on the log line is the request's. */
  readonly logger: () => Logger;
  /** Injected in tests, so the adapter is exercised without a network or a key. */
  readonly fetch?: typeof globalThis.fetch;
}

/** The slices of the Places responses this adapter reads. */
interface AutocompleteResponse {
  readonly suggestions?: readonly {
    readonly placePrediction?: {
      readonly placeId?: string;
      readonly text?: { readonly text?: string };
    };
  }[];
}

interface PlaceDetailsResponse {
  readonly location?: { readonly latitude?: number; readonly longitude?: number };
}

export class GoogleMapsAdapter implements MapsPort {
  readonly provider = "google";

  readonly #config: GoogleMapsConfig;
  readonly #logger: () => Logger;
  readonly #fetch: typeof globalThis.fetch;

  constructor(config: GoogleMapsConfig, deps: GoogleMapsDeps) {
    // Assert configuration at construction: a missing key must fail at wiring
    // time rather than on a traveller's first keystroke.
    if (!config.apiKey) {
      throw new InternalError("Google Maps adapter requires an API key (GOOGLE_MAPS_API_KEY).");
    }

    this.#config = config;
    this.#logger = deps.logger;
    this.#fetch = deps.fetch ?? globalThis.fetch;
  }

  async autocomplete(query: string, limit: number): Promise<readonly PlaceSuggestion[]> {
    const input = query.trim();

    // Google bills per request. A single character is almost never a real place
    // and is exactly what an accidental keystroke produces.
    if (input.length < 2) return [];

    const body = await this.#call<AutocompleteResponse>(
      AUTOCOMPLETE_URL,
      {
        method: "POST",
        headers: this.#headers(FIELD_MASKS.autocomplete),
        body: JSON.stringify({
          input,
          includedRegionCodes: [...REGION_CODES],
          ...(this.#config.languageCode ? { languageCode: this.#config.languageCode } : {}),
        }),
      },
      "autocomplete",
    );

    const suggestions: PlaceSuggestion[] = [];

    for (const entry of body.suggestions ?? []) {
      const placeId = entry.placePrediction?.placeId;
      if (typeof placeId !== "string" || placeId === "") continue;

      suggestions.push({
        providerPlaceId: placeId,
        description: entry.placePrediction?.text?.text ?? placeId,
      });

      if (suggestions.length >= limit) break;
    }

    return suggestions;
  }

  async geocode(providerPlaceId: string): Promise<Coordinates> {
    const id = providerPlaceId.trim();
    if (id === "") throw new NotFoundError("That place could not be found.");

    // Encoded because the id becomes a path segment. It is provider-issued, but
    // it reaches us from a browser, so it is treated as caller input.
    const body = await this.#call<PlaceDetailsResponse>(
      `${PLACE_DETAILS_BASE}/${encodeURIComponent(id)}`,
      { method: "GET", headers: this.#headers(FIELD_MASKS.details) },
      "geocode",
    );

    const latitude = body.location?.latitude;
    const longitude = body.location?.longitude;

    // A response that parsed but carries no usable point is a not-found rather
    // than a provider fault: retrying returns the same thing.
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      throw new NotFoundError("That place has no location we can search around.");
    }

    return { latitude, longitude };
  }

  /**
   * The key travels in a header, never in the query string.
   *
   * A URL is written to access logs, proxy logs and browser history; a header
   * is not.
   */
  #headers(fieldMask: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": this.#config.apiKey,
      "X-Goog-FieldMask": fieldMask,
    };
  }

  /**
   * One request, with a timeout, mapped onto the shared error model.
   *
   * The distinction that matters to callers is retryable versus terminal: a 4xx
   * is a request we built wrongly or a key that is not authorised, and repeating
   * it burns the budget while delaying the alarm that should fire instead.
   */
  async #call<T>(url: string, init: RequestInit, operation: string): Promise<T> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.#fetch(url, { ...init, signal: controller.signal });
    } catch (caught) {
      const isAbort = caught instanceof Error && caught.name === "AbortError";
      const detail = { provider: this.provider, operation, durationMs: Date.now() - startedAt };

      throw isAbort
        ? new ProviderTimeoutError("The location service did not respond in time.", detail)
        : new ProviderUnavailableError("The location service is unavailable.", detail);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The error body can echo the request back, so the status is logged and
      // the body is not.
      this.#logger().warn(
        { provider: this.provider, operation, status: response.status },
        "maps provider rejected the request",
      );

      throw new ProviderUnavailableError(
        response.status >= 500 || response.status === 429
          ? "The location service is unavailable."
          : "The location service rejected the request.",
        {
          provider: this.provider,
          operation,
          status: response.status,
          // A 4xx other than 429 will fail identically on a retry.
          isTerminal: response.status < 500 && response.status !== 429,
        },
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderUnavailableError("The location service returned an unreadable response.", {
        provider: this.provider,
        operation,
      });
    }
  }
}
