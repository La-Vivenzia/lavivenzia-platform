import { ArrowRight, Footprints, LocateFixed, Navigation, Radar } from "lucide-react";

import { LiveMapTrigger } from "@/components/copilot/CopilotProvider";
import { LiveDot } from "@/components/map/LiveDot";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import { liveTracking } from "@/data/content";
import { cn } from "@/lib/cn";

/**
 * The live map tracking feature tile on the home screen. Both the section
 * action and the button open the copilot with the live-tracking tip showing —
 * a pick has to be chosen before there is anything to track to.
 *
 * The radar visual is decoration only: no distance or time is shown until a
 * real listing and a real route exist (CLAUDE.md §7).
 */

const POINT_ICONS = [LocateFixed, Footprints, Navigation] as const;

/** Mobile: the same card rhythm as the AI Genie section above it. */
export function LiveTrackingSection() {
  return (
    <section id="m-live-map" aria-labelledby="lv-live-map" className="px-5 pt-10">
      <Reveal>
        <SectionHeader id="lv-live-map" title={liveTracking.title} action="Open" href="#live-map" />
      </Reveal>

      <Reveal delay={80}>
        <div className="mt-5 flex items-center gap-2.5 rounded-[1.375rem] border border-line bg-surface p-3 shadow-card xs:gap-3.5 xs:p-4">
          <RadarBadge className="h-11 w-11 xs:h-12 xs:w-12 sm:h-14 sm:w-14" />

          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-1.5 text-[10px] text-fg-subtle">
              <LiveDot />
              {liveTracking.eyebrow}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-[1.5] font-light text-fg-muted xs:text-[12.5px] sm:text-[13.5px]">
              {liveTracking.supporting}
            </p>
          </div>

          <LiveMapTrigger
            aria-label="Open the live map tracker"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-cta-fg transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 hover:bg-cta-hover active:scale-95 xs:h-11 xs:w-11 sm:h-12 sm:w-12"
          >
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </LiveMapTrigger>
        </div>
      </Reveal>
    </section>
  );
}

/** Desktop: a wide tile in the page grid, below the AI Genie panel. */
export function LiveTrackingFeature({ className }: { readonly className?: string }) {
  return (
    <section id="d-live-map" aria-labelledby="lv-live-map-desktop" className={className}>
      <Reveal>
        <div className="grid grid-cols-12 items-center gap-10 rounded-[1.75rem] border border-line bg-surface p-10 shadow-card xl:gap-14 xl:p-14">
          <div className="col-span-7">
            <p className="eyebrow flex items-center gap-2 text-[11px] text-fg-subtle">
              <LiveDot />
              {liveTracking.eyebrow}
            </p>
            <h2
              id="lv-live-map-desktop"
              className="mt-4 font-display text-[30px] leading-[1.2] font-normal tracking-tight text-heading"
            >
              {liveTracking.title}
            </h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed font-light text-fg-muted">
              {liveTracking.supporting}
            </p>

            <ul className="mt-8 grid grid-cols-3 gap-5">
              {liveTracking.points.map((point, index) => {
                const Icon = POINT_ICONS[index] ?? Radar;
                return (
                  <li key={point} className="flex items-start gap-2.5">
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <span className="text-[13.5px] leading-snug text-fg">{point}</span>
                  </li>
                );
              })}
            </ul>

            <LiveMapTrigger className="group mt-10 inline-flex items-center gap-3 rounded-pill bg-cta px-7 py-3.5 text-[14.5px] font-medium text-cta-fg transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-cta-hover active:translate-y-0">
              <Radar className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              {liveTracking.action}
              <ArrowRight
                className="h-[17px] w-[17px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1"
                strokeWidth={2}
                aria-hidden="true"
              />
            </LiveMapTrigger>
          </div>

          <div aria-hidden="true" className="col-span-5 grid place-items-center">
            <div className="relative grid aspect-square w-full max-w-[320px] place-items-center rounded-full bg-bg-soft">
              <span className="absolute inset-[12%] rounded-full border border-line" />
              <span className="absolute inset-[26%] rounded-full border border-line" />
              <span className="absolute inset-[40%] rounded-full border border-line-strong" />
              <span className="absolute inset-[26%] rounded-full bg-primary/[0.05] motion-safe:animate-ping dark:bg-accent/[0.06]" />
              <RadarBadge className="relative h-16 w-16" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function RadarBadge({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-surface-2 text-accent-ink",
        className,
      )}
    >
      <Radar className="h-1/2 w-1/2" strokeWidth={1.4} />
      <LiveDot className="absolute top-[14%] right-[14%] ring-2 ring-surface" />
    </span>
  );
}
