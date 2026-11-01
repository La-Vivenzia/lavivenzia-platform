import type { Logger } from "pino";
import type {
  Coordinates,
  FindPlaceIdInput,
  FindPlaceInput,
  MapsPort,
  PhotoAuthorAttribution,
  PlaceMatch,
  PlacePhoto,
  PlaceSuggestion,
} from "@/ports/maps";
import { isValidLatitude, isValidLongitude } from "@/modules/discovery/geo";
import {
  InternalError,
  NotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/errors";

export type {
  FindPlaceIdInput,
  FindPlaceInput,
  PhotoAuthorAttribution,
  PlaceMatch,
  PlacePhoto,
};

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
const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Network budget.
 *
 * Autocomplete runs on a person's keystrokes, so a slow provider has to fail
 * quickly and leave the rest of the page working rather than hold the request
 * open. Two seconds is longer than a healthy Places call and shorter than a
 * traveller's patience.
 */
const REQUEST_TIMEOUT_MS = 2_000;
const PHOTO_REQUEST_TIMEOUT_MS = 5_000;

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
  searchText: "places.id,places.displayName,places.formattedAddress",
  photos: "photos",
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
  readonly requestTimeoutMs?: number;
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

interface SearchTextResponse {
  readonly places?: readonly {
    readonly id?: string;
    readonly displayName?: { readonly text?: string } | string;
    readonly formattedAddress?: string;
  }[];
}

interface PlacePhotosResponse {
  readonly photos?: readonly {
    readonly name?: string;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly authorAttributions?: readonly {
      readonly displayName?: string;
      readonly uri?: string;
      readonly photoUri?: string;
    }[];
  }[];
}

/**
 * Why a request failed, in the terms that decide what happens next.
 *
 * - `access` — 401/403: the key is missing, invalid, or not allowed to call
 *   this API (`API_KEY_SERVICE_BLOCKED`, `API_KEY_INVALID`, billing disabled).
 *   Nothing changes until someone edits the key or the Cloud console.
 * - `request` — any other 4xx except 429: we asked for something Google will
 *   not answer, such as a place id it does not recognise.
 * - `availability` — 429 and 5xx: Google is throttling or faulting, and a
 *   later attempt may well succeed.
 */
export type GoogleFailureKind = "access" | "request" | "availability";

export function classifyFailure(status: number): GoogleFailureKind {
  if (status === 401 || status === 403) return "access";
  if (status === 429 || status >= 500) return "availability";
  return "request";
}

const FAILURE_MESSAGES: Record<GoogleFailureKind, string> = {
  access: "The location service refused our credentials.",
  request: "The location service rejected the request.",
  availability: "The location service is unavailable.",
};

/**
 * Google's machine-readable failure reason, e.g. `API_KEY_SERVICE_BLOCKED`.
 *
 * Read from `error.details[].reason`, falling back to `error.status`. Only a
 * bare enum token is accepted. Anything else is discarded, because the
 * free-text parts of the body can echo the request (and so the key) back.
 */
const REASON_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

interface GoogleErrorBody {
  readonly error?: {
    readonly status?: unknown;
    readonly details?: readonly { readonly reason?: unknown }[];
  };
}

async function readErrorReason(response: Response): Promise<string | undefined> {
  let body: GoogleErrorBody;
  try {
    body = (await response.json()) as GoogleErrorBody;
  } catch {
    return undefined;
  }

  const candidates = [
    ...(Array.isArray(body.error?.details) ? body.error.details.map((d) => d?.reason) : []),
    body.error?.status,
  ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && REASON_PATTERN.test(candidate),
  );
}

export class GoogleMapsAdapter implements MapsPort {
  readonly provider = "google";

  readonly #config: GoogleMapsConfig;
  readonly #logger: () => Logger;
  readonly #fetch: typeof globalThis.fetch;
  readonly #requestTimeoutMs: number;

  constructor(config: GoogleMapsConfig, deps: GoogleMapsDeps) {
    // Assert configuration at construction: a missing key must fail at wiring
    // time rather than on a traveller's first keystroke.
    if (!config.apiKey) {
      throw new InternalError("Google Maps adapter requires an API key (GOOGLE_MAPS_API_KEY).");
    }

    this.#config = config;
    this.#logger = deps.logger;
    this.#fetch = deps.fetch ?? globalThis.fetch;
    this.#requestTimeoutMs = deps.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
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

  async findPlaceId(input: FindPlaceIdInput): Promise<PlaceMatch | null> {
    const textQuery = input.query.trim();
    if (textQuery.length === 0) return null;

    if (!isValidLatitude(input.latitude) || !isValidLongitude(input.longitude)) {
      return null;
    }

    const body = await this.#call<SearchTextResponse>(
      SEARCH_TEXT_URL,
      {
        method: "POST",
        headers: this.#headers(FIELD_MASKS.searchText),
        body: JSON.stringify({
          textQuery,
          regionCode: "in",
          locationBias: {
            circle: {
              center: {
                latitude: input.latitude,
                longitude: input.longitude,
              },
              radius: 500.0,
            },
          },
          ...(this.#config.languageCode ? { languageCode: this.#config.languageCode } : {}),
        }),
      },
      "findPlaceId",
    );

    const top = body.places?.[0];
    if (!top || typeof top.id !== "string" || top.id === "") {
      return null;
    }

    const name =
      typeof top.displayName === "object" && top.displayName !== null
        ? (top.displayName.text ?? "")
        : typeof top.displayName === "string"
          ? top.displayName
          : "";

    const address = typeof top.formattedAddress === "string" ? top.formattedAddress : "";

    return {
      id: top.id,
      name,
      address,
    };
  }

  async getPhoto(placeId: string, maxWidthPx: number = 1200): Promise<PlacePhoto> {
    const id = placeId.trim();
    if (id === "") throw new NotFoundError("That place could not be found.");

    const body = await this.#call<PlacePhotosResponse>(
      `${PLACE_DETAILS_BASE}/${encodeURIComponent(id)}`,
      { method: "GET", headers: this.#headers(FIELD_MASKS.photos) },
      "getPhoto",
      PHOTO_REQUEST_TIMEOUT_MS,
    );

    const firstPhoto = body.photos?.[0];
    if (!firstPhoto || typeof firstPhoto.name !== "string" || firstPhoto.name === "") {
      throw new NotFoundError("That place has no photos.");
    }

    const photoResource = firstPhoto.name.startsWith("places/")
      ? firstPhoto.name
      : `places/${encodeURIComponent(id)}/photos/${firstPhoto.name}`;

    const mediaBase = `https://places.googleapis.com/v1/${photoResource}/media`;
    const resolvedMaxWidth =
      typeof maxWidthPx === "number" && maxWidthPx > 0 ? maxWidthPx : 1200;
    const mediaUrl = `${mediaBase}?maxWidthPx=${encodeURIComponent(resolvedMaxWidth)}`;

    const mediaResponse = await this.#callRaw(
      mediaUrl,
      {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": this.#config.apiKey,
        },
      },
      "getPhoto",
      PHOTO_REQUEST_TIMEOUT_MS,
    );

    const contentType = mediaResponse.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await mediaResponse.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const authorAttributions: PhotoAuthorAttribution[] = (
      firstPhoto.authorAttributions ?? []
    ).map((attr) => ({
      displayName: typeof attr.displayName === "string" ? attr.displayName : "",
      ...(typeof attr.uri === "string" ? { uri: attr.uri } : {}),
      ...(typeof attr.photoUri === "string" ? { photoUri: attr.photoUri } : {}),
    }));

    return {
      bytes,
      contentType,
      authorAttributions,
    };
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
  async #call<T>(
    url: string,
    init: RequestInit,
    operation: string,
    timeoutMs: number = this.#requestTimeoutMs,
  ): Promise<T> {
    const response = await this.#callRaw(url, init, operation, timeoutMs);

    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderUnavailableError("The location service returned an unreadable response.", {
        provider: this.provider,
        operation,
      });
    }
  }

  async #callRaw(
    url: string,
    init: RequestInit,
    operation: string,
    timeoutMs: number = this.#requestTimeoutMs,
  ): Promise<Response> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

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
      const failure = classifyFailure(response.status);
      const reason = await readErrorReason(response);

      // The error body can echo the request back, so the status and Google's
      // enumerated reason are logged and the body is not.
      this.#logger().warn(
        { provider: this.provider, operation, status: response.status, failure, reason },
        "maps provider rejected the request",
      );

      // Every non-2xx is an availability failure *from the caller's point of
      // view*: none of them is Google answering the question asked. That is
      // what lets the fallback serve the catalogue instead of an empty box.
      throw new ProviderUnavailableError(FAILURE_MESSAGES[failure], {
        provider: this.provider,
        operation,
        status: response.status,
        failure,
        ...(reason ? { reason } : {}),
        // A 4xx other than 429 will fail identically on a retry.
        isTerminal: failure !== "availability",
        // A blocked or unauthorised key fails identically for *every* request
        // until someone changes the key or the console, so callers may stop
        // asking for a while (see FallbackMapsAdapter).
        accessDenied: failure === "access",
      });
    }

    return response;
  }
}
