import type { LlmPort, LlmGenerateOptions } from "@/ports/llm";
import { NotImplementedError } from "@/lib/errors";
import {
  getMeteringService,
  recordUsageSafely,
  type UsageRecorder,
} from "@/modules/metering/service";

/**
 * Anthropic adapter — integration boundary only.
 *
 * Declared now so the dependency direction is fixed and no domain module grows
 * a direct provider import later (SYSTEM_DESIGN.md §10). AI discovery is a
 * later phase; the model tiering decision is recorded in ADR-0007.
 *
 * Metering is wired ahead of the implementation: `recordUsage` is what the
 * real `generateStructured` must call with the `usage` block of every Messages
 * API response, so token spend is visible from the first live request.
 */

export interface AnthropicLlmAdapterDeps {
  /** Where token usage is reported. Defaults to the process-wide meter. */
  readonly metering?: UsageRecorder;
}

export interface AnthropicUsage {
  /** The model id the request was sent to. */
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly status: "SUCCESS" | "ERROR";
}

/**
 * Price tier for a model id. Only Sonnet and Haiku are priced (FinOps spec
 * §2), so any non-Haiku model is metered at the Sonnet rate — the dearer of
 * the two, so an unrecognised model over-states rather than hides spend.
 */
export function anthropicPriceTier(model: string): "sonnet" | "haiku" {
  return model.toLowerCase().includes("haiku") ? "haiku" : "sonnet";
}

export class AnthropicLlmAdapter implements LlmPort {
  readonly #metering: UsageRecorder;

  constructor(deps: AnthropicLlmAdapterDeps = {}) {
    this.#metering = deps.metering ?? getMeteringService();
  }

  generateStructured<T>(_input: {
    readonly system: string;
    readonly prompt: string;
    readonly schemaName: string;
    readonly options: LlmGenerateOptions;
  }): Promise<T> {
    throw new NotImplementedError(
      "LLM generation is not implemented: AI discovery is a later phase (FR-16).",
    );
  }

  /**
   * Record one response's token usage: an input event and an output event, so
   * the two rates stay separately visible. Never throws.
   */
  recordUsage(usage: AnthropicUsage): void {
    const tier = anthropicPriceTier(usage.model);
    const metadata = { model: usage.model };

    recordUsageSafely(this.#metering, {
      provider: "ANTHROPIC",
      operation: tier === "haiku" ? "anthropic.haiku_input" : "anthropic.sonnet_input",
      units: usage.inputTokens,
      latencyMs: usage.latencyMs,
      status: usage.status,
      metadata,
    });
    recordUsageSafely(this.#metering, {
      provider: "ANTHROPIC",
      operation: tier === "haiku" ? "anthropic.haiku_output" : "anthropic.sonnet_output",
      units: usage.outputTokens,
      // Latency belongs to the request, and is already on the input event.
      latencyMs: 0,
      status: usage.status,
      metadata,
    });
  }
}
