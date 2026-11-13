import { randomUUID } from "node:crypto";
import type { CreateNotificationParams, Notification } from "./types";

/**
 * In-memory notification repository.
 *
 * Follows the same pattern as the in-memory availability and discovery stores:
 * a process-scoped map, seeded on demand, replaced by the Prisma adapter in
 * production. It is never a stub — it is a real, working implementation used
 * during local development and in the unit suite.
 *
 * The store is a module-level singleton so that mutations across a request
 * (create → list → mark-read) are consistent without passing context around.
 */

const store = new Map<string, Notification>();

/**
 * Seed a patron's inbox so it feels alive on first sign-in.
 *
 * The seed is idempotent: a user who already has notifications is left alone.
 * That is correct — a returning patron must not see the welcome message twice.
 *
 * The seed IDs are deterministic (derived from userId + ordinal) so that a
 * test can predict them without reading the store first.
 */
export function seedNotificationsForUser(userId: string): void {
  const existing = [...store.values()].filter((n) => n.userId === userId);
  if (existing.length > 0) return;

  const seeds: Array<Omit<Notification, "id" | "userId" | "readAt">> = [
    {
      type: "system",
      title: "Welcome to the Patron Circle",
      body: "Your La Vivenzia membership is now active. Reserved tables, curated journeys and concierge privileges await.",
      actionUrl: "/journeys",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      type: "privilege_unlocked",
      title: "Host Privilege Confirmed: Effingut Reserve Table",
      body: "Your reserved corner table at Effingut Brewhouse, Seasons Mall is confirmed. Present your Patron pass on arrival.",
      actionUrl: "/experiences/effingut-brewhouse-craft-tasting-seasons",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    {
      type: "concierge_update",
      title: "Evening Concierge Note",
      body: "Your butler has curated three additions to the East Pune Twilight itinerary based on tonight's availability.",
      actionUrl: "/journeys",
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
  ];

  seeds.forEach((seed, index) => {
    const id = `seed-${userId.replace(/[^a-z0-9]/gi, "")}-${index}`;
    store.set(id, {
      id,
      userId,
      readAt: null,
      ...seed,
    });
  });
}

export function listNotifications(userId: string): readonly Notification[] {
  return [...store.values()]
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getUnreadCount(userId: string): number {
  return [...store.values()].filter((n) => n.userId === userId && n.readAt === null).length;
}

export function markAsRead(notificationId: string, userId: string): Notification | null {
  const existing = store.get(notificationId);
  if (!existing || existing.userId !== userId) return null;

  const updated: Notification = { ...existing, readAt: new Date().toISOString() };
  store.set(notificationId, updated);
  return updated;
}

export function markAllAsRead(userId: string): void {
  const now = new Date().toISOString();
  for (const [id, n] of store.entries()) {
    if (n.userId === userId && n.readAt === null) {
      store.set(id, { ...n, readAt: now });
    }
  }
}

export function createNotification(params: CreateNotificationParams): Notification {
  const id = randomUUID();
  const notification: Notification = {
    id,
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    ...(params.actionUrl !== undefined ? { actionUrl: params.actionUrl } : {}),
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  store.set(id, notification);
  return notification;
}

/** Clear all entries — for use in tests only. */
export function _clearStore(): void {
  store.clear();
}
