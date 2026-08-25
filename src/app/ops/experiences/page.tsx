import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { OpsPage } from "@/components/ops/shell";
import {
  FilterBar,
  FilterField,
  FilterSelect,
  FilterText,
  Pagination,
} from "@/components/ops/filters";
import { EmptyState, SectionHeading } from "@/components/ui/feedback";
import { ExperienceStatusBadge, VerificationStatusBadge } from "@/components/ui/status";
import { requireOperator } from "@/lib/ops-page";
import { getOperationsService } from "@/lib/container";
import { prisma } from "@/lib/db";
import { createCategoryRepository } from "@/adapters/persistence/prisma/experience-repositories";
import { formatMoneyMinor, formatRelativeTime } from "@/lib/format";
import { normalisePaging } from "@/modules/operations/service";
import { EXPERIENCE_STATUSES, type ExperienceStatus } from "@/modules/experiences/lifecycle";

export const metadata: Metadata = { title: "Experience review" };

/**
 * The experience review queue (FR-14).
 *
 * Filters come from the URL and are applied in PostgreSQL — nothing is loaded
 * into the browser to be sliced there. Oldest submission first, because a
 * review queue is a queue: any other ordering means the item that has waited
 * longest is the one nobody sees.
 */

const STATUS_LABELS: Readonly<Record<ExperienceStatus, string>> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  REJECTED: "Changes requested",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  // A repeated query parameter arrives as an array; take the first rather than
  // rendering "[object Object]" into a form field.
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function OpsExperiencesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireOperator();
  const params = await searchParams;

  const status = readParam(params, "status");
  const search = readParam(params, "search");
  const city = readParam(params, "city");
  const categoryId = readParam(params, "categoryId");
  const submittedFrom = readParam(params, "submittedFrom");

  const paging = normalisePaging({ page: Number(readParam(params, "page")) || 1 });

  const [page, categories] = await Promise.all([
    getOperationsService().listExperiences(principal, {
      ...paging,
      ...(status ? { status: status as ExperienceStatus } : {}),
      ...(search ? { search } : {}),
      ...(city ? { city } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(submittedFrom ? { submittedFrom: new Date(submittedFrom) } : {}),
    }),
    createCategoryRepository(prisma).listActive(),
  ]);

  const active = [status, search, city, categoryId, submittedFrom].filter(Boolean).length;
  const carried = Object.fromEntries(
    Object.entries({ status, search, city, categoryId, submittedFrom }).filter(([, v]) => v),
  ) as Record<string, string>;

  return (
    <OpsPage>
      <div className="flex flex-col gap-8">
        <SectionHeading
          eyebrow="Review queue"
          title="Experiences"
          description="Oldest submission first. Everything a host has sent in, and everything already decided."
        />

        <FilterBar action="/ops/experiences" activeCount={active}>
          <FilterField label="Search">
            <FilterText name="search" defaultValue={search} placeholder="Title, city or host" />
          </FilterField>
          <FilterField label="Status">
            <FilterSelect
              name="status"
              defaultValue={status}
              anyLabel="Any status"
              options={EXPERIENCE_STATUSES.map((value) => ({
                value,
                label: STATUS_LABELS[value],
              }))}
            />
          </FilterField>
          <FilterField label="Category">
            <FilterSelect
              name="categoryId"
              defaultValue={categoryId}
              anyLabel="Any category"
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
          </FilterField>
          <FilterField label="City">
            <FilterText name="city" defaultValue={city} placeholder="Any" />
          </FilterField>
          <FilterField label="Submitted after">
            <FilterText name="submittedFrom" defaultValue={submittedFrom} type="date" />
          </FilterField>
        </FilterBar>

        {page.items.length === 0 ? (
          <EmptyState
            eyebrow={active > 0 ? "No matches" : "Queue empty"}
            title={active > 0 ? "Nothing matches those filters" : "Nothing to review"}
            description={
              active > 0
                ? "Try widening the search, or clear the filters to see the whole queue."
                : "Listings appear here the moment a host submits one."
            }
          />
        ) : (
          <>
            <ul className="border-line bg-line flex flex-col gap-px border">
              {page.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/ops/experiences/${item.id}`}
                    className="bg-surface hover:shadow-panel group flex flex-col gap-4 px-5 py-5 transition-shadow duration-300 ease-[var(--ease-out-soft)] sm:flex-row sm:items-center sm:gap-6 sm:px-6"
                  >
                    <div className="bg-surface-sunken relative aspect-[16/10] w-full shrink-0 overflow-hidden sm:aspect-[4/3] sm:w-28">
                      {item.coverUrl ? (
                        <Image
                          src={item.coverUrl}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 112px, 100vw"
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-text-subtle absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.14em] uppercase">
                          None
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <ExperienceStatusBadge status={item.status} />
                        {item.categoryName ? (
                          <span className="text-text-subtle text-[11px] tracking-[0.1em] uppercase">
                            {item.categoryName}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="font-display text-text truncate text-[16px]">{item.title}</h3>
                      <p className="text-text-muted truncate text-[12px]">
                        {item.hostName}
                        {item.city ? ` · ${item.city}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-row items-center gap-5 sm:flex-col sm:items-end sm:gap-1.5">
                      <VerificationStatusBadge status={item.hostVerification} />
                      <span className="text-text text-[13px] tabular-nums">
                        {formatMoneyMinor(item.basePriceMinor, item.currency) ?? "—"}
                      </span>
                      <span className="text-text-subtle text-[11px]">
                        {item.submittedAt
                          ? `Submitted ${formatRelativeTime(item.submittedAt)}`
                          : `Edited ${formatRelativeTime(item.updatedAt)}`}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <Pagination page={page} basePath="/ops/experiences" params={carried} />
          </>
        )}
      </div>
    </OpsPage>
  );
}
