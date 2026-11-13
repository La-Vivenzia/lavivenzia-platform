import { HeroVisual } from "@/components/HeroVisual";
import { brand } from "@/data/content";
import { resolveHeroSlides, type HeroImage } from "@/lib/home-content";

/**
 * Mobile hero. Editorial text column on the left, the destination photograph
 * bleeding off the right edge behind a deep top-left radius — the search bar
 * that follows rides up over its lower edge. The photograph crossfades between
 * published listings; see `HeroVisual`.
 */
export function Hero({
  images,
  image,
}: {
  readonly images?: readonly HeroImage[];
  readonly image?: HeroImage;
}) {
  const slides = resolveHeroSlides(images, image);

  return (
    <section aria-labelledby="lv-hero-heading" className="relative px-5 pt-4 pb-8 min-h-[220px] xs:min-h-[250px] flex items-center">
      {/* Photograph — dominant visual presence with deep radius */}
      <div
        className="absolute inset-y-0 right-0 w-[47%] min-w-[150px] overflow-hidden rounded-tl-[3.5rem] xs:w-[49%] sm:w-[50%] sm:rounded-tl-[4.5rem]"
        aria-hidden="false"
      >
        <HeroVisual
          images={slides}
          objectPosition="62% 45%"
          indicatorClassName="right-3 bottom-9 sm:right-5 sm:bottom-11"
        />
      </div>

      {/* Editorial text column — clean, spacious, uncluttered */}
      <div className="relative z-10 w-[52%] min-w-0 pr-2 xs:w-[50%] sm:w-[49%]">
        <p className="eyebrow text-[8px] tracking-[0.14em] text-fg-subtle xs:text-[9px] xs:tracking-[0.16em] sm:text-[10px] dark:text-accent-ink uppercase">
          {brand.eyebrow}
        </p>

        <h1
          id="lv-hero-heading"
          className="mt-2.5 font-display text-[25px] xs:text-[28px] sm:text-[34px] leading-[1.15] font-normal tracking-tight text-heading"
        >
          {brand.headline.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        <p className="mt-2 text-[12px] xs:text-[13px] leading-relaxed font-light text-fg-muted truncate">
          Choreographed multi-venue evenings
        </p>
      </div>
    </section>
  );
}

