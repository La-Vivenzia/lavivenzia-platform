import Image from "next/image";
import Link from "next/link";

import { Reveal } from "@/components/Reveal";
import { SearchBar } from "@/components/SearchBar";
import { brand } from "@/data/content";
import type { HeroImage } from "@/lib/home-content";

/**
 * Desktop hero. An editorial spread rather than a landing-page banner: the type
 * holds the left half at full scale, the photograph runs off the right edge of
 * the viewport behind the same deep top-left radius used on mobile.
 */
export function DesktopHero({ image }: { readonly image: HeroImage }) {
  return (
    <section aria-labelledby="lv-hero-heading-desktop" className="relative pt-4 pb-20 xl:pb-24">
      {/* Photograph — bleeds to the viewport edge, independent of the grid. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] pt-4 pb-20 lg:block xl:w-[47%] xl:pb-24 2xl:w-[46%]">
        <div className="relative h-full w-full overflow-hidden rounded-tl-[7rem] xl:rounded-tl-[9rem]">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            priority
            sizes="50vw"
            className="object-cover"
            style={{ objectPosition: "58% 46%" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "var(--lv-scrim)" }}
          />
          <figcaption className="absolute right-10 bottom-10 text-right xl:right-14 xl:bottom-14">
            <p className="text-[13px] leading-tight font-medium tracking-[0.18em] text-white uppercase xl:text-sm">
              {image.place}
            </p>
            <p className="mt-1.5 text-[10.5px] leading-tight tracking-[0.22em] text-white/70 uppercase xl:text-[11.5px]">
              {image.caption}
            </p>
            <span aria-hidden="true" className="mt-4 ml-auto block h-px w-28 bg-accent/70" />
          </figcaption>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-8 xl:px-12 3xl:max-w-[1680px]">
        <div className="w-[50%] max-w-[640px] pt-10 pb-6 xl:pt-16 2xl:pt-20">
          <Reveal>
            <p className="eyebrow text-[11px] text-fg-subtle dark:text-accent-ink xl:text-[12px]">
              {brand.eyebrow}
            </p>
          </Reveal>

          <Reveal delay={90}>
            <h1
              id="lv-hero-heading-desktop"
              className="mt-6 font-display text-[clamp(3rem,4.6vw,4.75rem)] leading-[1.05] font-normal tracking-[-0.015em] text-heading"
            >
              {brand.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
          </Reveal>

          <Reveal delay={170}>
            <p className="mt-8 max-w-[38ch] text-[17px] leading-[1.65] font-light text-fg-muted xl:text-lg">
              {brand.supporting}
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 max-w-[520px]">
              <SearchBar variant="inline" />
            </div>
          </Reveal>

          <Reveal delay={310}>
            <div className="mt-8 flex items-center gap-3 text-xs tracking-wide text-fg-muted">
              <span>Pune Pilot Corridor</span>
              <span className="text-gold">•</span>
              <span>Verified Curation</span>
              <span className="text-gold">•</span>
              <Link href="/experiences" className="text-gold hover:underline">
                Explore The Collection →
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
