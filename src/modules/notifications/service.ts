/**
 * Notification service — the domain boundary.
 *
 * Route handlers and other services call these functions; nothing outside this
 * module imports the repository directly. The indirection means the in-memory
 * store can be replaced by a Prisma adapter without touching any call site.
 */

import {
  createNotification,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  seedNotificationsForUser,
} from "./repository";
import type { CreateNotificationParams, Notification } from "./types";

export type { Notification, CreateNotificationParams, NotificationType } from "./types";

export interface NotificationList {
  readonly notifications: readonly Notification[];
  readonly unreadCount: number;
}

/**
 * Return all notifications for a patron, seeding the inbox if it is empty.
 *
 * The seed is applied here rather than in a middleware or sign-in hook because
 * the first read is the natural moment to materialise it — it is lazy, and it
 * works whether the patron registered via OTP, password or OAuth.
 */
export function getNotificationsForUser(userId: string): NotificationList {
  seedNotificationsForUser(userId);
  const notifications = listNotifications(userId);
  const unreadCount = getUnreadCount(userId);
  return { notifications, unreadCount };
}

export function markNotificationRead(
  notificationId: string,
  userId: string,
): Notification | null {
  return markAsRead(notificationId, userId);
}

export function markAllNotificationsRead(userId: string): void {
  markAllAsRead(userId);
}

/**
 * Emit a notification from elsewhere in the domain (booking confirm, journey
 * pass issuance, privilege unlock, etc.). The caller decides the type and
 * content; this module decides where it goes and how it is stored.
 */
export function emitNotification(params: CreateNotificationParams): Notification {
  return createNotification(params);
}
