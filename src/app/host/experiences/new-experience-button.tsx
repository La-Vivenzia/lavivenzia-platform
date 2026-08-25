"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { EXPERIENCE_LIMITS } from "@/modules/experiences/readiness";

interface CreatedExperience {
  readonly experience: { readonly experience: { readonly id: string } };
}

/**
 * Create a draft.
 *
 * Reveals a single field inline rather than opening a modal. A modal for one
 * text input is a heavier interaction than the task deserves, and it takes the
 * host out of the page they are already reading.
 */
export function NewExperienceButton({
  variant = "primary",
  size = "sm",
}: {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tooShort = title.trim().length > 0 && title.trim().length < EXPERIENCE_LIMITS.title.min;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const created = await api.post<CreatedExperience>("/api/v1/host/experiences", {
        title: title.trim(),
      });

      // Straight into the editor: the host named it in order to work on it.
      router.push(`/host/experiences/${created.experience.experience.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not create the experience. Please try again.",
      );
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        New experience
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="border-line bg-surface flex w-full max-w-lg flex-col gap-5 border p-5"
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <TextField
        label="Working title"
        required
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={EXPERIENCE_LIMITS.title.max}
        placeholder="An evening of Chettinad cooking in Karaikudi"
        help="You can change this at any time before it is published."
        error={tooShort ? `Use at least ${EXPERIENCE_LIMITS.title.min} characters.` : undefined}
      />

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={title.trim().length < EXPERIENCE_LIMITS.title.min}
        >
          Create draft
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
