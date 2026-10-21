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
 * The supplied brand asset, used as-is. Its transparent background means the
 * single gold artwork sits correctly on both the ivory and the pine surfaces,
 * so no per-theme variant is needed.
 */
export function Logo({ variant = "full", className, priority }: LogoProps) {
  const isFull = variant === "full";
  return (
    <Image
      src={isFull ? "/logo-lavivenzia.png" : "/logo-mark.png"}
      alt={`${brand.name} — ${brand.tagline}`}
      width={isFull ? 1449 : 239}
      height={326}
      priority={priority}
      className={cn("w-auto select-none", className)}
      sizes="(max-width: 1023px) 180px, 260px"
    />
  );
}
