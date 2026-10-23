import { Radar } from "lucide-react";

import { LiveTrackTrigger } from "@/components/copilot/CopilotProvider";
import { LiveDot } from "@/components/map/LiveDot";
import { cn } from "@/lib/cn";

/**
 * "Live Track to this experience" — opens the live map tracker straight onto
 * the listing's stored coordinates (CLAUDE.md §7: nothing on the map is
 * generated). Render it only when the listing has a pinned point.
 *
 * A server component; the trigger inside it is the client boundary, and its
 * props are plain data so they cross it intact.
 */
export function LiveTrackButton({
  slug,
  title,
  latitude,
  longitude,
  fullWidth = false,
  className,
}: {
  readonly slug: string;
  readonly title: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly fullWidth?: boolean;
  readonly className?: string;
}) {
  return (
    <LiveTrackTrigger
      target={{ slug, title, destination: { lat: latitude, lng: longitude } }}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-cta px-5 text-[13.5px] font-medium text-cta-fg shadow-card",
        "transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-cta-hover active:translate-y-0",
        fullWidth ? "w-full" : "w-fit",
        className,
      )}
    >
      <Radar className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      Live Track to this experience
      <LiveDot className="ml-0.5" />
    </LiveTrackTrigger>
  );
}
