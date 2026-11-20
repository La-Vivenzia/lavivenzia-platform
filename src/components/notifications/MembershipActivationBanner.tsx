"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

import { useNotifications } from "@/components/notifications/useNotifications";
import { cn } from "@/lib/cn";

export interface MembershipActivationBannerProps {
  readonly signedIn: boolean;
  readonly className?: string;
}

/**
 * MembershipActivationBanner — a slim, quiet-luxury dismissible notification
 * banner displayed at the top of the mobile home screen when a patron's membership
 * is newly active ("Welcome to the Patron Circle").
 *
 * Reuses the existing seeded membership notification and notification API without
 * duplicating records or hardcoding a second copy of the copy.
 *
 * Mobile Layout & Safe-Area Inset:
 * - pt-[max(0.75rem,env(safe-area-inset-top,16px))] ensures the banner clears
 *   the device status bar and notch.
 * - Dismissing it marks the notification as read via markRead(), maintaining
 *   the notification in the NotificationBell inbox.
 */
export function MembershipActivationBanner({
  signedIn,
  className,
}: MembershipActivationBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { state, markRead } = useNotifications(signedIn);

  if (!signedIn || dismissed) return null;

  // Match the activation notification strictly using type, title, and unread state
  const notification = state.notifications.find(
    (n) => n.type === "system" && n.title === "Welcome to the Patron Circle" && n.readAt === null,
  );

  if (!notification) return null;

  const handleDismiss = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setDismissed(true);
    void markRead(notification.id);
  };

  const handleNavigate = () => {
    setDismissed(true);
    void markRead(notification.id);
  };

  const content = (
    <>
      {/* Frosted gold circular icon well with 32px diameter */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/15 text-accent"
        aria-hidden="true"
      >
        <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-sans text-xs font-light leading-relaxed text-fg-muted">
          {notification.body}
        </span>
      </span>
    </>
  );

  const interactiveClasses =
    "flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-lg transition-colors";

  return (
    <aside
      aria-label="Membership activation notice"
      className={cn(
        "relative z-30 border-b border-line bg-surface/95 backdrop-blur-md",
        "px-4 pt-[max(0.75rem,env(safe-area-inset-top,16px))] pb-3 text-fg shadow-sm",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        {notification.actionUrl ? (
          <Link
            href={notification.actionUrl}
            onClick={handleNavigate}
            className={interactiveClasses}
          >
            {content}
          </Link>
        ) : (
          <button type="button" onClick={handleNavigate} className={interactiveClasses}>
            {content}
          </button>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss activation notification"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-heading focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
