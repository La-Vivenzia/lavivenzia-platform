import type { LlmPort, LlmGenerateOptions } from "@/ports/llm";
import { InternalError, ProviderTimeoutError, ProviderUnavailableError } from "@/lib/errors";
import {
  getMeteringService,
  recordUsageSafely,
  type UsageRecorder,
} from "@/modules/metering/service";

/**
 * Google Gemini adapter (`generateContent`, JSON response mode).
 *
 * The only file in the codebase that knows Gemini exists. Callers depend on
 * `LlmPort` and must treat every failure — timeout, provider error, unreadable
 * or non-JSON output — as "use the deterministic path" (CLAUDE.md §7, §9).
 *
 * Output is rejected, never repaired: anything that does not parse as JSON
 * throws, and shape validation is the caller's job.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Model ids, in order. The second is tried only when the first is not found
 * (404) — the failure a renamed or retired model id produces. Every other
 * failure is reported straight away: a second request would only spend the
 * caller's budget on the same answer.
 */
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;

export interface GeminiLlmConfig {
  readonly apiKey: string;
  /** Override the model order. Defaults to `GEMINI_MODELS`. */
  readonly models?: readonly string[];
}

export interface GeminiLlmDeps {
  /** Injected in tests, so the adapter is exercised without a network or a key. */
  readonly fetch?: typeof globalThis.fetch;
  /** Where token usage is reported. Defaults to the process-wide meter. */
  readonly metering?: UsageRecorder;
}

/** The key, from either of the two names the environment schema accepts. */
export function resolveGeminiApiKey(source: {
  readonly GEMINI_API_KEY?: string | undefined;
  readonly GOOGLE_GEMINI_API_KEY?: string | undefined;
}): string | undefined {
  return source.GEMINI_API_KEY || source.GOOGLE_GEMINI_API_KEY || undefined;
}

interface GenerateContentResponse {
  readonly candidates?: readonly {
    readonly content?: { readonly parts?: readonly { readonly text?: unknown }[] };
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: unknown;
    readonly candidatesTokenCount?: unknown;
  };
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export class GeminiLlmAdapter implements LlmPort {
  readonly provider = "gemini";

  readonly #apiKey: string;
  readonly #models: readonly string[];
  readonly #fetch: typeof globalThis.fetch;
  readonly #metering: UsageRecorder;

  constructor(config: GeminiLlmConfig, deps: GeminiLlmDeps = {}) {
    // A missing key fails at wiring time, not on a traveller's first message.
    if (!config.apiKey) {
      throw new InternalError(
        "Gemini adapter requires an API key (GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY).",
      );
    }

    this.#apiKey = config.apiKey;
    this.#models = config.models && config.models.length > 0 ? config.models : GEMINI_MODELS;
    this.#fetch = deps.fetch ?? globalThis.fetch;
    this.#metering = deps.metering ?? getMeteringService();
  }

  async generateStructured<T>(input: {
    readonly system: string;
    readonly prompt: string;
    readonly schemaName: string;
    readonly options: LlmGenerateOptions;
  }): Promise<T> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: {
        maxOutputTokens: input.options.maxOutputTokens,
        responseMimeType: "application/json",
      },
    });

    // One budget for the whole call, model fallback included: the caller's
    // timeout is a ceiling on the traveller's wait, not a per-attempt figure.
    const signal = AbortSignal.timeout(input.options.timeoutMs);
    const startedAt = Date.now();

    for (const [index, model] of this.#models.entries()) {
      const isLast = index === this.#models.length - 1;
      const detail = { provider: this.provider, model, schemaName: input.schemaName };

      let response: Response;
      try {
        response = await this.#fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // A header, never `?key=`: a URL is written to access and proxy logs.
            "x-goog-api-key": this.#apiKey,
          },
          body,
          signal,
        });
      } catch (caught) {
        const isTimeout =
          caught instanceof Error &&
          (caught.name === "TimeoutError" || caught.name === "AbortError");
        this.#meter({ model, inputTokens: 0, outputTokens: 0, startedAt, status: "ERROR" });

        throw isTimeout
          ? new ProviderTimeoutError("The language model did not respond in time.", {
              ...detail,
              durationMs: Date.now() - startedAt,
            })
          : new ProviderUnavailableError("The language model is unavailable.", detail);
      }

      if (response.status === 404 && !isLast) continue;

      if (!response.ok) {
        this.#meter({ model, inputTokens: 0, outputTokens: 0, startedAt, status: "ERROR" });
        // The error body can echo the request back, so only the status is kept.
        throw new ProviderUnavailableError("The language model rejected the request.", {
          ...detail,
          status: response.status,
          isTerminal: response.status >= 400 && response.status < 500 && response.status !== 429,
        });
      }

      let payload: GenerateContentResponse;
      try {
        payload = (await response.json()) as GenerateContentResponse;
      } catch {
        this.#meter({ model, inputTokens: 0, outputTokens: 0, startedAt, status: "ERROR" });
        throw new ProviderUnavailableError(
          "The language model returned an unreadable response.",
          detail,
        );
      }

      // Billed on a 2xx whether or not the text turns out to be usable.
      this.#meter({
        model,
        inputTokens: tokenCount(payload.usageMetadata?.promptTokenCount),
        outputTokens: tokenCount(payload.usageMetadata?.candidatesTokenCount),
        startedAt,
        status: "SUCCESS",
      });

      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ProviderUnavailableError("The language model returned non-JSON output.", detail);
      }
    }

    // Unreachable: the last model never `continue`s.
    throw new ProviderUnavailableError("No language model is configured.", {
      provider: this.provider,
    });
  }

  /** An input event and an output event, so the two rates stay visible. Never throws. */
  #meter(usage: {
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly startedAt: number;
    readonly status: "SUCCESS" | "ERROR";
  }): void {
    const metadata = { model: usage.model };

    recordUsageSafely(this.#metering, {
      provider: "GOOGLE_GEMINI",
      operation: "gemini.flash_input",
      units: usage.inputTokens,
      latencyMs: Date.now() - usage.startedAt,
      status: usage.status,
      metadata,
    });
    recordUsageSafely(this.#metering, {
      provider: "GOOGLE_GEMINI",
      operation: "gemini.flash_output",
      units: usage.outputTokens,
      // Latency belongs to the request, and is already on the input event.
      latencyMs: 0,
      status: usage.status,
      metadata,
    });
  }
}
