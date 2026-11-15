"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Root error boundary for La Vivenzia.
 *
 * Catches unhandled Server Component and client rendering errors, providing
 * an unhurried, graceful recovery screen rather than Next.js default crash page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Structured log in production
    console.error("[La Vivenzia Root Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="text-accent-ink text-[11px] tracking-[0.24em] uppercase font-sans">
        Notice of Interruption
      </span>

      <h1 className="font-display text-heading mt-4 text-[32px] sm:text-[40px] leading-[1.15] max-w-lg">
        An unhurried pause
      </h1>

      <p className="text-fg-muted mt-4 max-w-md text-[14.5px] leading-relaxed font-light">
        A temporary service condition occurred while assembling this curation. You may refresh the view or return to the collection.
      </p>

      {error.digest ? (
        <span className="mt-3 text-[11px] font-mono text-text-subtle opacity-70">
          Ref: {error.digest}
        </span>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-pine text-ivory text-xs tracking-wider uppercase font-sans font-medium hover:bg-pine-deep transition-all shadow-sm"
        >
          Refresh View
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-full border border-line bg-surface-elevated/60 text-text-muted hover:text-text-primary text-xs tracking-wider uppercase font-sans transition-all"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
