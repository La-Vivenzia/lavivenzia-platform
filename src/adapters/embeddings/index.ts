import type { EmbeddingsPort, EmbeddingVector } from "@/ports/embeddings";
import { NotImplementedError } from "@/lib/errors";

/**
 * ⚠️ No embeddings provider has been selected — this is a blocking decision
 * awaiting founder approval (ADR-0007).
 *
 * The port and this placeholder exist so the boundary is fixed and the eventual
 * adapter is a drop-in. Deliberately NOT implemented, and deliberately not
 * defaulting to a provider: choosing one here would silently commit the vector
 * dimension into the database schema.
 */
export class UnconfiguredEmbeddingsAdapter implements EmbeddingsPort {
  get dimensions(): number {
    throw new NotImplementedError(
      "No embeddings provider is configured. The provider selection is pending " +
        "founder approval and determines the pgvector column dimension.",
    );
  }

  embed(_texts: readonly string[]): Promise<readonly EmbeddingVector[]> {
    throw new NotImplementedError(
      "No embeddings provider is configured. See docs/adr/0007-llm-and-embeddings.md.",
    );
  }
}
