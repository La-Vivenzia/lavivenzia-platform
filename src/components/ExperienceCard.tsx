import Image from "next/image";

import type { Experience } from "@/data/content";
import { cn } from "@/lib/cn";

/**
 * Editorial experience card — a tall photograph with the story set over it.
 * Shared by the mobile rail and the desktop three-up grid.
 */
export function ExperienceCard({
  experience,
  className,
  sizes = "(max-width: 767px) 78vw, 32vw",
  showDescription = true,
  href = "#",
}: {
  experience: Experience;
  className?: string;
  sizes?: string;
  showDescription?: boolean;
  href?: string;
}) {
  const { title, place, duration, image, alt, description, focus } = experience;

  return (
    <article
      className={cn(
        "group relative isolate flex overflow-hidden rounded-card shadow-card",
        "transition-shadow duration-500 hover:shadow-editorial",
        className,
      )}
    >
      <Image
        src={image}
        alt={alt}
        fill
        sizes={sizes}
        style={{ objectPosition: focus ?? "50% 50%" }}
        className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "var(--lv-scrim-deep)" }}
      />

      <div className="relative z-10 mt-auto w-full p-4 sm:p-6">
        <p className="eyebrow text-[8.5px] tracking-[0.14em] text-accent sm:text-[9.5px] sm:tracking-[0.18em]">
          {place}
          <span className="mx-2 opacity-50">/</span>
          {duration}
        </p>
        <h3 className="mt-2.5 font-display text-[19px] leading-[1.22] text-white sm:text-[22px]">
          <a href={href} className="after:absolute after:inset-0 focus-visible:outline-white">
            {title}
          </a>
        </h3>
        {showDescription ? (
          <p className="mt-2.5 max-w-[36ch] text-[13px] leading-[1.55] font-light text-white/75">
            {description}
          </p>
        ) : null}
      </div>
    </article>
  );
}
