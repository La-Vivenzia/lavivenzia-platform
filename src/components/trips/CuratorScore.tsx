import { BadgeCheck, Star } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A La Vivenzia curator score.
 *
 * Says whose score it is, every time, and says "provisional" until a curator
 * has signed it off. The check mark appears only on a verified score — it is
 * the one thing on the badge that would otherwise overclaim.
 */
export function CuratorScore({
  score,
  verified,
  className,
}: {
  readonly score: number;
  readonly verified: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-accent/35 bg-surface px-2.5 py-1 text-[11px] text-fg",
        className,
      )}
    >
      <Star className="h-3 w-3 fill-accent text-accent" strokeWidth={1.6} aria-hidden="true" />
      <span className="font-medium tabular-nums">{score.toFixed(1)}</span>
      <span className="text-fg-muted">Curator score</span>
      {verified ? (
        <BadgeCheck
          className="h-3.5 w-3.5 text-primary dark:text-accent"
          strokeWidth={1.6}
          aria-label="Verified by a curator"
        />
      ) : (
        <span className="text-fg-muted">· provisional</span>
      )}
    </span>
  );
}
