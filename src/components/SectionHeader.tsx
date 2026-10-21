import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Cinzel section title on the left, a quiet gold text action on the right —
 * the recurring rhythm that holds the whole page together.
 */
export function SectionHeader({
  title,
  action,
  href = "#",
  size = "md",
  className,
  id,
}: {
  title: string;
  action?: string;
  href?: string;
  size?: "md" | "lg";
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <h2
        id={id}
        className={cn(
          "font-display font-normal tracking-tight",
          size === "lg"
            ? "text-[24px] leading-[1.18] xs:text-[26px] sm:text-4xl lg:text-[42px]"
            : "text-[21px] leading-[1.2] xs:text-[23px] sm:text-[26px] lg:text-[30px]",
        )}
      >
        {title}
      </h2>

      {action ? (
        <a
          href={href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1.5 pb-1",
            "text-[13px] font-normal text-accent-ink sm:text-sm",
            "transition-opacity duration-300 hover:opacity-75",
          )}
        >
          {action}
          <ArrowRight
            className="h-[15px] w-[15px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </a>
      ) : null}
    </div>
  );
}
