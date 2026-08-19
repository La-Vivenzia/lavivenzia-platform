/**
 * LLM port.
 *
 * AI is an intelligence layer over verified marketplace data. Implementations
 * and callers must respect the grounding rules in CLAUDE.md §7: the model may
 * interpret, retrieve, rank, summarize and recommend, but it is never the
 * source of truth for price, availability, booking status, refund status, host
 * information, policy or inventory.
 *
 * Every AI surface must degrade to a deterministic path when this port is
 * unavailable.
 */

export interface LlmGenerateOptions {
  /** Hard ceiling; callers must set one appropriate to the surface. */
  readonly maxOutputTokens: number;
  /** Abort budget in milliseconds. Search-path callers must set this low. */
  readonly timeoutMs: number;
}

export interface LlmPort {
  /**
   * Generate a value conforming to `schemaName`, validated by the caller before
   * use. Implementations must reject rather than repair non-conforming output.
   */
  generateStructured<T>(input: {
    readonly system: string;
    readonly prompt: string;
    readonly schemaName: string;
    readonly options: LlmGenerateOptions;
  }): Promise<T>;
}
