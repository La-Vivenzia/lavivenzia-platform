import type { Logger } from "pino";
import type { Coordinates, MapsPort, PlaceSuggestion } from "@/ports/maps";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * A primary location provider, with a second one behind it.
 *
 * `CLAUDE.md` §9 requires a graceful fallback for every external integration,
 * and this is where location search gets one. If Google times out, is throttled,
 * rejects our key, or has the Places API blocked for that key
 * (`403 API_KEY_SERVICE_BLOCKED`), a traveller still gets the cities we actually
 * sell rather than an empty box — degraded in reach, not in function.
 *
 * The rule that keeps this honest: **only an answer propagates.** A
 * `NotFoundError` or `ValidationError` is the provider responding to the
 * question, and re-asking a different provider would turn "no such place" into
 * a different place. Every other failure — timeouts, throttling, provider
 * faults, rejected credentials, an unreadable response, an unexpected throw —
 * says nothing about the place, so it falls back.
 *
 * **A rejected key opens a short circuit.** A provider that marks a failure
 * `accessDenied` (401/403) will fail identically on every request until someone
 * changes the key or the console. Asking it on every keystroke would add a
 * wasted round trip and a warning line per character typed, so for a cooldown
 * period the primary is skipped and the fallback answers directly. Throttling
 * and 5xx do not open the circuit: those are transient by definition.
 *
 * Deliberately in its own file, free of `env` and `prisma`. The composition
 * rule it encodes is worth testing, and the unit suite runs with no environment
 * variables at all; importing this from the factory would have made it
 * untestable there.
 */

/**
 * How long a rejected key keeps the primary out of the path.
 *
 * Long enough that a blocked key costs one failed call per instance every few
 * minutes rather than one per keystroke, and short enough that fixing the key
 * in the console takes effect without a redeploy.
 */
const ACCESS_DENIED_COOLDOWN_MS = 5 * 60_000;

export interface FallbackMapsOptions {
  /** Injected in tests, so the cooldown is exercised without waiting. */
  readonly now?: () => number;
  readonly accessDeniedCooldownMs?: number;
}

export class FallbackMapsAdapter implements MapsPort {
  readonly #primary: MapsPort;
  readonly #fallback: MapsPort;
  readonly #logger: () => Logger;
  readonly #now: () => number;
  readonly #cooldownMs: number;

  /** When the primary may be asked again after a rejected key. */
  #primaryBlockedUntil = 0;

  constructor(
    primary: MapsPort,
    fallback: MapsPort,
    logger: () => Logger,
    options: FallbackMapsOptions = {},
  ) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.#logger = logger;
    this.#now = options.now ?? (() => Date.now());
    this.#cooldownMs = options.accessDeniedCooldownMs ?? ACCESS_DENIED_COOLDOWN_MS;
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
    if (this.#now() < this.#primaryBlockedUntil) return fallback();

    try {
      return await primary();
    } catch (caught) {
      if (isProviderAnswer(caught)) throw caught;

      const context = caught instanceof AppError ? caught.context : {};
      const accessDenied = context.accessDenied === true;

      if (accessDenied) this.#primaryBlockedUntil = this.#now() + this.#cooldownMs;

      this.#logger().warn(
        {
          operation,
          primary: this.#primary.provider,
          fallback: this.#fallback.provider,
          code: caught instanceof AppError ? caught.code : "unknown",
          status: context.status,
          reason: context.reason,
          ...(accessDenied ? { primarySkippedForMs: this.#cooldownMs } : {}),
        },
        accessDenied
          ? "location provider rejected our credentials, using the catalogue"
          : "location provider unavailable, falling back to the catalogue",
      );

      return fallback();
    }
  }
}

/**
 * A failure that *is* the provider's answer to the question asked.
 *
 * Everything else — including an error that is not an `AppError` at all — is
 * treated as the provider being unable to answer.
 */
function isProviderAnswer(caught: unknown): boolean {
  return caught instanceof NotFoundError || caught instanceof ValidationError;
}
