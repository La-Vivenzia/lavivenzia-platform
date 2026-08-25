"use client";

import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Form controls (DESIGN.md §24).
 *
 * Every field carries a visible label, a required marker, help text and an
 * error slot — wired together with `useId` so the associations are real rather
 * than visual. A validation message that is not announced is a message a screen
 * reader user does not receive, and this console is where hosts type everything
 * that becomes a public listing.
 *
 * The visual language is a single underline rather than a boxed input. Boxes
 * stack into a grid of rectangles; a rule under the text reads as a printed
 * form, which is the editorial register the rest of the product is in.
 */

const CONTROL =
  "w-full bg-transparent px-0 py-2 text-[15px] text-text placeholder:text-text-subtle/70 " +
  "border-0 border-b border-line-strong rounded-none transition-colors duration-200 " +
  "ease-[var(--ease-out-soft)] hover:border-text-subtle focus:border-gold focus:outline-none " +
  "disabled:text-text-subtle disabled:border-line disabled:cursor-not-allowed";

const CONTROL_ERROR = "border-danger hover:border-danger focus:border-danger";

interface FieldShellProps {
  readonly label: string;
  readonly required?: boolean;
  readonly help?: string;
  readonly error?: string | undefined;
  readonly hint?: ReactNode;
  readonly children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Label, control, help and error as one unit.
 *
 * A render prop rather than cloned children: it hands the control the exact ids
 * it must reference, so the wiring cannot be half-done.
 */
export function Field({ label, required, help, error, hint, children }: FieldShellProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  const describedBy =
    [error ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <label
          htmlFor={id}
          className="text-[12px] font-medium tracking-[0.08em] uppercase text-text-muted"
        >
          {label}
          {required ? (
            <>
              {/* Marked for sight and for assistive technology separately: the
                  glyph alone reads as a literal asterisk. */}
              <span aria-hidden="true" className="ml-1 text-gold">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </label>
        {hint ? <span className="text-[11px] text-text-subtle">{hint}</span> : null}
      </div>

      {children({ id, describedBy })}

      {help ? (
        <p id={helpId} className="text-[12px] leading-relaxed text-text-subtle">
          {help}
        </p>
      ) : null}

      {error ? (
        // `role="alert"` so a message that appears after submission is spoken
        // rather than silently added to the page.
        <p id={errorId} role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className"
> {
  readonly label: string;
  readonly help?: string;
  readonly error?: string | undefined;
  readonly hint?: ReactNode;
}

export function TextField({ label, help, error, hint, required, ...props }: TextFieldProps) {
  return (
    <Field label={label} required={required} help={help} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={`${CONTROL} ${error ? CONTROL_ERROR : ""}`}
          {...props}
        />
      )}
    </Field>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "className"
> {
  readonly label: string;
  readonly help?: string;
  readonly error?: string | undefined;
  readonly hint?: ReactNode;
}

export function TextAreaField({
  label,
  help,
  error,
  hint,
  required,
  rows = 5,
  ...props
}: TextAreaFieldProps) {
  return (
    <Field label={label} required={required} help={help} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={`${CONTROL} resize-y leading-relaxed`}
          {...props}
        />
      )}
    </Field>
  );
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "id" | "className"
> {
  readonly label: string;
  readonly help?: string;
  readonly error?: string | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly placeholder?: string;
}

export function SelectField({
  label,
  help,
  error,
  required,
  options,
  placeholder,
  ...props
}: SelectFieldProps) {
  return (
    <Field label={label} required={required} help={help} error={error}>
      {({ id, describedBy }) => (
        <div className="relative">
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={`${CONTROL} ${error ? CONTROL_ERROR : ""} appearance-none pr-8`}
            {...props}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {/* Decorative: the native control is still what a keyboard drives. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-text-subtle"
          >
            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </div>
      )}
    </Field>
  );
}
