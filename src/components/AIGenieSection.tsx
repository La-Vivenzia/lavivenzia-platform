import { ArrowRight } from "lucide-react";

import { CopilotTrigger } from "@/components/copilot/CopilotProvider";
import { GenieStar } from "@/components/icons";
import { Reveal } from "@/components/Reveal";
import { SectionHeader } from "@/components/SectionHeader";
import { genie } from "@/data/content";

/**
 * Mobile AI Genie feature card. Both the section action and the arrow open the
 * Live Travel Copilot drawer (`CopilotProvider`); the action is a plain
 * `#copilot` link, which the provider listens for.
 */
export function AIGenieSection() {
  return (
    <section id="m-genie" aria-labelledby="lv-genie" className="px-5 pt-10">
      <Reveal>
        <SectionHeader
          id="lv-genie"
          title={genie.sectionTitle}
          action={genie.action}
          href="#copilot"
        />
      </Reveal>

      <Reveal delay={80}>
        <div className="mt-5 flex items-center gap-2.5 rounded-[1.375rem] border border-line bg-surface p-3 shadow-card xs:gap-3.5 xs:p-4">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-accent xs:h-12 xs:w-12 sm:h-14 sm:w-14"
          >
            <GenieStar
              className="h-[22px] w-[22px] xs:h-6 xs:w-6 sm:h-7 sm:w-7"
              strokeWidth={1.1}
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-display text-[13.5px] leading-[1.38] text-heading xs:text-[14.5px] sm:text-base">
              {genie.headline.map((line, index) => (
                <span key={line} className="inline sm:block">
                  {line}
                  {index === 0 ? " " : null}
                </span>
              ))}
            </p>
            <p className="mt-2 text-[11.5px] leading-[1.5] font-light text-fg-muted xs:text-[12.5px] sm:text-[13.5px]">
              {genie.supporting}
            </p>
          </div>

          <CopilotTrigger
            aria-label="Open the Live Travel Copilot"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-cta-fg transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 hover:bg-cta-hover active:scale-95 xs:h-11 xs:w-11 sm:h-12 sm:w-12"
          >
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </CopilotTrigger>
        </div>
      </Reveal>
    </section>
  );
}
