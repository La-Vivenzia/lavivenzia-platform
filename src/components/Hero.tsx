import Image from "next/image";

import { brand } from "@/data/content";
import type { HeroImage } from "@/lib/home-content";

/**
 * Mobile hero. Editorial text column on the left, the destination photograph
 * bleeding off the right edge behind a deep top-left radius — the search bar
 * that follows rides up over its lower edge.
 */
export function Hero({ image }: { readonly image: HeroImage }) {
  return (
    <section aria-labelledby="lv-hero-heading" className="relative px-5 pt-3 pb-7">
      {/* Photograph — matches the text column's height and escapes the gutter. */}
      <div
        className="absolute inset-y-0 right-0 w-[43%] min-w-[140px] overflow-hidden rounded-tl-[3rem] xs:w-[44%] sm:w-[46%] sm:rounded-tl-[4rem]"
        aria-hidden="false"
      >
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority
          sizes="50vw"
          className="object-cover"
          style={{ objectPosition: "62% 45%" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "var(--lv-scrim)" }}
        />
        <figcaption className="absolute right-3.5 bottom-9 left-2 text-right sm:right-5 sm:bottom-11">
          <p className="text-[9.5px] leading-tight font-medium tracking-[0.1em] text-white uppercase xs:text-[10.5px] xs:tracking-[0.12em] sm:text-[11.5px] sm:tracking-[0.16em]">
            {image.place}
          </p>
          <p className="mt-1 text-[7.5px] leading-tight tracking-[0.1em] text-white/70 uppercase xs:text-[8px] sm:text-[9.5px] sm:tracking-[0.16em]">
            {image.caption}
          </p>
          <span
            aria-hidden="true"
            className="mt-2 ml-auto block h-px w-16 bg-accent/70 sm:mt-2.5 sm:w-20"
          />
        </figcaption>
      </div>

      {/* Editorial text column */}
      <div className="relative z-10 w-[58%] min-w-0 pt-1 sm:w-[55%]">
        {/* Runs slightly wider than the headline column so it holds one line
            at 375px, matching the reference. */}
        <p className="eyebrow w-[108%] text-[8px] tracking-[0.09em] text-fg-subtle xs:text-[8.5px] xs:tracking-[0.12em] sm:w-full sm:text-[10.5px] sm:tracking-[0.2em] dark:text-accent-ink">
          {brand.eyebrow}
        </p>

        <h1
          id="lv-hero-heading"
          className="mt-3 font-display text-[clamp(1.6rem,7.5vw,3.5rem)] leading-[1.12] font-normal tracking-[-0.015em] text-heading"
        >
          {brand.headline.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        <p className="mt-4 max-w-[30ch] text-[13.5px] leading-[1.55] font-light text-fg-muted sm:text-[15px]">
          {brand.supporting}
        </p>
      </div>
    </section>
  );
}
