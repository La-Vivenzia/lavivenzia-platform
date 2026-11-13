"use client";

import { useRouter } from "next/navigation";
import {
  Calendar,
  Crown,
  KeyRound,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Notification, NotificationType } from "@/modules/notifications/service";

/**
 * Map a notification type to a subtle, context-aware icon.
 *
 * Icons are small and secondary — they orient the eye but never compete with
 * the title. Stroke width 1.5 matches the bell trigger exactly.
 */
function NotificationIcon({ type }: { readonly type: NotificationType }) {
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "booking_confirmed":
      return <Calendar className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case "journey_pass":
      return <KeyRound className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case "privilege_unlocked":
      return <Crown className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case "concierge_update":
      return <MessageSquare className={cls} strokeWidth={1.5} aria-hidden="true" />;
    case "system":
    default:
      return <Sparkles className={cls} strokeWidth={1.5} aria-hidden="true" />;
  }
}

/** Human-readable elapsed time, in the quietest possible form. */
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

export function NotificationCard({
  notification,
  onRead,
}: {
  readonly notification: Notification;
  readonly onRead: (id: string) => void;
}) {
  const router = useRouter();
  const isUnread = notification.readAt === null;

  function handleClick() {
    if (isUnread) onRead(notification.id);
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group w-full text-left rounded-xl px-4 py-3.5 transition-colors duration-200",
        "flex items-start gap-3",
        "hover:bg-surface-2",
        isUnread ? "bg-surface" : "bg-transparent",
        notification.actionUrl ? "cursor-pointer" : "cursor-default",
      )}
      aria-label={notification.title}
    >
      {/* Type icon with gold tint for unread */}
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUnread
            ? "bg-accent/10 text-accent"
            : "bg-surface-2 text-fg-muted",
        )}
      >
        <NotificationIcon type={notification.type} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "font-sans text-[13px] leading-snug",
              isUnread ? "font-medium text-heading" : "font-normal text-fg",
            )}
          >
            {notification.title}
          </p>
          <span className="shrink-0 font-sans text-[11px] text-fg-muted">
            {relativeTime(notification.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 font-sans text-[12px] leading-relaxed text-fg-muted line-clamp-2">
          {notification.body}
        </p>
      </div>

      {/* Unread indicator dot — gold, never a number badge */}
      {isUnread && (
        <span
          aria-hidden="true"
          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
        />
      )}
    </button>
  );
}
