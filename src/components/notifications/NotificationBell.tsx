"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NotificationCard } from "./NotificationCard";
import { useNotifications } from "./useNotifications";

/**
 * NotificationBell — the full notification trigger + inbox for La Vivenzia.
 *
 * Desktop: an anchored popover that opens beneath the bell trigger.
 * Mobile:  a full-height slide-up sheet from the bottom of the viewport.
 *
 * Both surfaces share the same list component, so the content is never
 * duplicated and the read state is consistent between viewports.
 *
 * Accessibility:
 * - Trigger is a <button> with aria-expanded and aria-controls.
 * - Esc closes the popover / sheet.
 * - Focus returns to the trigger on close.
 * - The popover has role="dialog" and aria-label.
 */
export function NotificationBell({
  signedIn,
  className,
}: {
  readonly signedIn: boolean;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { state, refetch, markRead, markAllRead } = useNotifications(signedIn);

  // Refetch when the popover opens so it is always current.
  const handleOpen = useCallback(() => {
    setOpen(true);
    void refetch();
  }, [refetch]);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Return focus to trigger for keyboard users.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const toggle = useCallback(() => {
    if (open) handleClose();
    else handleOpen();
  }, [open, handleClose, handleOpen]);

  // Esc key closes the panel.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  // Click-outside closes the panel.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        handleClose();
      }
    }
    // pointerdown fires before focus, so the click-outside check still fires
    // even when the click target gains focus before we check containment.
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, handleClose]);

  if (!signedIn) return null;

  const hasUnread = state.unreadCount > 0;

  return (
    <div className={cn("relative", className)}>
      {/* ── Bell trigger ─────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={
          hasUnread
            ? `Notifications — ${state.unreadCount} unread`
            : "Notifications"
        }
        className={cn(
          "group relative grid h-8 w-8 place-items-center rounded-full xs:h-9 xs:w-9",
          "text-heading transition-colors duration-300",
          open ? "bg-surface-2" : "hover:bg-surface-2",
        )}
      >
        <Bell
          className="xs:h-[21px] xs:w-[21px] h-[19px] w-[19px] transition-transform duration-300 group-hover:-rotate-[8deg]"
          strokeWidth={1.6}
          aria-hidden="true"
        />

        {/* Unread indicator — a single gold dot, never a number */}
        {hasUnread && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute right-1 top-1 h-2 w-2 xs:right-1.5 xs:top-1.5",
              "rounded-full bg-accent ring-2 ring-bg",
              "animate-pulse",
            )}
          />
        )}
      </button>

      {/* ── Desktop popover ───────────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop — invisible on desktop, dimmed on mobile */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-transparent lg:hidden"
          />
          {/* Mobile sheet — slides up from bottom */}
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 lg:hidden",
              "max-h-[85dvh] overflow-hidden rounded-t-3xl",
              "bg-bg border-t border-line shadow-raised",
              "animate-in slide-in-from-bottom-4 duration-300 ease-out",
            )}
            id="notification-panel"
            role="dialog"
            aria-label="Notifications"
            ref={panelRef}
          >
            <NotificationPanel
              state={state}
              onMarkAllRead={markAllRead}
              onMarkRead={markRead}
              onClose={handleClose}
            />
          </div>

          {/* Desktop popover — anchored below the trigger */}
          <div
            className={cn(
              "absolute right-0 top-full z-50 mt-2 hidden lg:block",
              "w-[380px] xl:w-[420px]",
              "overflow-hidden rounded-2xl",
              "bg-bg border border-line shadow-raised",
              "animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-out",
            )}
            id="notification-panel"
            role="dialog"
            aria-label="Notifications"
            ref={panelRef}
          >
            <NotificationPanel
              state={state}
              onMarkAllRead={markAllRead}
              onMarkRead={markRead}
              onClose={handleClose}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared panel content ─────────────────────────────────────────────────────

function NotificationPanel({
  state,
  onMarkAllRead,
  onMarkRead,
  onClose,
}: {
  readonly state: ReturnType<typeof useNotifications>["state"];
  readonly onMarkAllRead: () => void;
  readonly onMarkRead: (id: string) => void;
  readonly onClose: () => void;
}) {
  const hasUnread = state.unreadCount > 0;

  return (
    <div className="flex max-h-[85dvh] flex-col lg:max-h-[560px]">
      {/* Handle bar — mobile only */}
      <div className="flex justify-center pb-1 pt-3 lg:hidden" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-line-strong" />
      </div>

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl text-heading">Notifications</h2>
          {hasUnread && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 font-sans text-[11px] font-medium text-accent">
              {state.unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasUnread && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="font-sans text-[12px] text-fg-muted transition-colors duration-200 hover:text-accent"
            >
              Mark all read
            </button>
          )}
          {/* Close button — prominent on mobile, subtle on desktop */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full",
              "text-fg-muted transition-colors duration-200",
              "hover:bg-surface-2 hover:text-heading",
            )}
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {state.loading && state.notifications.length === 0 ? (
          <NotificationSkeleton />
        ) : state.notifications.length === 0 ? (
          <EmptyState />
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {state.notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationCard
                  notification={notification}
                  onRead={(id) => {
                    onMarkRead(id);
                    onClose();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Bell
        className="mb-4 h-10 w-10 text-fg-muted opacity-30"
        strokeWidth={1}
        aria-hidden="true"
      />
      <p className="font-display text-base text-heading">All quiet for now</p>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-fg-muted">
        Your evening concierge will notify you here of confirmed reservations, table privileges,
        and pass updates.
      </p>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 py-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl px-4 py-3.5 animate-pulse"
        >
          <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-surface-2" />
            <div className="h-3 w-full rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
