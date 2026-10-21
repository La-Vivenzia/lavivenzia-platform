import Link from "next/link";
import { Bell } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Header account controls.
 *
 * The demo these were ported from rendered a hard-coded avatar reading "KP" and
 * a bell with a permanent unread dot — correct for a still image, wrong for a
 * running product. Both are now driven by the real session: an anonymous
 * visitor is offered a way in, a signed-in one gets their own initials and a
 * way out.
 *
 * The bell appears only when signed in and carries no unread badge, because
 * there is no notification system behind it yet. A dot that never changes is a
 * lie the interface repeats on every page load.
 */

export interface AccountProps {
  readonly signedIn: boolean;
  /** Where "my account" goes — the console this person's roles actually allow. */
  readonly accountHref: string;
  /** Derived from the signed-in address; absent when anonymous. */
  readonly initials?: string;
  readonly className?: string;
}

export function NotificationButton({
  signedIn,
  accountHref,
  className,
}: {
  readonly signedIn: boolean;
  readonly accountHref: string;
  readonly className?: string;
}) {
  if (!signedIn) return null;

  return (
    <Link
      href={accountHref}
      aria-label="Your activity"
      className={cn(
        "group relative grid h-8 w-8 place-items-center rounded-full xs:h-9 xs:w-9",
        "text-heading hover:bg-surface-2 transition-colors duration-300",
        className,
      )}
    >
      <Bell
        className="xs:h-[21px] xs:w-[21px] h-[19px] w-[19px] transition-transform duration-300 group-hover:-rotate-[8deg]"
        strokeWidth={1.6}
        aria-hidden="true"
      />
    </Link>
  );
}

export function ProfileButton({ signedIn, accountHref, initials, className }: AccountProps) {
  /*
   * Anonymous: a labelled way in rather than a mystery circle. The reference
   * shows an avatar because its user is always signed in; a visitor who has
   * never signed in has no initials, and a blank circle that silently does
   * nothing is worse than a word.
   */
  if (!signedIn) {
    return (
      <Link
        href="/sign-in"
        className={cn(
          "xs:h-9 xs:px-4 rounded-pill grid h-8 shrink-0 place-items-center px-3.5",
          "bg-surface-2 ring-line ring-1",
          "text-heading text-[12px] font-medium tracking-wide whitespace-nowrap",
          "transition-[background-color,box-shadow] duration-300",
          "hover:bg-surface-3 hover:ring-line-strong",
          className,
        )}
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={accountHref}
        aria-label="Your account"
        className={cn(
          "xs:h-9 xs:w-9 grid h-8 w-8 shrink-0 place-items-center rounded-full",
          "bg-surface-2 ring-line ring-1",
          "text-heading text-[13px] font-medium tracking-wide",
          "transition-[background-color,box-shadow] duration-300",
          "hover:bg-surface-3 hover:ring-line-strong",
          className,
        )}
      >
        {initials ?? "·"}
      </Link>

      {/*
       * A POST form, because signing out changes state. As a GET it would be
       * triggerable by any image tag on any page.
       */}
      <form action="/sign-out" method="post" className="flex">
        <button
          type="submit"
          className="text-fg-muted hover:text-heading rounded-pill px-2 text-[11px] tracking-[0.08em] uppercase transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
