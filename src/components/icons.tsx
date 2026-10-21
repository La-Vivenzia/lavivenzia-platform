import type { SVGProps } from "react";
import { BedDouble, CalendarDays, Compass, Home, MapPin, User } from "lucide-react";

/**
 * The eight-point compass star used for AI Genie. Drawn here rather than pulled
 * from an icon set so the proportions match the brand references exactly.
 */
export function GenieStar({
  strokeWidth = 1.5,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 1.5c.55 4.9 1.6 7.4 3.6 8.6 1.3.8 3.4 1.4 6.9 1.9-4.9.55-7.4 1.6-8.6 3.6-.8 1.3-1.4 3.4-1.9 6.9-.55-4.9-1.6-7.4-3.6-8.6-1.3-.8-3.4-1.4-6.9-1.9 4.9-.55 7.4-1.6 8.6-3.6.8-1.3 1.4-3.4 1.9-6.9Z" />
    </svg>
  );
}

/** Compact four-point sparkle used at small sizes where the star reads muddy. */
export function GenieSparkle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.5c.42 3.6 1.35 5.5 2.9 6.4 1 .6 2.6 1.05 5.1 1.4-3.5.45-5.4 1.35-6.4 2.9-.6 1-1.05 2.6-1.6 5.3-.42-3.6-1.35-5.5-2.9-6.4-1-.6-2.6-1.05-5.1-1.4 3.5-.45 5.4-1.35 6.4-2.9.6-1 1.05-2.6 1.6-5.3Z"
        fill="currentColor"
      />
      <path
        d="M18.6 15.2c.2 1.5.55 2.3 1.2 2.7.42.25 1.1.45 2.2.6-1.5.2-2.3.55-2.7 1.2-.25.42-.45 1.1-.7 2.2-.2-1.5-.55-2.3-1.2-2.7-.42-.25-1.1-.45-2.2-.6 1.5-.2 2.3-.55 2.7-1.2.25-.42.45-1.1.7-2.2Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

export const iconMap = {
  bed: BedDouble,
  compass: Compass,
  genie: GenieSparkle,
  pin: MapPin,
  home: Home,
  calendar: CalendarDays,
  user: User,
} as const;

export type IconName = keyof typeof iconMap;
