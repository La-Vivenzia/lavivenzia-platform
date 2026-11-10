"use client";

import type { ReactNode } from "react";
import { Minus, Plus, Users } from "lucide-react";

/**
 * Traveller count, as a pill stepper. Shared by the Trip Architect's booking
 * panel and the itinerary synthesizer so a party is chosen the same way on
 * both halves of the page.
 */
export function PartyStepper({
  value,
  min = 1,
  max,
  disabled,
  hint,
  onChange,
}: {
  readonly value: number;
  readonly min?: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly hint?: string;
  readonly onChange: (next: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="eyebrow mb-3 flex items-center gap-2 text-fg-muted">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        Travellers
      </legend>
      <div className="flex items-center justify-between rounded-pill border border-line-strong px-2 py-1.5">
        <StepButton
          label="Remove a traveller"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </StepButton>
        <output aria-live="polite" className="text-[15px] font-medium text-fg tabular-nums">
          {value} {value === 1 ? "traveller" : "travellers"}
        </output>
        <StepButton
          label="Add a traveller"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </StepButton>
      </div>
      {hint ? <p className="text-[12px] text-fg-muted">{hint}</p> : null}
    </fieldset>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-pill text-fg transition-colors duration-200 hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
