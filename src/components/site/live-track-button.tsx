"use client";

import { Radar } from "lucide-react";

import { LiveDot } from "@/components/map/LiveDot";
import { cn } from "@/lib/cn";

/**
 * "Walk there with live tracking" — opens the live map tracker straight onto
 * the listing's stored coordinates (CLAUDE.md §7: nothing on the map is
 * generated). Render it only when the listing has a pinned point.
 */
export function LiveTrackButton({
  slug,
  title,
  latitude,
  longitude,
  fullWidth = false,
  className,
  onTrack,
}: {
  readonly slug: string;
  readonly title: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly fullWidth?: boolean;
  readonly className?: string;
  readonly onTrack?: () => void;
}) {
  function handleClick() {
    if (onTrack) {
      onTrack();
    } else {
      window.dispatchEvent(
        new CustomEvent("lavivenzia:start-live-tracking", {
          detail: { slug, title, latitude, longitude },
        }),
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-haspopup="dialog"
      aria-label={`Walk there with live tracking to ${title}`}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-cta px-5 text-[13.5px] font-medium text-cta-fg shadow-card",
        "transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-cta-hover active:translate-y-0",
        fullWidth ? "w-full" : "w-fit",
        className,
      )}
    >
      <Radar className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      Walk there with live tracking
      <LiveDot className="ml-0.5" />
    </button>
  );
}
