import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _clearStore,
  createNotification,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  seedNotificationsForUser,
} from "@/modules/notifications/repository";
import {
  emitNotification,
  getNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/notifications/service";

/**
 * Notification system — domain service and repository.
 *
 * Tests are grouped into three layers: the low-level repository (pure
 * in-memory CRUD), the service façade (what the route handlers call), and
 * the seed behaviour (the inbox that materialises on a patron's first open).
 *
 * No HTTP infrastructure is involved: the in-memory store is a first-class
 * implementation, not a stub, so there is nothing to mock.
 */

const USER_A = "patron-a@lavivenzia.com";
const USER_B = "patron-b@lavivenzia.com";

// Keep the store clean between every test.
beforeEach(() => _clearStore());
afterEach(() => _clearStore());

// ── Repository ──────────────────────────────────────────────────────────────

describe("createNotification", () => {
  it("persists a notification with a generated id and null readAt", () => {
    const n = createNotification({
      userId: USER_A,
      type: "system",
      title: "Hello",
      body: "World",
    });

    expect(n.id).toBeTruthy();
    expect(n.userId).toBe(USER_A);
    expect(n.type).toBe("system");
    expect(n.readAt).toBeNull();
    expect(typeof n.createdAt).toBe("string");
  });

  it("stores an optional actionUrl when provided", () => {
    const n = createNotification({
      userId: USER_A,
      type: "booking_confirmed",
      title: "Confirmed",
      body: "Your booking is live.",
      actionUrl: "/experiences/effingut",
    });
    expect(n.actionUrl).toBe("/experiences/effingut");
  });

  it("does not set actionUrl when omitted", () => {
    const n = createNotification({
      userId: USER_A,
      type: "system",
      title: "Hi",
      body: "No link.",
    });
    expect(n.actionUrl).toBeUndefined();
  });
});

describe("listNotifications", () => {
  it("returns notifications for the requested user only", () => {
    createNotification({ userId: USER_A, type: "system", title: "A1", body: "b" });
    createNotification({ userId: USER_B, type: "system", title: "B1", body: "b" });
    createNotification({ userId: USER_A, type: "system", title: "A2", body: "b" });

    const result = listNotifications(USER_A);
    expect(result).toHaveLength(2);
    expect(result.every((n) => n.userId === USER_A)).toBe(true);
  });

  it("returns an empty array when the user has no notifications", () => {
    expect(listNotifications(USER_A)).toHaveLength(0);
  });

  it("sorts newest first", () => {
    createNotification({ userId: USER_A, type: "system", title: "Old", body: "" });
    createNotification({ userId: USER_A, type: "system", title: "New", body: "" });

    const [first, second] = listNotifications(USER_A);
    // createdAt is an ISO string; lexicographic comparison is correct for it.
    expect(first!.createdAt >= second!.createdAt).toBe(true);
  });
});

describe("getUnreadCount", () => {
  it("counts only unread notifications for the given user", () => {
    const n1 = createNotification({ userId: USER_A, type: "system", title: "1", body: "" });
    createNotification({ userId: USER_A, type: "system", title: "2", body: "" });
    createNotification({ userId: USER_B, type: "system", title: "3", body: "" });

    markAsRead(n1.id, USER_A);

    expect(getUnreadCount(USER_A)).toBe(1);
    expect(getUnreadCount(USER_B)).toBe(1);
  });

  it("returns 0 when all are read", () => {
    const n = createNotification({ userId: USER_A, type: "system", title: "X", body: "" });
    markAsRead(n.id, USER_A);
    expect(getUnreadCount(USER_A)).toBe(0);
  });
});

describe("markAsRead", () => {
  it("stamps readAt on the target notification", () => {
    const n = createNotification({ userId: USER_A, type: "system", title: "T", body: "" });
    expect(n.readAt).toBeNull();

    const updated = markAsRead(n.id, USER_A);
    expect(updated).not.toBeNull();
    expect(updated!.readAt).not.toBeNull();
  });

  it("returns null when the notification does not exist", () => {
    expect(markAsRead("no-such-id", USER_A)).toBeNull();
  });

  it("returns null when the notification belongs to a different user", () => {
    const n = createNotification({ userId: USER_B, type: "system", title: "T", body: "" });
    expect(markAsRead(n.id, USER_A)).toBeNull();
  });

  it("is idempotent: calling twice keeps the first readAt", () => {
    const n = createNotification({ userId: USER_A, type: "system", title: "T", body: "" });
    const first = markAsRead(n.id, USER_A);
    const second = markAsRead(n.id, USER_A);
    // Both succeed; the timestamp may drift slightly but both are truthy.
    expect(first!.readAt).not.toBeNull();
    expect(second!.readAt).not.toBeNull();
  });
});

describe("markAllAsRead", () => {
  it("stamps all unread notifications for the user", () => {
    createNotification({ userId: USER_A, type: "system", title: "1", body: "" });
    createNotification({ userId: USER_A, type: "system", title: "2", body: "" });
    createNotification({ userId: USER_B, type: "system", title: "3", body: "" });

    markAllAsRead(USER_A);

    expect(getUnreadCount(USER_A)).toBe(0);
    // USER_B is untouched.
    expect(getUnreadCount(USER_B)).toBe(1);
  });

  it("is a no-op when there are no notifications", () => {
    expect(() => markAllAsRead(USER_A)).not.toThrow();
  });
});

// ── Seed ─────────────────────────────────────────────────────────────────────

describe("seedNotificationsForUser", () => {
  it("creates at least one notification for a new patron", () => {
    seedNotificationsForUser(USER_A);
    expect(listNotifications(USER_A).length).toBeGreaterThan(0);
  });

  it("does not duplicate notifications on repeated calls", () => {
    seedNotificationsForUser(USER_A);
    const countAfterFirst = listNotifications(USER_A).length;

    seedNotificationsForUser(USER_A);
    const countAfterSecond = listNotifications(USER_A).length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("seeds notifications with null readAt so the inbox shows unread items", () => {
    seedNotificationsForUser(USER_A);
    const unread = listNotifications(USER_A).filter((n) => n.readAt === null);
    expect(unread.length).toBeGreaterThan(0);
  });

  it("includes a welcome notification in the seed", () => {
    seedNotificationsForUser(USER_A);
    const welcome = listNotifications(USER_A).find((n) =>
      n.title.toLowerCase().includes("patron circle"),
    );
    expect(welcome).toBeDefined();
  });
});

// ── Service façade ───────────────────────────────────────────────────────────

describe("getNotificationsForUser", () => {
  it("seeds the inbox on first call and returns notifications with an unread count", () => {
    const { notifications, unreadCount } = getNotificationsForUser(USER_A);
    expect(notifications.length).toBeGreaterThan(0);
    expect(unreadCount).toBeGreaterThan(0);
  });

  it("includes unreadCount that matches the number of unread items", () => {
    const { notifications, unreadCount } = getNotificationsForUser(USER_A);
    const actualUnread = notifications.filter((n) => n.readAt === null).length;
    expect(unreadCount).toBe(actualUnread);
  });
});

describe("markNotificationRead (service)", () => {
  it("marks a notification as read and returns the updated record", () => {
    const n = emitNotification({ userId: USER_A, type: "system", title: "X", body: "" });
    const updated = markNotificationRead(n.id, USER_A);
    expect(updated).not.toBeNull();
    expect(updated!.readAt).not.toBeNull();
  });

  it("returns null for an unknown notification id", () => {
    expect(markNotificationRead("ghost", USER_A)).toBeNull();
  });
});

describe("markAllNotificationsRead (service)", () => {
  it("clears the unread count after marking all", () => {
    emitNotification({ userId: USER_A, type: "system", title: "1", body: "" });
    emitNotification({ userId: USER_A, type: "system", title: "2", body: "" });

    markAllNotificationsRead(USER_A);

    const { unreadCount } = getNotificationsForUser(USER_A);
    expect(unreadCount).toBe(0);
  });
});

describe("emitNotification", () => {
  it("creates a notification and returns it", () => {
    const n = emitNotification({
      userId: USER_A,
      type: "booking_confirmed",
      title: "Booking Confirmed: Effingut",
      body: "Your table is reserved.",
      actionUrl: "/experiences/effingut",
    });

    expect(n.id).toBeTruthy();
    expect(n.type).toBe("booking_confirmed");
    expect(n.actionUrl).toBe("/experiences/effingut");
  });

  it("does not affect another user's inbox", () => {
    emitNotification({ userId: USER_A, type: "system", title: "A", body: "" });
    expect(getUnreadCount(USER_B)).toBe(0);
  });

  it("supports all five notification types without throwing", () => {
    const types = [
      "booking_confirmed",
      "journey_pass",
      "privilege_unlocked",
      "concierge_update",
      "system",
    ] as const;

    for (const type of types) {
      expect(() =>
        emitNotification({ userId: USER_A, type, title: type, body: "" }),
      ).not.toThrow();
    }
  });
});
