import Image from "next/image";
import Link from "next/link";

import { FavouriteButton } from "@/components/FavouriteButton";
import type { Experience } from "@/data/content";
import { cn } from "@/lib/cn";

/**
 * Editorial experience card — modern, spacious, photography-led.
 * High-resolution imagery sits clean on top; typography breathes naturally below.
 */
export function ExperienceCard({
  experience,
  className,
  sizes = "(max-width: 767px) 80vw, 32vw",
  href = "#",
}: {
  experience: Experience;
  className?: string;
  sizes?: string;
  showDescription?: boolean;
  href?: string;
}) {
  const { title, place, duration, image, alt, focus } = experience;

  const hasColon = title.includes(":");
  const venue = hasColon ? title.split(":")[0]!.trim() : title;
  const subtitle = hasColon
    ? title.split(":")[1]!.trim().replace(/\s*\([^)]*\)\s*$/, "")
    : "";

  return (
    <article className={cn("group relative flex flex-col", className)}>
      {/* 1. Immersive, Unobscured Photography */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-2 shadow-card">
        <Image
          src={image}
          alt={alt}
          fill
          sizes={sizes}
          style={{ objectPosition: focus ?? "50% 50%" }}
          className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
        />
        {/* Subtle glass duration pill on top-left */}
        {duration ? (
          <span className="absolute top-3 left-3 z-10 rounded-pill bg-black/40 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white ring-1 ring-white/20 backdrop-blur-md ring-inset">
            {duration}
          </span>
        ) : null}
        {/* Wishlist Heart Button on top-right */}
        <FavouriteButton label={title} size="sm" className="absolute top-3 right-3 z-10" />
      </div>

      {/* 2. Spacious, Clean Typography Below Image */}
      <div className="mt-3 px-0.5">
        <h3 className="truncate font-display text-[17px] font-medium text-heading sm:text-[18px]">
          <Link
            href={href}
            className="outline-none after:absolute after:inset-0 after:z-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-primary"
          >
            {venue}
          </Link>
        </h3>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[13px] font-light text-fg-muted">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-1 flex items-center gap-1.5 text-[12px] font-light text-fg-subtle">
          <span>{place}</span>
        </p>
      </div>
    </article>
  );
}
