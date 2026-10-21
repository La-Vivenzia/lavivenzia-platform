/**
 * Paging, shared by every list surface.
 *
 * Extracted from the operations module when discovery needed the same thing.
 * One definition rather than two: a page size clamp that differs between the
 * operator console and the public site is a bug waiting to happen, and the
 * clamp is the control that stops a caller asking for the whole table.
 */

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

/**
 * Clamp caller-supplied paging.
 *
 * A non-integer page would produce a fractional `OFFSET`; an unbounded page
 * size would let one request pull every row. Both arrive from query strings, so
 * both are treated as hostile input rather than as a typo.
 */
export function normalisePaging(input: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
} {
  const page = Number.isInteger(input.page) && input.page! > 0 ? input.page! : 1;
  const requested = Number.isInteger(input.pageSize) ? input.pageSize! : PAGE_SIZE;

  return { page, pageSize: Math.min(Math.max(requested, 1), MAX_PAGE_SIZE) };
}

/** Build a page from a slice and the total the same filter matched. */
export function toPage<T>(
  items: readonly T[],
  total: number,
  paging: { page: number; pageSize: number },
): Page<T> {
  return {
    items,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    // At least one, so "1 of 0" never renders.
    totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
  };
}
