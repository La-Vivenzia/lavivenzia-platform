import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { AvailabilityService } from "@/modules/availability/service";
import type { SlotRecord } from "@/modules/availability/ports";
import { PERMISSIONS } from "@/modules/auth/permissions";

/**
 * Availability service (FR-08).
 *
 * Doubles throughout, so this runs with no database. What is pinned here is
 * authorization and ownership: the two properties that decide whether one host
 * can reach another host's calendar.
 */

const NOW = new Date("2026-06-01T10:00:00.000Z");
const at = (iso: string) => new Date(iso);

const HOST = { id: "host-1" } as never;
const OTHER_HOST = { id: "host-2" } as never;

function principalWith(permissions: readonly string[]) {
  return { userId: "u1", roles: [], permissions: new Set(permissions) } as never;
}

const FULL = principalWith([PERMISSIONS.EXPERIENCE_READ_OWN, PERMISSIONS.EXPERIENCE_UPDATE_OWN]);
const READ_ONLY = principalWith([PERMISSIONS.EXPERIENCE_READ_OWN]);

const slotRecord = (over: Partial<SlotRecord> = {}): SlotRecord => ({
  id: "slot-1",
  experienceId: "exp-1",
  startsAt: at("2026-06-02T10:00:00Z"),
  endsAt: at("2026-06-02T12:00:00Z"),
  capacity: 10,
  reservedCount: 0,
  bookingCutoffMinutes: 0,
  status: "OPEN",
  ...over,
});

function makeService(
  over: {
    slots?: Partial<Record<string, unknown>>;
    ownedBy?: string;
  } = {},
) {
  const ownedBy = over.ownedBy ?? "host-1";

  const slots = {
    listForExperience: vi.fn().mockResolvedValue([]),
    listUpcoming: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(slotRecord()),
    createMany: vi
      .fn()
      .mockImplementation((inputs: readonly unknown[]) =>
        Promise.resolve(
          inputs.map((input, i) => slotRecord({ id: `slot-${i}`, ...(input as object) })),
        ),
      ),
    update: vi.fn().mockResolvedValue(slotRecord({ capacity: 20 })),
    remove: vi.fn().mockResolvedValue(undefined),
    countUpcoming: vi.fn().mockResolvedValue(0),
    ...over.slots,
  };

  // Ownership is the real query the host surface uses: it returns the
  // experience only when the host id matches.
  const experiences = {
    findByIdForHost: vi
      .fn()
      .mockImplementation((id: string, hostId: string) =>
        Promise.resolve(hostId === ownedBy ? { id } : null),
      ),
  };

  const service = new AvailabilityService({
    slots: slots as never,
    experiences: experiences as never,
    now: () => NOW,
  });

  return { service, slots, experiences };
}

describe("AvailabilityService — authorization", () => {
  it("refuses listing without the read permission", async () => {
    const { service } = makeService();
    await expect(service.listOwn(principalWith([]), HOST, "exp-1")).rejects.toThrow(ForbiddenError);
  });

  it("refuses adding slots with only read permission", async () => {
    const { service } = makeService();
    await expect(
      service.addSlots(READ_ONLY, HOST, "exp-1", [
        {
          startsAt: at("2026-06-02T10:00:00Z"),
          endsAt: at("2026-06-02T12:00:00Z"),
          capacity: 5,
          bookingCutoffMinutes: 0,
        },
      ]),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses removing a slot with only read permission", async () => {
    const { service } = makeService();
    await expect(service.removeSlot(READ_ONLY, HOST, "slot-1")).rejects.toThrow(ForbiddenError);
  });
});

describe("AvailabilityService — ownership", () => {
  it("reports another host's experience as not found, not forbidden", async () => {
    // Reporting "forbidden" would confirm the experience exists.
    const { service } = makeService();
    await expect(service.listOwn(FULL, OTHER_HOST, "exp-1")).rejects.toThrow(NotFoundError);
  });

  it("refuses writing slots onto an experience the host does not own", async () => {
    const { service, slots } = makeService();
    await expect(
      service.addSlots(FULL, OTHER_HOST, "exp-1", [
        {
          startsAt: at("2026-06-02T10:00:00Z"),
          endsAt: at("2026-06-02T12:00:00Z"),
          capacity: 5,
          bookingCutoffMinutes: 0,
        },
      ]),
    ).rejects.toThrow(NotFoundError);
    expect(slots.createMany).not.toHaveBeenCalled();
  });

  it("refuses editing a slot on another host's experience", async () => {
    const { service, slots } = makeService();
    await expect(service.updateSlot(FULL, OTHER_HOST, "slot-1", { capacity: 5 })).rejects.toThrow(
      NotFoundError,
    );
    expect(slots.update).not.toHaveBeenCalled();
  });

  it("reports a missing slot as not found", async () => {
    const { service } = makeService({ slots: { findById: vi.fn().mockResolvedValue(null) } });
    await expect(service.updateSlot(FULL, HOST, "nope", { capacity: 5 })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("AvailabilityService — writes", () => {
  it("creates slots for an owned experience", async () => {
    const { service, slots } = makeService();

    const created = await service.addSlots(FULL, HOST, "exp-1", [
      {
        startsAt: at("2026-06-02T10:00:00Z"),
        endsAt: at("2026-06-02T12:00:00Z"),
        capacity: 8,
        bookingCutoffMinutes: 60,
      },
    ]);

    expect(created).toHaveLength(1);
    expect(slots.createMany).toHaveBeenCalledTimes(1);
    // The experience id comes from the ownership lookup, never from input.
    expect(slots.createMany.mock.calls[0]?.[0]?.[0]?.experienceId).toBe("exp-1");
  });

  it("rejects a batch overlapping existing availability before writing anything", async () => {
    const { service, slots } = makeService({
      slots: { listForExperience: vi.fn().mockResolvedValue([slotRecord()]) },
    });

    await expect(
      service.addSlots(FULL, HOST, "exp-1", [
        {
          startsAt: at("2026-06-02T11:00:00Z"),
          endsAt: at("2026-06-02T13:00:00Z"),
          capacity: 5,
          bookingCutoffMinutes: 0,
        },
      ]),
    ).rejects.toThrow(ValidationError);

    expect(slots.createMany).not.toHaveBeenCalled();
  });

  it("refuses lowering capacity below reserved seats", async () => {
    const { service, slots } = makeService({
      slots: { findById: vi.fn().mockResolvedValue(slotRecord({ reservedCount: 6 })) },
    });

    await expect(service.updateSlot(FULL, HOST, "slot-1", { capacity: 4 })).rejects.toThrow(
      /already reserved/,
    );
    expect(slots.update).not.toHaveBeenCalled();
  });

  it("refuses removing a slot with reservations", async () => {
    const { service, slots } = makeService({
      slots: { findById: vi.fn().mockResolvedValue(slotRecord({ reservedCount: 2 })) },
    });

    await expect(service.removeSlot(FULL, HOST, "slot-1")).rejects.toThrow(/reservation/);
    expect(slots.remove).not.toHaveBeenCalled();
  });

  it("allows closing a slot that has reservations", async () => {
    // Closing is the correct action where removal is refused.
    const { service, slots } = makeService({
      slots: {
        findById: vi.fn().mockResolvedValue(slotRecord({ reservedCount: 2 })),
        update: vi.fn().mockResolvedValue(slotRecord({ reservedCount: 2, status: "CLOSED" })),
      },
    });

    const updated = await service.updateSlot(FULL, HOST, "slot-1", { status: "CLOSED" });
    expect(updated.status).toBe("CLOSED");
    expect(slots.update).toHaveBeenCalled();
  });
});

describe("AvailabilityService — public surface", () => {
  it("returns only bookable slots", async () => {
    const { service } = makeService({
      slots: {
        listUpcoming: vi
          .fn()
          .mockResolvedValue([
            slotRecord({ id: "open" }),
            slotRecord({ id: "closed", status: "CLOSED" }),
            slotRecord({ id: "full", reservedCount: 10 }),
            slotRecord({ id: "past-cutoff", bookingCutoffMinutes: 60 * 24 * 365 }),
          ]),
      },
    });

    const slots = await service.listBookable("exp-1");

    expect(slots.map((s) => s.id)).toEqual(["open"]);
  });

  it("exposes remaining seats rather than raw reserved counts alone", async () => {
    const { service } = makeService({
      slots: { listUpcoming: vi.fn().mockResolvedValue([slotRecord({ reservedCount: 3 })]) },
    });

    const [slot] = await service.listBookable("exp-1");
    expect(slot?.seatsRemaining).toBe(7);
  });

  it("takes no principal, so it cannot be widened by a caller", async () => {
    const { service, experiences } = makeService();
    await service.listBookable("exp-1");
    // The public path never consults ownership — there is nothing to widen.
    expect(experiences.findByIdForHost).not.toHaveBeenCalled();
  });
});
