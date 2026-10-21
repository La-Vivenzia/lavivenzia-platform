"use client";

import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";

import { brand } from "@/data/content";
import { cn } from "@/lib/cn";

/**
 * The destination search. `floating` is the mobile treatment that overlaps the
 * hero photograph; `inline` is the wider desktop field.
 *
 * A real GET form submitting to `/experiences`. The demo this was ported from
 * called `preventDefault()` and went nowhere, which was right for a visual
 * mock and wrong here — the query belongs in the URL so the result is
 * shareable, bookmarkable and survives a reload, and the browser does the
 * navigation rather than a client router.
 *
 * `name="search"` is not arbitrary: it is the parameter `parseFilters` reads,
 * so this field feeds the same keyword path as the browse screen's own filter
 * form and the public API.
 */
export function SearchBar({
  variant = "floating",
  className,
}: {
  variant?: "floating" | "inline";
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const isInline = variant === "inline";

  return (
    <form
      role="search"
      method="get"
      action="/experiences"
      className={cn("relative w-full", className)}
    >
      <label htmlFor={`lv-search-${variant}`} className="sr-only">
        Search destinations
      </label>

      <div
        className={cn(
          "flex items-center gap-3 rounded-pill border bg-surface",
          "transition-[border-color,box-shadow,background-color] duration-300",
          isInline ? "h-[62px] pr-2 pl-6" : "h-14 pr-2 pl-4 sm:h-[58px] sm:pl-5",
          focused
            ? "border-line-strong shadow-raised"
            : "border-line shadow-card hover:border-line-strong",
        )}
      >
        <Search
          className={cn(
            "shrink-0 transition-colors duration-300",
            isInline ? "h-5 w-5" : "h-[19px] w-[19px]",
            focused ? "text-heading" : "text-fg-muted",
          )}
          strokeWidth={1.9}
          aria-hidden="true"
        />

        <input
          id={`lv-search-${variant}`}
          type="search"
          name="search"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={brand.searchPlaceholder}
          className={cn(
            "min-w-0 flex-1 bg-transparent font-light text-fg",
            "placeholder:text-fg-subtle focus:outline-none",
            "[&::-webkit-search-cancel-button]:appearance-none",
            isInline ? "text-base" : "text-[15px]",
          )}
        />

        <button
          type="submit"
          aria-label="Search destinations"
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-cta text-cta-fg",
            "transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "hover:bg-cta-hover hover:scale-[1.04] active:scale-95",
            isInline ? "h-[46px] w-[46px]" : "h-10 w-10 sm:h-11 sm:w-11",
          )}
        >
          <ArrowRight
            className={isInline ? "h-[19px] w-[19px]" : "h-[17px] w-[17px]"}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>
    </form>
  );
}
