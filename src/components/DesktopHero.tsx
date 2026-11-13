import { HeroVisual } from "@/components/HeroVisual";
import { Reveal } from "@/components/Reveal";
import { SearchBar } from "@/components/SearchBar";
import { brand } from "@/data/content";
import { resolveHeroSlides, type HeroImage } from "@/lib/home-content";

/**
 * Desktop hero. An editorial spread rather than a landing-page banner: the type
 * holds the left half at full scale, the photograph runs off the right edge of
 * the viewport behind the same deep top-left radius used on mobile, slowly
 * crossfading between published listings.
 */
export function DesktopHero({
  images,
  image,
}: {
  readonly images?: readonly HeroImage[];
  readonly image?: HeroImage;
}) {
  const slides = resolveHeroSlides(images, image);


  return (
    <section aria-labelledby="lv-hero-heading-desktop" className="relative pt-4 pb-20 xl:pb-24">
      {/* Photograph — bleeds to the viewport edge, independent of the grid. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] pt-4 pb-20 lg:block xl:w-[47%] xl:pb-24 2xl:w-[46%]">
        <div className="relative h-full w-full overflow-hidden rounded-tl-[7rem] xl:rounded-tl-[9rem]">
          <HeroVisual
            images={slides}
            objectPosition="58% 46%"
            size="lg"
            indicatorClassName="right-10 bottom-10 xl:right-14 xl:bottom-14"
          />
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
            <p className="mt-6 max-w-[42ch] text-[16px] leading-[1.65] font-light text-fg-muted xl:text-[17px]">
              Choreographed multi-venue evenings and verified experiences across Pune, reserved in one touch with VIP privileges.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 max-w-[520px]">
              <SearchBar variant="inline" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
