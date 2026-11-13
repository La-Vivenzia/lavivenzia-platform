"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  ACOUSTIC_COMFORTS,
  ACOUSTIC_LABELS,
  BEVERAGE_LABELS,
  BEVERAGE_PALATES,
  CALIBRATED_STORAGE_KEY,
  DIETARY_LABELS,
  DIETARY_PHILOSOPHIES,
  SEATING_LABELS,
  SEATING_PREFERENCES,
  type AcousticComfort,
  type BeveragePalate,
  type CalibrationAnswers,
  type DietaryPhilosophy,
  type SeatingPreference,
} from "@/modules/taste-genome/types";

/**
 * First-visit Taste Genome calibration.
 *
 * Four quiet questions about permanent taste — dietary philosophy, bar
 * palate, seating, acoustic comfort — then a fifth step that says where the
 * answers live. Not tonight's mood: that is asked in the moment, by search
 * and the copilot, and would be the wrong thing to remember.
 *
 * Step five has two faces. A signed-in patron's answers are already saved to
 * their account by the time it appears, so it confirms. A guest's are held
 * for this device only, so it offers to anchor them to a private patron
 * profile — name and email, then the emailed code that proves the mailbox —
 * or to carry on as a guest, which is a first-class choice, not a failure.
 *
 * Skippable at every step, and a skip is remembered exactly like a
 * calibration so the modal never returns. Whether to show is read from
 * localStorage after mount, never during render, so the server and first
 * client render agree and nothing flashes.
 */

const QUESTIONS = [
  { eyebrow: "Your table", title: "How do you dine?" },
  { eyebrow: "Your bar", title: "What do you reach for?", hint: "Choose any that apply." },
  { eyebrow: "Your setting", title: "Where do you like to be seated?" },
  { eyebrow: "Your sound", title: "How should the room sound?" },
] as const;

const TOTAL_STEPS = QUESTIONS.length + 1;
const ANCHOR_STEP = QUESTIONS.length;

interface Draft {
  dietary: DietaryPhilosophy | null;
  beverages: BeveragePalate[];
  seating: SeatingPreference | null;
  acoustic: AcousticComfort | null;
}

const EMPTY_DRAFT: Draft = { dietary: null, beverages: [], seating: null, acoustic: null };

/** Where step five stands: confirming, collecting details, or awaiting the code. */
type AnchorPhase = "saved" | "details" | "code";

interface CalibrateResponse {
  readonly anchored: boolean;
}

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

function toAnswers(draft: Draft): CalibrationAnswers | null {
  if (!draft.dietary || draft.beverages.length === 0 || !draft.seating || !draft.acoustic) {
    return null;
  }
  return {
    dietary: draft.dietary,
    beverages: draft.beverages,
    seating: draft.seating,
    acoustic: draft.acoustic,
  };
}

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof ApiError ? caught.message : fallback;

export function TasteCalibrationModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [phase, setPhase] = useState<AnchorPhase>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
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
  }, [open, step, phase]);

  // Past the questions the answers are already saved, so closing is not a skip.
  const close = useCallback(() => {
    remember(step === ANCHOR_STEP ? "calibrated" : "skipped");
    setOpen(false);
  }, [step]);

  const answers = toAnswers(draft);
  const canContinue =
    (step === 0 && draft.dietary !== null) ||
    (step === 1 && draft.beverages.length > 0) ||
    (step === 2 && draft.seating !== null) ||
    (step === 3 && answers !== null);

  async function calibrate(): Promise<boolean> {
    if (!answers) return false;
    const result = await api.post<CalibrateResponse>("/api/v1/taste-genome/calibrate", answers);
    return result.anchored;
  }

  async function saveAnswers() {
    setPending(true);
    setError(null);
    try {
      const anchored = await calibrate();
      // Saved either way — to the account, or to this device's guest session.
      remember("calibrated");
      setPhase(anchored ? "saved" : "details");
      setStep(ANCHOR_STEP);
    } catch (caught) {
      setError(
        messageOf(
          caught,
          "We couldn’t save your preferences just now. Try again, or skip for now.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post("/api/v1/taste-genome/anchor", { name, email });
      setPhase("code");
    } catch (caught) {
      setError(messageOf(caught, "We couldn’t send a code just now. Please try again."));
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answers) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ anchored: boolean }>("/api/v1/taste-genome/anchor/verify", {
        name,
        email,
        code,
        answers,
      });
      // Signed in now, so the header and every gated control should know it.
      router.refresh();
      // The session landed but the genome write did not: save again as the
      // signed-in patron, which writes to the account.
      if (!result.anchored && !(await calibrate())) throw new Error("not anchored");
      setPhase("saved");
    } catch (caught) {
      setError(messageOf(caught, "We couldn’t seal your profile just now. Please try again."));
    } finally {
      setPending(false);
    }
  }

  function next() {
    if (!canContinue || pending) return;
    if (step < ANCHOR_STEP - 1) setStep(step + 1);
    else void saveAnswers();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    // Keep focus inside the dialog.
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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

  const heading =
    step < ANCHOR_STEP
      ? QUESTIONS[step]!
      : phase === "saved"
        ? { eyebrow: "Your profile", title: "Your taste is anchored." }
        : phase === "code"
          ? { eyebrow: "Your profile", title: "Check your inbox." }
          : {
              eyebrow: "Your profile",
              title: "Anchor your taste profile.",
              hint: "Seal these preferences to a private patron profile, so they follow you to every device.",
            };

  const toggleBeverage = (beverage: BeveragePalate) =>
    setDraft((value) => ({
      ...value,
      beverages: value.beverages.includes(beverage)
        ? value.beverages.filter((item) => item !== beverage)
        : [...value.beverages, beverage],
    }));

  const guestButton = (
    <button
      type="button"
      onClick={close}
      disabled={pending}
      className="text-[13px] text-fg-muted transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
    >
      Continue as guest on this device
    </button>
  );

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
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-0.5 flex-1 rounded-pill motion-safe:transition-colors motion-safe:duration-500",
                  index <= step ? "bg-accent" : "bg-line",
                )}
              />
            ))}
          </div>
          {step < ANCHOR_STEP ? (
            <button
              type="button"
              onClick={close}
              className="rounded-pill px-3 py-1.5 text-[12px] font-medium tracking-[0.08em] text-fg-muted uppercase transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Skip
            </button>
          ) : null}
        </header>

        <div className="px-6 pt-6 pb-2 lg:px-9 lg:pt-8">
          <p className="eyebrow text-[10.5px] text-fg-subtle">
            {heading.eyebrow} · Step {step + 1} of {TOTAL_STEPS}
          </p>
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 font-display text-[30px] leading-[1.1] font-light text-heading outline-none lg:text-[36px]"
          >
            {heading.title}
          </h2>
          {"hint" in heading ? (
            <p className="mt-2 text-[13px] font-light text-fg-muted">{heading.hint}</p>
          ) : null}
        </div>

        {step < ANCHOR_STEP ? (
          <div className="grid gap-2.5 px-6 py-5 sm:grid-cols-2 lg:px-9">
            {step === 0 &&
              DIETARY_PHILOSOPHIES.map((dietary) => (
                <Choice
                  key={dietary}
                  label={DIETARY_LABELS[dietary]}
                  selected={draft.dietary === dietary}
                  onSelect={() => setDraft((value) => ({ ...value, dietary }))}
                />
              ))}
            {step === 1 &&
              BEVERAGE_PALATES.map((beverage) => (
                <Choice
                  key={beverage}
                  label={BEVERAGE_LABELS[beverage]}
                  selected={draft.beverages.includes(beverage)}
                  onSelect={() => toggleBeverage(beverage)}
                />
              ))}
            {step === 2 &&
              SEATING_PREFERENCES.map((seating) => (
                <Choice
                  key={seating}
                  label={SEATING_LABELS[seating]}
                  selected={draft.seating === seating}
                  onSelect={() => setDraft((value) => ({ ...value, seating }))}
                />
              ))}
            {step === 3 &&
              ACOUSTIC_COMFORTS.map((acoustic) => (
                <Choice
                  key={acoustic}
                  label={ACOUSTIC_LABELS[acoustic]}
                  selected={draft.acoustic === acoustic}
                  onSelect={() => setDraft((value) => ({ ...value, acoustic }))}
                  className="sm:col-span-2"
                />
              ))}
          </div>
        ) : null}

        {error ? (
          <div className="px-6 pt-3 pb-2 lg:px-9">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        {step < ANCHOR_STEP ? (
          <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-5 lg:px-9">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(step - 1)}
              disabled={step === 0 || pending}
              className={step === 0 ? "invisible" : undefined}
            >
              Back
            </Button>
            <Button variant="primary" onClick={next} disabled={!canContinue} loading={pending}>
              {step === ANCHOR_STEP - 1 ? "Save my taste" : "Continue"}
            </Button>
          </footer>
        ) : phase === "saved" ? (
          <>
            <p className="px-6 py-5 text-[14px] leading-[1.6] font-light text-fg-muted lg:px-9">
              Saved to your patron profile. It travels with you to every device you sign in on, and
              you can refine it from your profile at any time.
            </p>
            <footer className="flex justify-end border-t border-line px-6 py-5 lg:px-9">
              <Button variant="primary" onClick={close}>
                Begin exploring
              </Button>
            </footer>
          </>
        ) : phase === "details" ? (
          <form onSubmit={requestCode} noValidate>
            <div className="flex flex-col gap-4 px-6 py-5 lg:px-9">
              <TextField
                label="Name"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                help="We’ll email a six-digit code to confirm it’s you. No password, ever."
              />
            </div>
            <footer className="flex flex-col-reverse items-stretch gap-3 border-t border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-9">
              {guestButton}
              <Button
                type="submit"
                variant="primary"
                disabled={name.trim().length === 0 || email.trim().length === 0}
                loading={pending}
              >
                Send my code
              </Button>
            </footer>
          </form>
        ) : (
          <form onSubmit={verifyCode} noValidate>
            <div className="flex flex-col gap-4 px-6 py-5 lg:px-9">
              <p className="text-[14px] leading-[1.6] font-light text-fg-muted">
                If <span className="font-medium text-heading">{email}</span> can receive a code, a
                six-digit code is on its way. It expires in ten minutes.
              </p>
              <TextField
                label="Six-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  setPhase("details");
                  setCode("");
                  setError(null);
                }}
                disabled={pending}
                className="self-start text-[13px] text-fg-muted transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                ← Use a different address
              </button>
            </div>
            <footer className="flex flex-col-reverse items-stretch gap-3 border-t border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-9">
              {guestButton}
              <Button
                type="submit"
                variant="primary"
                disabled={code.trim().length === 0}
                loading={pending}
              >
                Seal my profile
              </Button>
            </footer>
          </form>
        )}
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
