import Image from "next/image";

import { brand } from "@/data/content";
import { cn } from "@/lib/cn";

type LogoProps = {
  /** `full` is the complete lockup; `mark` is the pin symbol on its own. */
  variant?: "full" | "mark";
  className?: string;
  priority?: boolean;
};

/**
 * The brand lockup:
 * Light mode displays the deep emerald wordmark, dark mode displays the radiant warm ivory wordmark.
 */
export function Logo({ variant = "full", className, priority }: LogoProps) {
  const isFull = variant === "full";

  if (!isFull) {
    return (
      <Image
        src="/logo-mark.png"
        alt={`${brand.name} — ${brand.tagline}`}
        width={239}
        height={326}
        priority={priority}
        className={cn("w-auto select-none object-contain", className)}
      />
    );
  }

  return (
    <>
      <Image
        src="/brand/la-vivenzia-logo-light.png"
        alt={`${brand.name} — ${brand.tagline}`}
        width={1213}
        height={254}
        priority={priority}
        className={cn("w-auto select-none object-contain dark:hidden", className)}
        sizes="(max-width: 1023px) 140px, 180px"
      />
      <Image
        src="/brand/la-vivenzia-logo-dark.png"
        alt={`${brand.name} — ${brand.tagline}`}
        width={1213}
        height={254}
        priority={priority}
        className={cn("hidden w-auto select-none object-contain dark:inline-block", className)}
        sizes="(max-width: 1023px) 140px, 180px"
      />
    </>
  );
}
