"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Notification } from "@/modules/notifications/service";

export interface NotificationState {
  readonly notifications: readonly Notification[];
  readonly unreadCount: number;
  readonly loading: boolean;
}

const EMPTY: NotificationState = { notifications: [], unreadCount: 0, loading: false };

/**
 * Fetch and mutate the notification inbox.
 *
 * Fetches once on mount (when signed in), and re-fetches whenever the popover
 * is opened. Mark-as-read calls are optimistic: the UI updates immediately and
 * the server confirms in the background, so the response latency is invisible.
 */
export function useNotifications(signedIn: boolean) {
  const [state, setState] = useState<NotificationState>({ ...EMPTY, loading: false });
  const fetchedRef = useRef(false);

  const fetch = useCallback(async () => {
    if (!signedIn) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await window.fetch("/api/v1/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unreadCount: number;
      };
      setState({ notifications: data.notifications, unreadCount: data.unreadCount, loading: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [signedIn]);

  // Initial load
  useEffect(() => {
    if (signedIn && !fetchedRef.current) {
      fetchedRef.current = true;
      void fetch();
    }
  }, [signedIn, fetch]);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setState((s) => ({
        ...s,
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
      try {
        await window.fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
      } catch {
        // Silently ignore — worst case the dot reappears on next fetch
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    // Optimistic update
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => ({
        ...n,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
    try {
      await window.fetch("/api/v1/notifications/read-all", { method: "POST" });
    } catch {
      // Silently ignore
    }
  }, []);

  return { state, refetch: fetch, markRead, markAllRead };
}
