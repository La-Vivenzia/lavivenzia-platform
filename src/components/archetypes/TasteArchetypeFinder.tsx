"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

import { selectJourney } from "@/components/journeys/events";
import { Button } from "@/components/ui/button";
import { VipPassCard } from "@/components/vip/VipPassCard";
import { cn } from "@/lib/cn";
import { formatDuration, formatMoneyMinor } from "@/lib/format";
import {
  PROFILE_QUESTIONS,
  matchArchetype,
  passReference,
  type ProfileAnswers,
} from "@/modules/journeys/archetypes";
import type { Journey } from "@/modules/journeys/data";

/**
 * Three questions, one archetype, one journey.
 *
 * Matching is the deterministic scorer in `modules/journeys/archetypes` — no
 * model, no network. Choosing an option advances; Back revisits a question
 * with the earlier answer still marked.
 *
 * `arcTargetId` is the section holding this tree's `JourneyArcView`: "See the
 * full journey" selects the match there and scrolls to it.
 */
export function TasteArchetypeFinder({
  journeys,
  arcTargetId,
  className,
}: {
  readonly journeys: readonly Journey[];
  readonly arcTargetId: string;
  readonly className?: string;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ProfileAnswers>({});

  const total = PROFILE_QUESTIONS.length;
  const done = step >= total;
  const archetype = done ? matchArchetype(answers) : null;
  const journey = archetype ? journeys.find((item) => item.id === archetype.journeyId) : undefined;

  const choose = (questionId: string, optionId: string) => {
    setAnswers((current) => ({ ...current, [questionId]: optionId }));
    setStep((current) => current + 1);
  };

  const restart = () => {
    setAnswers({});
    setStep(0);
  };

  const showJourney = () => {
    if (!journey) return;
    selectJourney(journey.id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(arcTargetId)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  if (archetype) {
    const privilege = journey?.chapters[1]?.privilege;

    return (
      <div
        className={cn(
          "grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-14",
          className,
        )}
      >
        <div aria-live="polite">
          <p className="eyebrow text-[10px] text-accent-ink dark:text-accent lg:text-[11px]">
            Your taste archetype
          </p>
          <h3 className="mt-2 font-display text-[26px] leading-[1.15] text-heading lg:text-[36px]">
            {archetype.name}
          </h3>
          <p className="mt-3 max-w-[48ch] text-[14px] leading-relaxed font-light text-fg-muted lg:text-[15px]">
            {archetype.description}
          </p>

          {journey ? (
            <div className="mt-6 border-t border-line pt-5">
              <p className="eyebrow text-[10px] text-fg-subtle">Your matched journey</p>
              <p className="mt-2 font-display text-[18px] text-heading lg:text-[20px]">
                {journey.title}
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed font-light text-fg-muted">
                {journey.tagline}
              </p>
              <p className="mt-3 text-[13px] text-fg">
                {formatDuration(journey.totalDurationMinutes)} ·{" "}
                {formatMoneyMinor(journey.totalPriceMinor, journey.currency)} per person, combined
              </p>
            </div>
          ) : (
            <p className="mt-6 border-t border-line pt-5 text-[13.5px] text-fg-muted">
              The journey for this archetype is being re-curated. Browse the other journeys below in
              the meantime.
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            {journey ? (
              <Button variant="primary" onClick={showJourney}>
                See the full journey
                <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </Button>
            ) : null}
            <Button variant="ghost" onClick={restart}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Start again
            </Button>
          </div>
        </div>

        {journey && privilege ? (
          <VipPassCard
            holder={archetype.name}
            journeyTitle={journey.title}
            privilege={privilege}
            reference={passReference(archetype.id, journey.id)}
            className="w-full max-w-[420px] lg:self-center"
          />
        ) : null}
      </div>
    );
  }

  const question = PROFILE_QUESTIONS[step]!;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow text-[10px] text-fg-subtle lg:text-[11px]">
          Question {step + 1} of {total}
        </p>
        <ol aria-hidden="true" className="flex gap-1.5">
          {PROFILE_QUESTIONS.map((item, index) => (
            <li
              key={item.id}
              className={cn(
                "h-1 w-6 rounded-pill transition-colors duration-300",
                index <= step ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </ol>
      </div>

      <fieldset className="mt-4">
        <legend className="font-display text-[20px] leading-snug text-heading lg:text-[26px]">
          {question.prompt}
        </legend>

        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:gap-3">
          {question.options.map((option) => {
            const chosen = answers[question.id] === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => choose(question.id, option.id)}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-card border px-4 py-3 text-left text-[14px] transition-colors duration-300 lg:px-5 lg:text-[15px]",
                    chosen
                      ? "border-accent bg-surface-2 text-heading"
                      : "border-line bg-surface text-fg hover:border-line-strong",
                  )}
                >
                  {option.label}
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-fg-subtle"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-5">
        <Button
          variant="ghost"
          size="sm"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          Back
        </Button>
      </div>
    </div>
  );
}
