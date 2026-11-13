import type { PrismaClient } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { TasteGenomeAccountRepository } from "@/modules/taste-genome/ports";

/**
 * Prisma implementation of the Taste Genome account port.
 *
 * Writes are a single `jsonb ||` on the one key, not a read-modify-write: the
 * profile settings screen writes its own keys into the same column, and a
 * read-then-write here would race it and drop whichever landed second. A
 * column that somehow holds a non-object is treated as empty rather than
 * concatenated into an array.
 */

function assertUpdated(count: number): void {
  // A soft-deleted or missing account: nothing to anchor to, and saying it was
  // saved would be untrue.
  if (count === 0) throw new NotFoundError("That account is no longer available.");
}

export function createTasteGenomeAccountRepository(
  prisma: PrismaClient,
): TasteGenomeAccountRepository {
  return {
    async load(userId) {
      const row = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { preferences: true },
      });
      const preferences = row?.preferences;
      if (preferences === null || typeof preferences !== "object" || Array.isArray(preferences)) {
        return null;
      }
      return (preferences as Record<string, unknown>).tasteGenome ?? null;
    },

    async save(userId, genome) {
      const json = JSON.stringify(genome);
      const count = await prisma.$executeRaw`
        UPDATE "users"
        SET "preferences" =
              CASE WHEN jsonb_typeof("preferences") = 'object' THEN "preferences" ELSE '{}'::jsonb END
              || jsonb_build_object('tasteGenome', ${json}::jsonb),
            "updated_at" = now()
        WHERE "id" = ${userId}::uuid AND "deleted_at" IS NULL
      `;
      assertUpdated(count);
    },

    async anchor(userId, genome, fullName) {
      const json = JSON.stringify(genome);
      const count = await prisma.$executeRaw`
        UPDATE "users"
        SET "preferences" =
              CASE WHEN jsonb_typeof("preferences") = 'object' THEN "preferences" ELSE '{}'::jsonb END
              || jsonb_build_object('tasteGenome', ${json}::jsonb),
            "full_name" = COALESCE(NULLIF(btrim("full_name"), ''), ${fullName}),
            "updated_at" = now()
        WHERE "id" = ${userId}::uuid AND "deleted_at" IS NULL
      `;
      assertUpdated(count);
    },
  };
}
