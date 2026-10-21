import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/feedback";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { getDiscoveryService } from "@/lib/container";

export const metadata: Metadata = {
  title: "Collections",
  description: "Browse La Vivenzia experiences by the kind of thing you want to do.",
};

/**
 * The category index (FR-01).
 *
 * Only categories with something published appear, for the same reason
 * destinations behave that way: a taxonomy listing everything the database
 * knows about sends travellers into empty pages.
 *
 * A tile grid rather than photography. A category is a word, not a place, and
 * choosing a photograph to stand for "Culinary" is an editorial decision nobody
 * has made.
 */
export default async function CategoriesPage() {
  const categories = await getDiscoveryService().categories();

  return (
    <PageBody>
      <div className="flex flex-col gap-10">
        <PageHeader
          eyebrow="By interest"
          title="Collections"
          description="The kinds of experience our hosts run, and how many of each are live."
        />

        {categories.length === 0 ? (
          <EmptyState
            title="No collections have anything published yet"
            description="A collection appears here as soon as an experience in it is approved."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.key}>
                <Link
                  href={`/categories/${encodeURIComponent(category.key)}`}
                  className="group border-line bg-surface shadow-card hover:border-line-strong hover:shadow-raised flex h-full flex-col gap-2 rounded-card border p-5 transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1"
                >
                  <span className="font-display text-heading text-[18px] leading-tight">
                    {category.name}
                  </span>

                  {category.description ? (
                    <span className="text-fg-muted line-clamp-2 text-[13.5px] leading-[1.6] font-light">
                      {category.description}
                    </span>
                  ) : null}

                  <span className="text-fg-subtle mt-auto pt-2 text-[10px] tracking-[0.16em] uppercase">
                    {category.experienceCount}{" "}
                    {category.experienceCount === 1 ? "experience" : "experiences"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageBody>
  );
}
