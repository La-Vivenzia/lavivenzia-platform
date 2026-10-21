"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";

/**
 * A sliding two-state switch. The knob travels, the two glyphs cross-fade, and
 * nothing bounces — the transition should read as a change of light, not a toy.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={mounted ? isDark : undefined}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Switch colour theme"}
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : undefined}
      className={cn(
        "group relative inline-flex h-8 w-[46px] shrink-0 items-center rounded-pill xs:h-9 xs:w-[58px]",
        "border border-line bg-surface-2 px-[3px] xs:px-1",
        "transition-colors duration-300 hover:border-line-strong",
        className,
      )}
    >
      {/* Travelling knob */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 left-[3px] h-[26px] w-[26px] -translate-y-1/2 rounded-full xs:left-1 xs:h-7 xs:w-7",
          "bg-cta shadow-card",
          "transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          isDark ? "translate-x-[17px] xs:translate-x-[23px]" : "translate-x-0",
        )}
      />
      {/* Glyphs sit above the knob and invert as it passes underneath */}
      <span className="relative z-10 flex h-[26px] w-[26px] items-center justify-center xs:h-7 xs:w-7">
        <Sun
          className={cn(
            "h-[15px] w-[15px] transition-colors duration-300",
            isDark ? "text-fg-subtle" : "text-cta-fg",
          )}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </span>
      <span className="relative z-10 ml-[5px] flex h-[26px] w-[26px] items-center justify-center xs:ml-[7px] xs:h-7 xs:w-7">
        <Moon
          className={cn(
            "h-[15px] w-[15px] transition-colors duration-300",
            isDark ? "text-cta-fg" : "text-fg-subtle",
          )}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
