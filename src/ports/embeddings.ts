/**
 * Embeddings port.
 *
 * ⚠️ NO PROVIDER IS SELECTED. Awaiting founder approval (ADR-0007).
 *
 * This is a blocking dependency for schema work, not just a vendor preference:
 * the chosen model fixes the vector dimension, which is baked into the pgvector
 * column definition. The `vector` extension is enabled, but no vector column
 * exists yet and none should be added until this is resolved.
 */

export interface EmbeddingVector {
  readonly values: readonly number[];
  /** Model identifier, persisted alongside the vector so re-embedding on a
   *  provider change can be done incrementally rather than as a full rebuild. */
  readonly model: string;
}

export interface EmbeddingsPort {
  /** Dimension of the vectors this provider emits. */
  readonly dimensions: number;

  embed(texts: readonly string[]): Promise<readonly EmbeddingVector[]>;
}
