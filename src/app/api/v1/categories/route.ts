import { jsonResponse, withRoute } from "@/lib/http";
import { prisma } from "@/lib/db";
import { createCategoryRepository } from "@/adapters/persistence/prisma/experience-repositories";

/**
 * GET /api/v1/categories — the active experience categories (FR-06).
 *
 * Unauthenticated: this is the public taxonomy, the same list travellers will
 * browse by. Nothing here is specific to a user, so there is nothing to
 * authorize and no reason to make the host editor wait on a session check.
 */
export const GET = withRoute(async () => {
  const categories = await createCategoryRepository(prisma).listActive();
  return jsonResponse({ categories });
});
