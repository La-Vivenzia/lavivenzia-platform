/**
 * Notification domain types.
 *
 * In-app notification centre for La Vivenzia patrons. Five signal types cover
 * the entire patron journey — from their first booking to a Host Privilege
 * unlock — without over-engineering a generic event bus at this stage.
 */

export type NotificationType =
  | "booking_confirmed"
  | "journey_pass"
  | "privilege_unlocked"
  | "concierge_update"
  | "system";

export interface Notification {
  readonly id: string;
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface CreateNotificationParams {
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: string;
}
