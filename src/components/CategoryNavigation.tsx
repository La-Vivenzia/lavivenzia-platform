import Link from "next/link";

import { GenieSparkle, iconMap } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { QuickAccessItem } from "@/lib/home-content";

/**
 * The four quick-access entry points. Circular icon wells with the label below,
 * exactly as in the mobile reference; the desktop variant sits them on a row of
 * wider tiles that carry a short line of supporting copy.
 *
 * These were in-page anchors with a `useState` that tracked a "pressed" look
 * and nothing else. They are real links now, and the targets come from the
 * caller so the fourth slot can be a published category rather than a fixed
 * label. No longer a client component: there is no state left to hold.
 */
export function CategoryNavigation({
  items,
  variant = "compact",
  className,
}: {
  readonly items: readonly QuickAccessItem[];
  readonly variant?: "compact" | "expanded";
  readonly className?: string;
}) {
  if (variant === "expanded") {
    return (
      <ul className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5", className)}>
        {items.map((item) => {
          const Icon = item.icon === "genie" ? GenieSparkle : iconMap[item.icon];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "group flex h-full items-center gap-4 rounded-card border border-line",
                  "bg-surface px-5 py-5 shadow-card",
                  "transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "hover:-translate-y-1 hover:border-line-strong hover:shadow-raised",
                )}
              >
                <span
                  className={cn(
                    "grid h-12 w-12 shrink-0 place-items-center rounded-full",
                    "bg-surface-2 text-primary transition-colors duration-300",
                    "group-hover:bg-surface-3 dark:text-accent",
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <span className="font-sans text-[15px] font-medium text-heading">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <nav aria-label="Quick access" className={className}>
      <ul className="grid grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon === "genie" ? GenieSparkle : iconMap[item.icon];
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                className="group flex flex-col items-center gap-2.5 rounded-xl py-1 outline-offset-4"
              >
                <span
                  className={cn(
                    "grid h-14 w-14 place-items-center rounded-full",
                    "bg-surface-2 text-primary dark:text-accent",
                    "ring-1 ring-transparent",
                    "transition-[background-color,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "group-hover:bg-surface-3 group-active:scale-95",
                    "sm:h-[60px] sm:w-[60px]",
                  )}
                >
                  <Icon
                    className="h-[25px] w-[25px] sm:h-[26px] sm:w-[26px]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="max-w-full truncate text-[11.5px] leading-none font-normal text-fg xs:text-[12.5px] sm:text-[13px]">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
