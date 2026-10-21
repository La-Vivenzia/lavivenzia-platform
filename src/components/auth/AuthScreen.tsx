import Image from "next/image";
import type { ReactNode } from "react";

import { DesktopHeader } from "@/components/DesktopHeader";
import { MobileHeader } from "@/components/MobileHeader";
import { cn } from "@/lib/cn";

/**
 * The frame every authentication screen wears.
 *
 * The composition: an optional photograph bleeding from the top, a gold
 * wide-tracked eyebrow, a display-serif title, a line of supporting copy, and
 * the form.
 *
 * One component so the four cannot drift. Before this they were three different
 * layouts — a two-panel editorial split for sign-in and join, and a bare centred
 * card for MFA — which meant moving between them felt like moving between
 * products.
 *
 * **The navigation is the site navigation**, the same `MobileHeader` and
 * `DesktopHeader` the home screen and every browse page render. These screens
 * briefly had a reduced bar of their own — back arrow, wordmark, one link —
 * which is a common pattern and was still wrong here: signing in is part of the
 * site, not a modal interruption of it, and a visitor who lands on `/sign-in`
 * from a search result should be able to reach the catalogue.
 *
 * Signed-out is passed unconditionally because every one of these pages
 * redirects an authenticated visitor away before rendering.
 *
 * The photograph is optional because the references use it on three of the four
 * screens and an ornament on the fourth.
 */
export function AuthScreen({
  eyebrow,
  title,
  description,
  image,
  footer,
  children,
}: {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Bleeds from the top edge. Omitted on screens the references leave clear. */
  readonly image?: { readonly src: string; readonly alt: string };
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="bg-bg flex min-h-dvh flex-col">
      <div className="lg:hidden">
        <MobileHeader signedIn={false} accountHref="/sign-in" />
      </div>
      <div className="hidden lg:block">
        <DesktopHeader signedIn={false} accountHref="/sign-in" />
      </div>

      <main className="relative flex flex-1 flex-col">
        {image ? (
          <div className="relative -mt-2 h-[190px] w-full shrink-0 overflow-hidden sm:h-[240px]">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            {/*
             * The scrim fades the photograph into the page ground rather than
             * ending it on a hard edge — that softness is what makes the image
             * read as part of the screen instead of a banner pasted on top.
             */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgb(243 239 231 / 0) 45%, rgb(243 239 231 / 0.72) 78%, var(--lv-bg) 100%)",
              }}
            />
          </div>
        ) : null}

        <div
          className={cn(
            "mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 sm:px-8",
            image ? "-mt-6" : "pt-6",
          )}
        >
          <span className="text-accent-ink text-[10px] tracking-[0.24em] uppercase">{eyebrow}</span>

          <h1 className="font-display text-heading mt-2.5 text-[32px] leading-[1.1] sm:text-[36px]">
            {title}
          </h1>

          {description ? (
            <p className="text-fg-muted mt-3 text-[14.5px] leading-[1.6] font-light">
              {description}
            </p>
          ) : null}

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-7">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

/**
 * A field wrapped the way the references draw it: a rounded well with a leading
 * icon and a placeholder in place of a floating label.
 *
 * Deliberately not the console's `TextField`. That one carries a visible label
 * above every input, which is right for a dense operator form and wrong here —
 * these screens have three fields and the label would double the vertical
 * space. The accessible name is carried by `aria-label` instead, so nothing is
 * lost to a screen reader.
 */
export function AuthField({
  icon,
  trailing,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  readonly icon: ReactNode;
  readonly trailing?: ReactNode;
}) {
  return (
    <div className="border-line bg-surface focus-within:border-line-strong flex h-[54px] items-center gap-3 rounded-card border px-4 transition-colors">
      <span className="text-fg-subtle shrink-0" aria-hidden="true">
        {icon}
      </span>

      <input
        {...props}
        className="text-fg placeholder:text-fg-subtle min-w-0 flex-1 bg-transparent text-[15px] font-light focus:outline-none"
      />

      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

/**
 * The primary action: a full-width pill with a gold circle carrying the arrow.
 *
 * That circle is the signature of these screens in the references — the same
 * gold disc as the home search submit, inverted onto a green field.
 */
export function AuthSubmit({
  children,
  pending,
  disabled,
}: {
  readonly children: ReactNode;
  readonly pending?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "bg-cta text-cta-fg rounded-pill relative flex h-[58px] w-full items-center justify-center",
        "text-[15px] font-medium transition-[background-color,opacity] duration-300",
        "hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-55",
      )}
    >
      {pending ? "Please wait…" : children}

      <span
        aria-hidden="true"
        className="bg-accent text-accent-fg absolute right-2 grid h-[42px] w-[42px] place-items-center rounded-full"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-[17px] w-[17px]"
        >
          <path d="M4 12h15" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}

/** Icons the auth fields use. Inline, so these screens pull in no icon set. */
const glyph = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" {...glyph} aria-hidden="true" className="h-[19px] w-[19px]">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

export function LockGlyph({ className = "h-[19px] w-[19px]" }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...glyph} aria-hidden="true" className={className}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}
