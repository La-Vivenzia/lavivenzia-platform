"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { REVIEW_NOTE_LIMITS } from "@/modules/operations/review";

/**
 * The decision control (FR-14).
 *
 * Two things it is deliberate about.
 *
 * **Nothing is one click.** Choosing a decision opens a confirmation step
 * naming exactly what will happen and what the host will see. These actions
 * publish or suppress somebody's livelihood, and an accidental suspension is
 * expensive to explain.
 *
 * **The reason requirement comes from the domain.** `requiresNote` is passed in
 * from the same table the server enforces, so the form cannot let through
 * something the API will then reject.
 */

export interface DecisionOption {
  readonly value: string;
  readonly label: string;
  /** What actually happens, stated plainly on the confirmation step. */
  readonly consequence: string;
  readonly requiresNote: boolean;
  readonly tone: "approve" | "reject";
}

export function DecisionPanel({
  endpoint,
  options,
  disabledMessage,
}: {
  readonly endpoint: string;
  readonly options: readonly DecisionOption[];
  readonly disabledMessage?: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<DecisionOption | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const noteTooShort = chosen?.requiresNote === true && note.trim().length < REVIEW_NOTE_LIMITS.min;

  async function submit(): Promise<void> {
    if (!chosen) return;

    setError(null);
    setSubmitting(true);

    try {
      await api.post(endpoint, {
        decision: chosen.value,
        note: note.trim() === "" ? null : note.trim(),
      });

      setDone(chosen.label);
      setChosen(null);
      setNote("");
      // The page is a server component reading the record; refreshing is what
      // shows the new status, the new history entry and the new decision set.
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not record that decision. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (disabledMessage) {
    return (
      <div className="border-line bg-surface border p-6">
        <span className="eyebrow">Decision</span>
        <p className="text-text-muted mt-3 text-[13px] leading-relaxed">{disabledMessage}</p>
      </div>
    );
  }

  return (
    <div className="border-line bg-surface flex flex-col gap-5 border p-6">
      <span className="eyebrow">Decision</span>

      {done ? <Alert tone="success">{done}. The host has been updated.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {chosen === null ? (
        <div className="flex flex-col gap-3">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={option.tone === "approve" ? "primary" : "secondary"}
              onClick={() => {
                setChosen(option);
                setDone(null);
                setError(null);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="border-line-strong border-l-2 pl-4">
            <p className="text-text text-[14px] font-medium">{chosen.label}</p>
            <p className="text-text-muted mt-1 text-[13px] leading-relaxed">{chosen.consequence}</p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-text-muted text-[11px] font-medium tracking-[0.08em] uppercase">
              Reason
              {chosen.requiresNote ? (
                <>
                  <span aria-hidden="true" className="text-gold ml-1">
                    *
                  </span>
                  <span className="sr-only"> (required)</span>
                </>
              ) : (
                <span className="text-text-subtle ml-1 normal-case">(optional)</span>
              )}
            </span>
            <textarea
              rows={4}
              value={note}
              autoFocus
              maxLength={REVIEW_NOTE_LIMITS.max}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                chosen.requiresNote
                  ? "What needs to change, specifically enough to act on."
                  : "Anything worth recording."
              }
              className="border-line-strong hover:border-text-subtle focus:border-gold w-full resize-y rounded-none border-0 border-b bg-transparent px-0 py-2 text-[14px] leading-relaxed transition-colors focus:outline-none"
            />
            <span className="text-text-subtle text-[11px]">
              {chosen.requiresNote
                ? `The host sees this. At least ${REVIEW_NOTE_LIMITS.min} characters.`
                : "Recorded in the audit trail."}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={chosen.tone === "approve" ? "primary" : "danger"}
              loading={submitting}
              disabled={noteTooShort}
              onClick={() => void submit()}
            >
              Confirm
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => {
                setChosen(null);
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
