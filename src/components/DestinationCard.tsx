import Image from "next/image";

import { FavouriteButton } from "@/components/FavouriteButton";
import type { Destination } from "@/data/content";
import { cn } from "@/lib/cn";

type Variant = "card" | "overlay";

type Props = {
  destination: Destination;
  /** `card` = image over a surface panel; `overlay` = full-bleed with a scrim. */
  variant?: Variant;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  href?: string;
};

/**
 * One card component serves the mobile rails, the desktop grid and the popular
 * destinations strip — only the container sizing changes at the call site.
 */
export function DestinationCard({
  destination,
  variant = "card",
  className,
  imageClassName,
  sizes = "(max-width: 767px) 60vw, (max-width: 1279px) 33vw, 25vw",
  priority,
  href = "#",
}: Props) {
  const { name, country, badge, image, alt, focus } = destination;

  if (variant === "overlay") {
    return (
      <article
        className={cn(
          "group relative isolate overflow-hidden rounded-card",
          "shadow-card transition-shadow duration-500 hover:shadow-editorial",
          className,
        )}
      >
        <Image
          src={image}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          style={{ objectPosition: focus ?? "50% 50%" }}
          className={cn(
            "object-cover",
            "transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "group-hover:scale-[1.06]",
            imageClassName,
          )}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "var(--lv-scrim)" }}
        />

        <FavouriteButton label={name} className="absolute top-3 right-3" size="sm" />

        <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">
          <span className="eyebrow text-[10px] text-white/70">{badge}</span>
          <h3 className="mt-1.5 line-clamp-2 font-display text-lg leading-tight text-white sm:text-xl lg:text-2xl">
            {name}
          </h3>
          <p className="mt-0.5 text-[13px] font-light text-white/75 lg:mt-1 lg:text-[14.5px]">
            {country}
          </p>
        </div>

        <a href={href} className="absolute inset-0 z-10 rounded-card focus-visible:outline-white">
          <span className="sr-only">{`View ${name}, ${country}`}</span>
        </a>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-card",
        "border border-line bg-surface shadow-card",
        "transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-raised",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-2">
        <Image
          src={image}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          style={{ objectPosition: focus ?? "50% 50%" }}
          className={cn(
            "object-cover",
            "transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "group-hover:scale-[1.06]",
            imageClassName,
          )}
        />
        <FavouriteButton label={name} className="absolute top-2.5 right-2.5 z-20" size="sm" />
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5 lg:p-4">
        <h3 className="line-clamp-2 h-[42px] font-sans text-[14.5px] leading-snug font-medium text-heading sm:text-[15.5px] lg:h-[46px] lg:text-[16px]">
          {/* Stretched link keeps the whole card clickable while leaving the
              favourite button (z-20) on top of it. */}
          <a href={href} className="z-10 after:absolute after:inset-0 after:rounded-card">
            {name}
          </a>
        </h3>
        <p className="mt-1 line-clamp-1 text-[12.5px] font-light text-fg-muted lg:text-[13px]">
          {country}
        </p>
        <div className="mt-auto pt-3">
          <span
            className={cn(
              "inline-flex w-fit items-center rounded-pill border border-line px-2.5 py-0.5",
              "text-[9.5px] font-medium tracking-[0.16em] text-fg-subtle uppercase lg:text-[10px]",
              "transition-colors duration-300 group-hover:border-line-strong group-hover:text-heading",
            )}
          >
            {badge}
          </span>
        </div>
      </div>
    </article>
  );
}
