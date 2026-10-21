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
      <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex flex-col gap-4">
            <Skeleton className="aspect-[4/3] w-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
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
