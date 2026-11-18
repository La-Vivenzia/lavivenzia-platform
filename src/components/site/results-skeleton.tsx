import { Skeleton } from "@/components/ui/feedback";

/**
 * The loading state for a results grid.
 *
 * Rendered through a `<Suspense>` **inside** the list page rather than through a
 * segment-level `loading.tsx`. That is not a style preference: a `loading.tsx`
 * at `experiences/` wraps every nested route including `experiences/[slug]`, so
 * the shell flushes — committing HTTP 200 — before the detail page can call
 * `notFound()`. The result was a soft 404: the right page under the wrong
 * status, which is exactly what a search engine indexes.
 *
 * Scoped here, the skeleton still streams for the slow part while the filters
 * above it render immediately, and the detail route keeps its real 404.
 */
export function ResultsSkeleton({ count = 6 }: { readonly count?: number }) {
  return (
    <div>
      <span className="sr-only" role="status">
        Loading experiences
      </span>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card"
          >
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-2">
              <Skeleton className="h-full w-full rounded-none" />
            </div>

            <div className="flex flex-1 flex-col p-3 sm:p-3.5 lg:p-4">
              <div className="flex h-[42px] flex-col gap-1.5 lg:h-[46px]">
                <Skeleton className="h-3.5 w-4/5 rounded-sm" />
                <Skeleton className="h-3.5 w-3/5 rounded-sm" />
              </div>
              <Skeleton className="mt-1 h-3 w-1/2 rounded-sm" />
              <div className="mt-auto pt-3">
                <Skeleton className="h-4.5 w-16 rounded-pill" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The same idea for the destination tiles. */
export function DestinationsSkeleton({ count = 6 }: { readonly count?: number }) {
  return (
    <div>
      <span className="sr-only" role="status">
        Loading destinations
      </span>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className="aspect-[3/2] w-full" />
        ))}
      </div>
    </div>
  );
}
