import type { Logger } from "pino";
import type { Coordinates, MapsPort, PlaceSuggestion } from "@/ports/maps";
import { AppError } from "@/lib/errors";

/**
 * A primary location provider, with a second one behind it.
 *
 * `CLAUDE.md` §9 requires a graceful fallback for every external integration,
 * and this is where location search gets one. If Google times out, is throttled
 * or rejects our key, a traveller still gets the cities we actually sell rather
 * than an empty box — degraded in reach, not in function.
 *
 * The rule that keeps this honest: **only availability failures fall back.** A
 * `NotFoundError` is an answer, not an outage, and re-asking a different
 * provider would turn "no such place" into a different place. Only retryable
 * errors — timeouts, throttling, provider faults — reach the fallback.
 *
 * Deliberately in its own file, free of `env` and `prisma`. The composition
 * rule it encodes is worth testing, and the unit suite runs with no environment
 * variables at all; importing this from the factory would have made it
 * untestable there.
 */
export class FallbackMapsAdapter implements MapsPort {
  readonly #primary: MapsPort;
  readonly #fallback: MapsPort;
  readonly #logger: () => Logger;

  constructor(primary: MapsPort, fallback: MapsPort, logger: () => Logger) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.#logger = logger;
  }

  /** Names both, so a log line says what could have served the request. */
  get provider(): string {
    return `${this.#primary.provider}+${this.#fallback.provider}`;
  }

  autocomplete(query: string, limit: number): Promise<readonly PlaceSuggestion[]> {
    return this.#withFallback(
      () => this.#primary.autocomplete(query, limit),
      () => this.#fallback.autocomplete(query, limit),
      "autocomplete",
    );
  }

  geocode(providerPlaceId: string): Promise<Coordinates> {
    return this.#withFallback(
      () => this.#primary.geocode(providerPlaceId),
      () => this.#fallback.geocode(providerPlaceId),
      "geocode",
    );
  }

  async #withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    operation: string,
  ): Promise<T> {
    try {
      return await primary();
    } catch (caught) {
      // A non-retryable AppError — not found, validation — is the provider
      // answering. Only an availability failure is worth asking someone else.
      if (caught instanceof AppError && !caught.isRetryable) throw caught;

      this.#logger().warn(
        {
          operation,
          primary: this.#primary.provider,
          fallback: this.#fallback.provider,
          code: caught instanceof AppError ? caught.code : "unknown",
        },
        "location provider unavailable, falling back to the catalogue",
      );

      return fallback();
    }
  }
}
