import type { StoredTasteGenome } from "./repository";

/**
 * Persistence port for a signed-in patron's genome. The Prisma implementation
 * lives in `src/adapters/persistence/prisma/taste-genome-repositories.ts`.
 *
 * It is a key inside `users.preferences`, not a table: the genome is a bag of
 * taste tags and weights the patron owns, the same kind of data the profile
 * already keeps there. Writes must merge that one key, never replace the
 * column, or a genome save would erase the profile's dietary and vibe tags.
 */
export interface TasteGenomeAccountRepository {
  /** The raw `preferences.tasteGenome` value; null when absent or the account is gone. */
  load(userId: string): Promise<unknown>;
  save(userId: string, genome: StoredTasteGenome): Promise<void>;
  /**
   * Save the genome and set the account's name if it has none, in one write.
   *
   * Only a blank name is filled: the patron proved the mailbox, but a name
   * typed into an onboarding card should not silently replace one they chose
   * in settings.
   */
  anchor(userId: string, genome: StoredTasteGenome, fullName: string | null): Promise<void>;
}
