import Link from "next/link";

import { cn } from "@/lib/cn";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * Header account controls.
 *
 * The demo these were ported from rendered a hard-coded avatar reading "KP" and
 * a bell with a permanent unread dot — correct for a still image, wrong for a
 * running product. Both are now driven by the real session: an anonymous
 * visitor is offered a way in, a signed-in one gets their own initials and a
 * way out.
 *
 * The bell now carries the live notification system: an amber dot appears when
 * there are unread items, and clicking opens the inbox popover (desktop) or
 * sheet (mobile). An anonymous visitor sees neither bell nor dot.
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
  className,
}: {
  readonly signedIn: boolean;
  /** @deprecated accountHref is no longer used by the notification bell. */
  readonly accountHref?: string;
  readonly className?: string;
}) {
  return <NotificationBell signedIn={signedIn} className={className} />;
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
  );
}
