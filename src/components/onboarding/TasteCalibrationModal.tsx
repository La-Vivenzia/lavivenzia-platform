"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import type { CurationTrack } from "@/modules/discovery/curation";
import {
  CALIBRATED_STORAGE_KEY,
  COMPANION_LABELS,
  COMPANION_OPTIONS,
  DEFAULT_HUB,
  HUB_LABELS,
  HUB_OPTIONS,
  MOOD_LABELS,
  MOOD_OPTIONS,
  PALATE_LABELS,
  PALATE_OPTIONS,
  UPCOMING_HUBS,
  type CalibrationAnswers,
  type CompanionProfile,
  type DestinationHub,
  type PalatePreference,
} from "@/modules/taste-genome/types";

/**
 * First-visit Taste Genome calibration.
 *
 * Four quiet micro-steps — mood, palate, companion, hub — that seed the
 * genome so the very first page of results already leans the patron's way.
 * Skippable at every step: exploring immediately is a first-class choice, and
 * a skip is remembered exactly like a calibration so the modal never returns.
 *
 * Whether to show is read from localStorage after mount, never during render,
 * so the server and first client render agree and nothing flashes.
 */

const STEPS = [
  { eyebrow: "Your evening", title: "What mood should the evening hold?" },
  { eyebrow: "Your palate", title: "How do you like to dine?", hint: "Choose any that apply." },
  { eyebrow: "Your company", title: "Who is the evening with?" },
  { eyebrow: "Your destination", title: "Where shall we begin?" },
] as const;

interface Draft {
  mood: CurationTrack | null;
  palate: PalatePreference[];
  companion: CompanionProfile | null;
  hub: DestinationHub;
}

const EMPTY_DRAFT: Draft = { mood: null, palate: [], companion: null, hub: DEFAULT_HUB };

function remember(value: "calibrated" | "skipped"): void {
  try {
    localStorage.setItem(CALIBRATED_STORAGE_KEY, value);
  } catch {
    // Private browsing or a full quota: the modal may return next visit, nothing worse.
  }
}

function alreadyCalibrated(): boolean {
  try {
    return localStorage.getItem(CALIBRATED_STORAGE_KEY) !== null;
  } catch {
    // Unreadable storage means we cannot remember a skip; do not nag on every page.
    return true;
  }
}

export function TasteCalibrationModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (!alreadyCalibrated()) setOpen(true);
  }, []);

  // Hold the page still behind the dialog.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus to each step's question so a screen reader announces it.
  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  const skip = useCallback(() => {
    remember("skipped");
    setOpen(false);
  }, []);

  const canContinue =
    (step === 0 && draft.mood !== null) ||
    (step === 1 && draft.palate.length > 0) ||
    (step === 2 && draft.companion !== null) ||
    step === 3;

  async function submit() {
    if (!draft.mood || !draft.companion) return;
    const answers: CalibrationAnswers = {
      mood: draft.mood,
      palate: draft.palate,
      companion: draft.companion,
      hub: draft.hub,
    };

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/taste-genome/calibrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(answers),
      });
      if (!response.ok) throw new Error(`calibration failed with ${response.status}`);
      remember("calibrated");
      setOpen(false);
    } catch {
      setError("We couldn’t save your preferences just now. Try again, or skip for now.");
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (!canContinue || submitting) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      skip();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    // Keep focus inside the dialog.
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  const current = STEPS[step]!;
  const togglePalate = (palate: PalatePreference) =>
    setDraft((value) => ({
      ...value,
      palate: value.palate.includes(palate)
        ? value.palate.filter((item) => item !== palate)
        : [...value.palate, palate],
    }));

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center lg:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-y-auto border border-line bg-bg/95 shadow-editorial backdrop-blur-md",
          "rounded-t-[1.75rem] lg:max-w-xl lg:rounded-[1.75rem]",
        )}
      >
        <header className="flex items-center justify-between gap-4 px-6 pt-6 lg:px-9 lg:pt-8">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-0.5 flex-1 rounded-pill motion-safe:transition-colors motion-safe:duration-500",
                  index <= step ? "bg-accent" : "bg-line",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={skip}
            className="rounded-pill px-3 py-1.5 text-[12px] font-medium tracking-[0.08em] text-fg-muted uppercase transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Skip
          </button>
        </header>

        <div className="px-6 pt-6 pb-2 lg:px-9 lg:pt-8">
          <p className="eyebrow text-[10.5px] text-fg-subtle">
            {current.eyebrow} · Step {step + 1} of {STEPS.length}
          </p>
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 font-display text-[30px] leading-[1.1] font-light text-heading outline-none lg:text-[36px]"
          >
            {current.title}
          </h2>
          {"hint" in current ? (
            <p className="mt-2 text-[13px] font-light text-fg-muted">{current.hint}</p>
          ) : null}
        </div>

        <div className="grid gap-2.5 px-6 py-5 sm:grid-cols-2 lg:px-9">
          {step === 0 &&
            MOOD_OPTIONS.map((mood) => (
              <Choice
                key={mood}
                label={MOOD_LABELS[mood]}
                selected={draft.mood === mood}
                onSelect={() => setDraft((value) => ({ ...value, mood }))}
              />
            ))}
          {step === 1 &&
            PALATE_OPTIONS.map((palate) => (
              <Choice
                key={palate}
                label={PALATE_LABELS[palate]}
                selected={draft.palate.includes(palate)}
                onSelect={() => togglePalate(palate)}
              />
            ))}
          {step === 2 &&
            COMPANION_OPTIONS.map((companion) => (
              <Choice
                key={companion}
                label={COMPANION_LABELS[companion]}
                selected={draft.companion === companion}
                onSelect={() => setDraft((value) => ({ ...value, companion }))}
              />
            ))}
          {step === 3 && (
            <>
              {HUB_OPTIONS.map((hub) => (
                <Choice
                  key={hub}
                  label={HUB_LABELS[hub]}
                  selected={draft.hub === hub}
                  onSelect={() => setDraft((value) => ({ ...value, hub }))}
                  className="sm:col-span-2"
                />
              ))}
              <p className="text-[12.5px] font-light text-fg-muted sm:col-span-2">
                Expanding to {UPCOMING_HUBS.slice(0, -1).join(", ")} &amp; {UPCOMING_HUBS.at(-1)}.
              </p>
            </>
          )}
        </div>

        {error ? (
          <div className="px-6 pb-2 lg:px-9">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-5 lg:px-9">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(step - 1)}
            disabled={step === 0 || submitting}
            className={step === 0 ? "invisible" : undefined}
          >
            Back
          </Button>
          <Button variant="primary" onClick={next} disabled={!canContinue} loading={submitting}>
            {step === STEPS.length - 1 ? "Begin exploring" : "Continue"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Choice({
  label,
  selected,
  onSelect,
  className,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-card border px-4 py-3.5 text-left text-[14px] transition-[background-color,border-color,color] duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected
          ? "border-accent bg-surface-2 text-heading"
          : "border-line bg-surface/60 text-fg hover:border-line-strong hover:text-heading",
        className,
      )}
    >
      {label}
    </button>
  );
}
