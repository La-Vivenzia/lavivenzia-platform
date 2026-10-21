"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * Six separate boxes for a six-digit code, as the approved reference draws it.
 *
 * **One real input, six painted boxes.** The obvious build is six `<input>`
 * elements with focus juggling between them, and it is the wrong one: it breaks
 * paste, fights password managers and one-time-code autofill, and gives screen
 * readers six unlabelled fields instead of one labelled control.
 *
 * So there is a single transparent input stretched across the row, and the
 * boxes beneath it are decoration that reads the value. Autofill, paste,
 * `autocomplete="one-time-code"`, and the iOS keyboard suggestion all work
 * because they are talking to an ordinary text field.
 *
 * The caret is hidden and a block is drawn under the active box instead, which
 * is what the reference shows.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  id = "lv-code",
  autoFocus,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly length?: number;
  readonly id?: string;
  readonly autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = value.padEnd(length, " ").slice(0, length).split("");
  const activeIndex = Math.min(value.length, length - 1);

  function accept(raw: string): void {
    // Digits only, and never longer than the code. Anything a person can paste
    // — spaces, hyphens, a whole "Your code is 123456" line — reduces to what
    // matters.
    onChange(raw.replace(/\D/g, "").slice(0, length));
  }

  return (
    <div
      className="relative"
      onClick={() => inputRef.current?.focus()}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter") inputRef.current?.focus();
      }}
      role="presentation"
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={value}
        maxLength={length}
        aria-label={`${length}-digit verification code`}
        onChange={(event) => accept(event.target.value)}
        onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
          event.preventDefault();
          accept(event.clipboardData.getData("text"));
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-default bg-transparent text-transparent caret-transparent outline-none"
      />

      <div className="pointer-events-none flex items-center justify-between gap-2">
        {digits.map((digit, index) => {
          const filled = digit.trim() !== "";
          const active = index === activeIndex;

          return (
            <span
              key={index}
              className={`font-display text-heading grid h-[54px] flex-1 place-items-center rounded-card border text-[20px] transition-colors ${
                active || filled ? "border-line-strong bg-surface" : "border-line bg-surface/60"
              }`}
            >
              {filled ? (
                digit
              ) : active ? (
                <span className="bg-heading h-5 w-px animate-pulse" aria-hidden="true" />
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
