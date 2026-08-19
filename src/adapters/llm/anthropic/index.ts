import type { LlmPort, LlmGenerateOptions } from "@/ports/llm";
import { NotImplementedError } from "@/lib/errors";

/**
 * Anthropic adapter — integration boundary only.
 *
 * Declared now so the dependency direction is fixed and no domain module grows
 * a direct provider import later (SYSTEM_DESIGN.md §10). AI discovery is a
 * later phase; the model tiering decision is recorded in ADR-0007.
 */
export class AnthropicLlmAdapter implements LlmPort {
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
}
