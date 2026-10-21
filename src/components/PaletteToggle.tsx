"use client";

import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";

/** Mid-tones chosen to stay legible on both the ivory and the dark grounds. */
const SWATCH = {
  green: "#2f7355",
  blue: "#2f5c8f",
} as const;

const LABEL = {
  green: "emerald",
  blue: "navy",
} as const;

/**
 * Switches the colour family without touching light/dark. The two discs swap
 * places, so the control reads as "these are the two options, this one is on"
 * rather than as an abstract icon.
 */
export function PaletteToggle({ className }: { className?: string }) {
  const { palette, togglePalette, mounted } = useTheme();
  const isBlue = palette === "blue";
  const other = isBlue ? "green" : "blue";

  return (
    <button
      type="button"
      onClick={togglePalette}
      role="switch"
      aria-checked={mounted ? isBlue : undefined}
      aria-label={
        mounted
          ? `Colour palette: ${LABEL[palette]}. Switch to ${LABEL[other]}.`
          : "Switch colour palette"
      }
      title={mounted ? `Switch to the ${LABEL[other]} palette` : undefined}
      className={cn(
        "group grid shrink-0 place-items-center rounded-full",
        "ring-1 ring-line transition-[background-color,box-shadow] duration-300",
        "hover:bg-surface-2 hover:ring-line-strong",
        "h-8 w-8 xs:h-9 xs:w-9",
        className,
      )}
    >
      <span className="relative block h-[17px] w-[17px] xs:h-[19px] xs:w-[19px]">
        {/* The palette you would switch to, tucked behind. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full opacity-55",
            "transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "translate-x-[5px] scale-[0.82] group-hover:translate-x-[6px]",
          )}
          style={{ backgroundColor: SWATCH[other] }}
        />
        {/* The palette in use, in front. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full ring-1 ring-white/25 ring-inset",
            "transition-[background-color,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "-translate-x-[2px] group-active:scale-90",
          )}
          style={{ backgroundColor: SWATCH[palette] }}
        />
      </span>
    </button>
  );
}
