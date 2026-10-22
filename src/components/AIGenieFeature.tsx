import { ArrowRight } from "lucide-react";

import { CopilotTrigger } from "@/components/copilot/CopilotProvider";
import { GenieStar } from "@/components/icons";
import { Reveal } from "@/components/Reveal";
import { genie } from "@/data/content";

/**
 * The desktop AI Genie feature. A full-bleed pine panel — this is where the
 * primary green earns its share of the page, with gold kept to accents only.
 *
 * "Plan My Journey" opens the Live Travel Copilot; each sample prompt opens it
 * with that prompt already asked.
 */
export function AIGenieFeature() {
  return (
    <section
      id="d-genie"
      aria-labelledby="lv-genie-desktop"
      className="relative overflow-hidden border-y border-transparent bg-panel text-panel-fg dark:border-panel-fg/8"
    >
      {/* Barely-there radial warmth so the panel isn't a flat block of colour. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/3 -right-[10%] h-[140%] w-[55%] rounded-full opacity-[0.16] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--lv-accent) 0%, color-mix(in srgb, var(--lv-accent) 25%, transparent) 45%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-[1440px] grid-cols-12 items-center gap-12 px-8 py-24 xl:gap-16 xl:px-12 xl:py-32 3xl:max-w-[1680px]">
        <div className="col-span-12 xl:col-span-7">
          <Reveal>
            <p className="eyebrow flex items-center gap-3 text-[11px] text-accent">
              <GenieStar className="h-4 w-4" strokeWidth={1.2} aria-hidden="true" />
              AI Genie
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h2
              id="lv-genie-desktop"
              className="mt-7 font-display text-[clamp(2.25rem,3.3vw,3.4rem)] leading-[1.14] font-normal text-panel-fg"
            >
              {genie.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
          </Reveal>

          <Reveal delay={150}>
            <p className="mt-7 max-w-[46ch] text-lg leading-[1.65] font-light text-panel-fg/70">
              {genie.supporting}
            </p>
          </Reveal>

          <Reveal delay={210}>
            <ul className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6 xl:gap-10">
              {genie.highlights.map((item) => (
                <li key={item.title}>
                  <span aria-hidden="true" className="block h-px w-10 bg-accent/60" />
                  <h3 className="mt-4 font-sans text-[15px] font-medium text-panel-fg">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13.5px] leading-[1.6] font-light text-panel-fg/60">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={270}>
            <CopilotTrigger className="group mt-12 inline-flex items-center gap-3 rounded-pill bg-accent px-7 py-3.5 text-[14.5px] font-medium text-accent-fg transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-accent-ink active:translate-y-0">
              Plan My Journey
              <ArrowRight
                className="h-[17px] w-[17px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1"
                strokeWidth={2}
                aria-hidden="true"
              />
            </CopilotTrigger>
          </Reveal>
        </div>

        {/* Restrained product moment — what asking Genie actually looks like. */}
        <Reveal delay={200} className="col-span-12 xl:col-span-5">
          <div className="rounded-[1.75rem] border border-panel-fg/14 bg-panel-fg/[0.045] p-7 backdrop-blur-sm xl:p-8">
            <div className="flex items-center gap-3 border-b border-panel-fg/12 pb-5">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/14 text-accent">
                <GenieStar className="h-5 w-5" strokeWidth={1.2} aria-hidden="true" />
              </span>
              <p className="text-[13px] tracking-[0.14em] text-panel-fg/70 uppercase">Ask Genie</p>
            </div>

            <ul className="mt-6 space-y-3">
              {genie.prompts.map((prompt) => (
                <li key={prompt}>
                  <CopilotTrigger
                    query={prompt}
                    className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-panel-fg/10 bg-panel-fg/[0.03] px-5 py-4 text-left transition-[background-color,border-color] duration-300 hover:border-accent/40 hover:bg-panel-fg/[0.07] focus-visible:outline-accent"
                  >
                    <span className="text-[14px] leading-snug font-light text-panel-fg/85">
                      &ldquo;{prompt}&rdquo;
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-accent transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </CopilotTrigger>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-[12px] leading-relaxed font-light text-panel-fg/45">
              Genie suggests from published experiences only. It never invents a price, a distance
              or a place.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
