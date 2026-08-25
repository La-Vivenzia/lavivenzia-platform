import Link from "next/link";
import type { ReactNode } from "react";
import type { Page } from "@/modules/operations/ports";

/**
 * Queue filtering and paging.
 *
 * A plain GET form, not a client component. Three consequences, all of them
 * wanted: the filter state lives in the URL so an operator can bookmark or
 * share "everything awaiting review in Jaipur"; the page works without
 * JavaScript; and there is no client-side store to fall out of step with what
 * the server actually returned.
 */

export function FilterBar({
  action,
  children,
  activeCount,
}: {
  readonly action: string;
  readonly children: ReactNode;
  readonly activeCount: number;
}) {
  return (
    <form
      method="get"
      action={action}
      className="border-line bg-surface flex flex-col gap-4 border p-5"
    >
      <div className="flex flex-wrap items-end gap-4">{children}</div>

      <div className="border-line flex flex-wrap items-center gap-4 border-t pt-4">
        <button
          type="submit"
          className="border-line-strong hover:border-gold hover:text-gold-deep hover:bg-gold-wash/40 inline-flex h-9 items-center rounded-sm border px-4 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors"
        >
          Apply
        </button>

        {activeCount > 0 ? (
          <Link
            href={action}
            className="text-text-muted hover:text-text text-[12px] underline underline-offset-4"
          >
            Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function FilterField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
      <span className="text-text-muted text-[11px] font-medium tracking-[0.08em] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

const CONTROL =
  "h-9 w-full rounded-none border-0 border-b border-line-strong bg-transparent px-0 text-[14px] " +
  "transition-colors hover:border-text-subtle focus:border-gold focus:outline-none";

export function FilterText({
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  readonly name: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly type?: string;
}) {
  return (
    <input
      type={type}
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className={CONTROL}
    />
  );
}

export function FilterSelect({
  name,
  defaultValue,
  options,
  anyLabel,
}: {
  readonly name: string;
  readonly defaultValue?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly anyLabel: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={`${CONTROL} appearance-none`}>
      <option value="">{anyLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Paging controls.
 *
 * Rendered as links so the browser handles history, and the current page is
 * stated in words rather than as a strip of numbered buttons — an operator
 * working a queue moves forward one page at a time and rarely jumps.
 */
export function Pagination<T>({
  page,
  basePath,
  params,
}: {
  readonly page: Page<T>;
  readonly basePath: string;
  readonly params: Readonly<Record<string, string>>;
}) {
  if (page.total === 0) return null;

  const href = (target: number): string => {
    const query = new URLSearchParams({ ...params, page: String(target) });
    return `${basePath}?${query.toString()}`;
  };

  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);

  return (
    <nav
      aria-label="Pagination"
      className="border-line flex flex-wrap items-center justify-between gap-4 border-t pt-5"
    >
      <p className="text-text-muted text-[12px] tabular-nums">
        {first}–{last} of {page.total}
      </p>

      <div className="flex items-center gap-2">
        {page.page > 1 ? (
          <Link
            href={href(page.page - 1)}
            rel="prev"
            className="border-line-strong hover:border-gold hover:text-gold-deep inline-flex h-8 items-center rounded-sm border px-3 text-[11px] tracking-[0.1em] uppercase transition-colors"
          >
            Previous
          </Link>
        ) : (
          <span className="border-line text-text-subtle inline-flex h-8 cursor-not-allowed items-center rounded-sm border px-3 text-[11px] tracking-[0.1em] uppercase">
            Previous
          </span>
        )}

        <span className="text-text-muted px-2 text-[12px] tabular-nums">
          {page.page} / {page.totalPages}
        </span>

        {page.page < page.totalPages ? (
          <Link
            href={href(page.page + 1)}
            rel="next"
            className="border-line-strong hover:border-gold hover:text-gold-deep inline-flex h-8 items-center rounded-sm border px-3 text-[11px] tracking-[0.1em] uppercase transition-colors"
          >
            Next
          </Link>
        ) : (
          <span className="border-line text-text-subtle inline-flex h-8 cursor-not-allowed items-center rounded-sm border px-3 text-[11px] tracking-[0.1em] uppercase">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
