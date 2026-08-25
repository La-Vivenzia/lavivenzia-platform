import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireHostProfile } from "@/lib/host-page";
import { getExperienceService } from "@/lib/container";
import { prisma } from "@/lib/db";
import { createCategoryRepository } from "@/adapters/persistence/prisma/experience-repositories";
import { NotFoundError } from "@/lib/errors";
import { ExperienceEditor } from "./experience-editor";

export const metadata: Metadata = { title: "Edit experience" };

/**
 * The experience editor (FR-06).
 *
 * The listing and the category list are loaded on the server, in parallel, so
 * the editor renders complete rather than flashing empty selects while it
 * fetches its own options.
 */
export default async function EditExperiencePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const { principal, host } = await requireHostProfile();

  // The try wraps only the fetch. Constructing JSX inside it would not do what
  // it looks like it does: React renders the element later, so a render-time
  // error escapes the catch entirely — which is what the lint rule here exists
  // to prevent.
  let data: Awaited<ReturnType<typeof loadExperience>>;
  try {
    data = await loadExperience(principal, host, id);
  } catch (error) {
    // A listing belonging to another host resolves to not-found, exactly as it
    // does through the API. Rendering the framework's 404 keeps that answer
    // identical whichever way the id was reached.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <ExperienceEditor initial={data.view} categories={data.categories} />;
}

/** The listing and its category options, fetched together. */
async function loadExperience(
  principal: Parameters<ReturnType<typeof getExperienceService>["getOwn"]>[0],
  host: Parameters<ReturnType<typeof getExperienceService>["getOwn"]>[1],
  id: string,
) {
  const [view, categories] = await Promise.all([
    getExperienceService().getOwn(principal, host, id),
    createCategoryRepository(prisma).listActive(),
  ]);

  return { view, categories };
}
