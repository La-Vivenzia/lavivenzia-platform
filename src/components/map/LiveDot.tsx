import { cn } from "@/lib/cn";

/**
 * The pulsing "live" dot used wherever live tracking is offered — the same
 * success green the tracker's own status pill uses, so the signal is one thing
 * across the site. The halo is decorative and stops under reduced motion.
 */
export function LiveDot({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex h-2 w-2 shrink-0", className)}>
      <span className="absolute inset-0 rounded-full bg-success opacity-70 motion-safe:animate-ping" />
      <span className="relative h-2 w-2 rounded-full bg-success" />
    </span>
  );
}
