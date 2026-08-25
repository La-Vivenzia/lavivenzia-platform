import type { Metadata } from "next";
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
import { VerificationStatusBadge } from "@/components/ui/status";
import { requireOperator } from "@/lib/ops-page";
import { getOperationsService } from "@/lib/container";
import { formatRelativeTime } from "@/lib/format";
import { normalisePaging } from "@/modules/operations/service";
import { HOST_VERIFICATION_STATUSES, type HostVerificationStatus } from "@/modules/hosts/profile";

export const metadata: Metadata = { title: "Host review" };

/**
 * Host applications (FR-05, FR-14).
 *
 * A table rather than the editorial rows the experience queue uses. Hosts are
 * compared against each other on the same few attributes — status, contact,
 * how long they have waited — and a table is what makes a column scannable.
 * Listings are compared on their content, which is why those get imagery.
 */

const STATUS_LABELS: Readonly<Record<HostVerificationStatus, string>> = {
  DRAFT: "Not submitted",
  PENDING: "Awaiting verification",
  VERIFIED: "Verified",
  REJECTED: "Changes requested",
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function OpsHostsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireOperator();
  const params = await searchParams;

  const status = readParam(params, "status");
  const search = readParam(params, "search");
  const createdFrom = readParam(params, "createdFrom");
  const paging = normalisePaging({ page: Number(readParam(params, "page")) || 1 });

  const page = await getOperationsService().listHosts(principal, {
    ...paging,
    ...(status ? { status: status as HostVerificationStatus } : {}),
    ...(search ? { search } : {}),
    ...(createdFrom ? { createdFrom: new Date(createdFrom) } : {}),
  });

  const active = [status, search, createdFrom].filter(Boolean).length;
  const carried = Object.fromEntries(
    Object.entries({ status, search, createdFrom }).filter(([, v]) => v),
  ) as Record<string, string>;

  return (
    <OpsPage>
      <div className="flex flex-col gap-8">
        <SectionHeading
          eyebrow="Applications"
          title="Hosts"
          description="Everyone who has started onboarding, and where their verification stands."
        />

        <FilterBar action="/ops/hosts" activeCount={active}>
          <FilterField label="Search">
            <FilterText name="search" defaultValue={search} placeholder="Name, email or city" />
          </FilterField>
          <FilterField label="Status">
            <FilterSelect
              name="status"
              defaultValue={status}
              anyLabel="Any status"
              options={HOST_VERIFICATION_STATUSES.map((value) => ({
                value,
                label: STATUS_LABELS[value],
              }))}
            />
          </FilterField>
          <FilterField label="Joined after">
            <FilterText name="createdFrom" defaultValue={createdFrom} type="date" />
          </FilterField>
        </FilterBar>

        {page.items.length === 0 ? (
          <EmptyState
            eyebrow={active > 0 ? "No matches" : "None yet"}
            title={active > 0 ? "Nothing matches those filters" : "No host applications"}
            description={
              active > 0
                ? "Try widening the search, or clear the filters."
                : "Applications appear here as hosts complete their profile."
            }
          />
        ) : (
          <>
            <div className="border-line overflow-x-auto border">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="bg-surface-sunken border-line border-b">
                    {["Host", "Contact", "Status", "Listings", "Waiting"].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="text-text-muted px-5 py-3 text-[10px] font-semibold tracking-[0.14em] uppercase"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((host) => (
                    <tr
                      key={host.id}
                      className="border-line bg-surface hover:bg-surface-sunken/60 border-b transition-colors last:border-b-0"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/ops/hosts/${host.id}`}
                          className="font-display text-text hover:text-gold-deep text-[15px] transition-colors"
                        >
                          {host.displayName}
                        </Link>
                        <p className="text-text-subtle text-[12px]">
                          {host.hostType === "COMPANY" ? "Business" : "Individual"}
                          {host.city ? ` · ${host.city}` : ""}
                        </p>
                      </td>
                      <td className="text-text-muted px-5 py-4 text-[12px]">
                        {host.contactEmail ?? host.accountEmail}
                      </td>
                      <td className="px-5 py-4">
                        <VerificationStatusBadge status={host.verificationStatus} />
                      </td>
                      <td className="text-text px-5 py-4 text-[13px] tabular-nums">
                        {host.experienceCount}
                      </td>
                      <td className="text-text-subtle px-5 py-4 text-[12px]">
                        {host.submittedAt
                          ? formatRelativeTime(host.submittedAt)
                          : `Joined ${formatRelativeTime(host.createdAt)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={page} basePath="/ops/hosts" params={carried} />
          </>
        )}
      </div>
    </OpsPage>
  );
}
