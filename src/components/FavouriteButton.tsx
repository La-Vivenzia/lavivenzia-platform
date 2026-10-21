"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Sits over photography in both themes, so it uses its own fixed translucent
 * dark treatment rather than a theme token — that reads correctly either way.
 */
export function FavouriteButton({
  label,
  className,
  size = "md",
}: {
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [saved, setSaved] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setSaved((v) => !v);
      }}
      className={cn(
        "z-20 grid place-items-center rounded-full",
        "bg-black/25 text-white backdrop-blur-[6px]",
        "ring-1 ring-white/25 ring-inset",
        "transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:scale-[1.08] hover:bg-black/40 active:scale-95",
        "focus-visible:outline-white",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        className,
      )}
    >
      <Heart
        className={cn(
          "transition-[fill,color,transform] duration-300",
          size === "sm" ? "h-[15px] w-[15px]" : "h-4 w-4",
          saved ? "scale-110 fill-accent text-accent" : "fill-transparent",
        )}
        strokeWidth={1.9}
        aria-hidden="true"
      />
    </button>
  );
}
