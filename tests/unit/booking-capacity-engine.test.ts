import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  BookingCapacityEngine,
  HOLD_DURATION_MS,
  generateBookingReference,
} from "@/modules/booking/capacity-engine";
import type {
  BookingCapacityRepository,
  CreateHoldBookingInput,
  ExperienceBookingRules,
  HoldBookingRecord,
  LockedSlotRecord,
} from "@/modules/booking/ports";

interface StoredBookingRecord {
  id: string;
  bookingReference: string;
  userId: string;
  experienceId: string;
  slotId: string;
  guestCount: number;
  status: "DRAFT" | "HELD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  heldUntil: Date | null;
  totalAmountMinorUnits: number;
  currency: string;
  customerEmail: string | null;
  customerPhone: string | null;
  specialRequests: string | null;
  createdAt: Date;
}

/**
 * In-memory Mock Repository for testing BookingCapacityEngine
 * perfectly adhering to Hexagonal Architecture boundaries.
 */
class MockBookingCapacityRepository implements BookingCapacityRepository {
  slots: Map<string, LockedSlotRecord> = new Map();
  experiences: Map<string, ExperienceBookingRules> = new Map();
  bookings: StoredBookingRecord[] = [];

  acquireLockSpy = vi.fn();
  runInTxSpy = vi.fn();
  createBookingSpy = vi.fn();

  async acquireSlotLock(slotId: string): Promise<LockedSlotRecord | null> {
    this.acquireLockSpy(slotId);
    const slot = this.slots.get(slotId);
    return slot ? { ...slot } : null;
  }

  async getActiveHeldSeats(slotId: string, now: Date): Promise<number> {
    let total = 0;
    for (const b of this.bookings) {
      if (
        b.slotId === slotId &&
        b.status === "HELD" &&
        b.heldUntil &&
        b.heldUntil.getTime() > now.getTime()
      ) {
        total += b.guestCount;
      }
    }
    return total;
  }

  async findExperienceForSlot(experienceId: string): Promise<ExperienceBookingRules | null> {
    const exp = this.experiences.get(experienceId);
    return exp ? { ...exp } : null;
  }

  async createHoldBooking(input: CreateHoldBookingInput): Promise<HoldBookingRecord> {
    this.createBookingSpy(input);
    const record: StoredBookingRecord = {
      id: `booking-${this.bookings.length + 1}`,
      bookingReference: input.bookingReference,
      userId: input.userId,
      experienceId: input.experienceId,
      slotId: input.slotId,
      guestCount: input.guestCount,
      status: "HELD",
      heldUntil: input.heldUntil,
      totalAmountMinorUnits: input.totalAmountMinorUnits,
      currency: input.currency,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      specialRequests: input.specialRequests ?? null,
      createdAt: new Date(),
    };
    this.bookings.push(record);

    return {
      id: record.id,
      bookingReference: record.bookingReference,
      userId: record.userId,
      experienceId: record.experienceId,
      slotId: record.slotId,
      guestCount: record.guestCount,
      status: "HELD",
      heldUntil: record.heldUntil!,
      totalAmountMinorUnits: record.totalAmountMinorUnits,
      currency: record.currency,
      customerEmail: record.customerEmail,
      customerPhone: record.customerPhone,
      specialRequests: record.specialRequests,
      createdAt: record.createdAt,
    };
  }

  async runInTransaction<T>(fn: (repo: BookingCapacityRepository) => Promise<T>): Promise<T> {
    this.runInTxSpy();
    return await fn(this);
  }
}

describe("BookingCapacityEngine (LA-12 Phase 2 Sprint 2)", () => {
  const BASE_TIME = new Date("2026-11-10T10:00:00.000Z");
  const DEFAULT_NOW = () => new Date(BASE_TIME);

  function createTestFixture() {
    const repo = new MockBookingCapacityRepository();
    const expId = "exp-pune-001";
    const slotId = "slot-pune-001";

    const defaultExp: ExperienceBookingRules = {
      id: expId,
      title: "Heritage Pune Wada Architecture Walk",
      basePriceMinor: 250000, // INR 2,500.00 in paise
      currency: "INR",
      pricingUnit: "PER_PERSON",
      minGuests: 1,
      maxGuests: 10,
      status: "PUBLISHED",
    };

    const defaultSlot: LockedSlotRecord = {
      id: slotId,
      experienceId: expId,
      startsAt: new Date("2026-11-10T12:00:00.000Z"), // 2 hours from now
      endsAt: new Date("2026-11-10T14:00:00.000Z"),
      capacity: 10,
      reservedCount: 0,
      bookingCutoffMinutes: 30,
      status: "OPEN",
    };

    repo.experiences.set(expId, defaultExp);
    repo.slots.set(slotId, defaultSlot);

    const engine = new BookingCapacityEngine({
      repository: repo,
      now: DEFAULT_NOW,
    });

    return { repo, engine, expId, slotId, defaultExp, defaultSlot };
  }

  describe("Crockford Base32 Booking Reference", () => {
    it("generates reference with LV-XXXX-XXXX format and no ambiguous characters", () => {
      const ref = generateBookingReference("LV");
      expect(ref).toMatch(/^LV-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}$/);
      // Ensure excluded ambiguous Crockford characters: I, L, O, U are never in the random segments
      const randomSegments = ref.replace(/^LV-/, "").replace(/-/g, "");
      expect(randomSegments).not.toMatch(/[ILOU]/);
    });

    it("generates unique references across successive calls", () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const ref = generateBookingReference();
        expect(set.has(ref)).toBe(false);
        set.add(ref);
      }
    });
  });

  describe("Hold Creation & Dynamic Capacity Calculation", () => {
    it("successfully creates a 5-minute HELD booking for valid inputs", async () => {
      const { engine, repo, slotId } = createTestFixture();

      const result = await engine.reserveHold({
        slotId,
        userId: "user-traveller-1",
        guests: 2,
        customerEmail: "traveller@example.com",
      });

      expect(repo.acquireLockSpy).toHaveBeenCalledWith(slotId);
      expect(repo.runInTxSpy).toHaveBeenCalledTimes(1);
      expect(repo.createBookingSpy).toHaveBeenCalledTimes(1);

      expect(result.booking.status).toBe("HELD");
      expect(result.booking.guestCount).toBe(2);
      expect(result.booking.userId).toBe("user-traveller-1");
      expect(result.booking.customerEmail).toBe("traveller@example.com");

      // Verify 5-minute TTL (300,000 ms)
      const expectedHeldUntil = new Date(BASE_TIME.getTime() + 5 * 60 * 1000);
      expect(result.booking.heldUntil.toISOString()).toBe(expectedHeldUntil.toISOString());

      // Verify pricing: 2 guests * 250000 = 500000 paise
      expect(result.quote.totalMinor).toBe(500000);
      expect(result.quote.currency).toBe("INR");

      // Verify slot capacity feedback
      expect(result.slot.capacity).toBe(10);
      expect(result.slot.reservedCount).toBe(0);
      expect(result.slot.activeHeldSeatsAfterHold).toBe(2);
      expect(result.slot.availableCapacityAfterHold).toBe(8);
    });

    it("INVARIANT: Never modifies ExperienceSlot.reservedCount upon creating a hold", async () => {
      const { engine, repo, slotId } = createTestFixture();

      await engine.reserveHold({
        slotId,
        userId: "user-1",
        guests: 4,
      });

      const slotAfterHold = repo.slots.get(slotId);
      expect(slotAfterHold?.reservedCount).toBe(0); // MUST stay 0!
    });

    it("allows exact-fit capacity booking (all remaining seats)", async () => {
      const { engine, slotId } = createTestFixture();

      const result = await engine.reserveHold({
        slotId,
        userId: "user-exact",
        guests: 10,
      });

      expect(result.booking.guestCount).toBe(10);
      expect(result.slot.availableCapacityAfterHold).toBe(0);
    });

    it("rejects request exceeding available capacity with ConflictError", async () => {
      const { engine, slotId } = createTestFixture();

      // Reserve 6 seats first
      await engine.reserveHold({
        slotId,
        userId: "user-first",
        guests: 6,
      });

      // Now 4 seats remain. Requesting 5 (within maxGuests of 10) must throw ConflictError
      await expect(
        engine.reserveHold({
          slotId,
          userId: "user-too-many",
          guests: 5,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("deducts confirmed seats (reservedCount) and active holds dynamically", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();

      // Simulate 3 confirmed seats in slot
      repo.slots.set(slotId, { ...defaultSlot, reservedCount: 3 });

      // Simulate 4 active held seats
      repo.bookings.push({
        id: "prev-hold",
        bookingReference: "LV-AAAA-BBBB",
        userId: "user-other",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 4,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() + 180000), // active (expires in 3 min)
        totalAmountMinorUnits: 1000000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      // Total capacity: 10 - 3 (confirmed) - 4 (held) = 3 available
      // Requesting 4 should fail
      await expect(
        engine.reserveHold({
          slotId,
          userId: "user-new",
          guests: 4,
        }),
      ).rejects.toThrow(ConflictError);

      // Requesting 3 should succeed
      const ok = await engine.reserveHold({
        slotId,
        userId: "user-new",
        guests: 3,
      });
      expect(ok.slot.availableCapacityAfterHold).toBe(0);
    });

    it("dynamically reclaims capacity from EXPIRED holds (heldUntil <= NOW)", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();

      // Add an EXPIRED hold (heldUntil was 1 second before BASE_TIME)
      repo.bookings.push({
        id: "expired-hold-1",
        bookingReference: "LV-OLDD-1111",
        userId: "user-expired",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 6,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() - 1000), // expired!
        totalAmountMinorUnits: 1500000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: new Date(BASE_TIME.getTime() - 301000),
      });

      // The expired hold of 6 seats should be ignored; full 10 seats remain available
      const result = await engine.reserveHold({
        slotId,
        userId: "user-active",
        guests: 10,
      });

      expect(result.slot.availableCapacityAfterHold).toBe(0);
    });

    it("ignores CANCELLED bookings when computing active holds", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();

      repo.bookings.push({
        id: "cancelled-booking-1",
        bookingReference: "LV-CANC-1111",
        userId: "user-cancelled",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 5,
        status: "CANCELLED",
        heldUntil: new Date(BASE_TIME.getTime() + 180000),
        totalAmountMinorUnits: 1250000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      const result = await engine.reserveHold({
        slotId,
        userId: "user-active",
        guests: 10,
      });

      expect(result.slot.availableCapacityAfterHold).toBe(0);
    });

    it("ignores DRAFT bookings when computing active holds", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();

      repo.bookings.push({
        id: "draft-booking-1",
        bookingReference: "LV-DRAF-1111",
        userId: "user-draft",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 5,
        status: "DRAFT",
        heldUntil: null,
        totalAmountMinorUnits: 1250000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      const result = await engine.reserveHold({
        slotId,
        userId: "user-active",
        guests: 10,
      });

      expect(result.slot.availableCapacityAfterHold).toBe(0);
    });

    it("supports PER_GROUP pricing correctly", async () => {
      const { engine, repo, expId, slotId, defaultExp } = createTestFixture();

      // Change pricing unit to PER_GROUP (flat price regardless of guests)
      repo.experiences.set(expId, {
        ...defaultExp,
        pricingUnit: "PER_GROUP",
        basePriceMinor: 1500000, // INR 15,000 flat
      });

      const result = await engine.reserveHold({
        slotId,
        userId: "user-group",
        guests: 5,
      });

      expect(result.quote.pricingUnit).toBe("PER_GROUP");
      expect(result.quote.totalMinor).toBe(1500000);
      expect(result.quote.lines[0]?.quantity).toBe(1);
    });

    it("handles multiple sequential holds accumulating against slot capacity", async () => {
      const { engine, slotId } = createTestFixture();

      // Hold 1: 3 seats (7 left)
      const h1 = await engine.reserveHold({ slotId, userId: "u1", guests: 3 });
      expect(h1.slot.availableCapacityAfterHold).toBe(7);

      // Hold 2: 3 seats (4 left)
      const h2 = await engine.reserveHold({ slotId, userId: "u2", guests: 3 });
      expect(h2.slot.availableCapacityAfterHold).toBe(4);

      // Hold 3: 3 seats (1 left)
      const h3 = await engine.reserveHold({ slotId, userId: "u3", guests: 3 });
      expect(h3.slot.availableCapacityAfterHold).toBe(1);

      // Hold 4 requesting 2 seats should fail
      await expect(engine.reserveHold({ slotId, userId: "u4", guests: 2 })).rejects.toThrow(
        ConflictError,
      );

      // Hold 4 requesting remaining 1 seat should succeed
      const h4 = await engine.reserveHold({ slotId, userId: "u4", guests: 1 });
      expect(h4.slot.availableCapacityAfterHold).toBe(0);
    });

    it("persists special requests and customer phone on hold booking", async () => {
      const { engine, slotId } = createTestFixture();

      const result = await engine.reserveHold({
        slotId,
        userId: "u-vip",
        guests: 2,
        customerPhone: "+919876543210",
        specialRequests: "Wheelchair assistance required at venue",
      });

      expect(result.booking.customerPhone).toBe("+919876543210");
      expect(result.booking.specialRequests).toBe("Wheelchair assistance required at venue");
    });

    it("propagates repository errors cleanly during transaction execution", async () => {
      const { engine, repo, slotId } = createTestFixture();
      repo.acquireSlotLock = vi.fn().mockRejectedValue(new Error("Database connection dropped"));

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        "Database connection dropped",
      );
    });
  });

  describe("Validation & Invariant Enforcement", () => {
    it("rejects guestCount = 0 with ValidationError", async () => {
      const { engine, slotId } = createTestFixture();
      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 0 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("rejects negative guestCount with ValidationError", async () => {
      const { engine, slotId } = createTestFixture();
      await expect(engine.reserveHold({ slotId, userId: "u1", guests: -2 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("rejects non-integer guestCount with ValidationError", async () => {
      const { engine, slotId } = createTestFixture();
      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 2.5 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("rejects empty slotId with ValidationError", async () => {
      const { engine } = createTestFixture();
      await expect(engine.reserveHold({ slotId: "   ", userId: "u1", guests: 1 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("rejects empty userId with ValidationError", async () => {
      const { engine, slotId } = createTestFixture();
      await expect(engine.reserveHold({ slotId, userId: "", guests: 1 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("rejects non-existent slot with NotFoundError", async () => {
      const { engine } = createTestFixture();
      await expect(
        engine.reserveHold({ slotId: "non-existent-slot", userId: "u1", guests: 1 }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects CLOSED slot with ConflictError", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();
      repo.slots.set(slotId, { ...defaultSlot, status: "CLOSED" });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        ConflictError,
      );
    });

    it("rejects slot in the past with ConflictError", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();
      repo.slots.set(slotId, {
        ...defaultSlot,
        startsAt: new Date(BASE_TIME.getTime() - 60000), // 1 minute in the past
      });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        ConflictError,
      );
    });

    it("rejects slot within operational cutoff window with ConflictError", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();
      // Cutoff is 30 mins; slot starts in 20 mins -> booking cutoff has passed
      repo.slots.set(slotId, {
        ...defaultSlot,
        startsAt: new Date(BASE_TIME.getTime() + 20 * 60 * 1000),
        bookingCutoffMinutes: 30,
      });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        ConflictError,
      );
    });

    it("rejects non-existent experience with NotFoundError", async () => {
      const { engine, repo, expId, slotId } = createTestFixture();
      repo.experiences.delete(expId);

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("rejects unpublished experience with ConflictError", async () => {
      const { engine, repo, expId, slotId, defaultExp } = createTestFixture();
      repo.experiences.set(expId, { ...defaultExp, status: "DRAFT" });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        ConflictError,
      );
    });

    it("rejects experience priced on request (null basePriceMinor) with ValidationError", async () => {
      const { engine, repo, expId, slotId, defaultExp } = createTestFixture();
      repo.experiences.set(expId, { ...defaultExp, basePriceMinor: null });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 1 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("enforces experience minGuests limit with ValidationError", async () => {
      const { engine, repo, expId, slotId, defaultExp } = createTestFixture();
      repo.experiences.set(expId, { ...defaultExp, minGuests: 3 });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 2 })).rejects.toThrow(
        ValidationError,
      );
    });

    it("enforces experience maxGuests limit with ValidationError", async () => {
      const { engine, repo, expId, slotId, defaultExp } = createTestFixture();
      repo.experiences.set(expId, { ...defaultExp, maxGuests: 6 });

      await expect(engine.reserveHold({ slotId, userId: "u1", guests: 7 })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("Slot Capacity Summary Inspection", () => {
    it("accurately returns capacity summary with active holds and confirmed seats", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();

      repo.slots.set(slotId, { ...defaultSlot, capacity: 20, reservedCount: 5 });

      repo.bookings.push({
        id: "b-1",
        bookingReference: "LV-1111-2222",
        userId: "u-active",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 3,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() + 100000),
        totalAmountMinorUnits: 750000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      const summary = await engine.getSlotCapacitySummary(slotId);

      expect(summary.totalCapacity).toBe(20);
      expect(summary.confirmedReservedCount).toBe(5);
      expect(summary.activeHeldSeats).toBe(3);
      expect(summary.availableCapacity).toBe(12); // 20 - 5 - 3 = 12
    });

    it("clamps availableCapacity to 0 if confirmed + holds equal or exceed total", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();
      repo.slots.set(slotId, { ...defaultSlot, capacity: 5, reservedCount: 5 });

      const summary = await engine.getSlotCapacitySummary(slotId);
      expect(summary.availableCapacity).toBe(0);
    });
  });

  describe("Hold Expiration Precision & Boundary Conditions", () => {
    it("treats hold as active at T + 4m59s (299,000ms) and expired at T + 5m (300,000ms)", async () => {
      const { repo, slotId, defaultSlot } = createTestFixture();

      // Existing hold created at BASE_TIME with 5m TTL
      repo.bookings.push({
        id: "hold-boundary",
        bookingReference: "LV-BD01-1111",
        userId: "u-boundary",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 10,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() + 300000), // exactly 5 minutes
        totalAmountMinorUnits: 2500000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      // At T + 4m59s (299,000ms), hold is still active -> 0 seats available
      const timeActive = new Date(BASE_TIME.getTime() + 299000);
      const activeSeats = await repo.getActiveHeldSeats(slotId, timeActive);
      expect(activeSeats).toBe(10);

      // At exactly T + 5m (300,000ms), heldUntil is not > now -> hold is expired
      const timeExpiredExact = new Date(BASE_TIME.getTime() + 300000);
      const expiredSeatsExact = await repo.getActiveHeldSeats(slotId, timeExpiredExact);
      expect(expiredSeatsExact).toBe(0);

      // At T + 5m01s (301,000ms), hold is expired -> 0 active held seats
      const timeAfterExpiry = new Date(BASE_TIME.getTime() + 301000);
      const expiredSeatsAfter = await repo.getActiveHeldSeats(slotId, timeAfterExpiry);
      expect(expiredSeatsAfter).toBe(0);
    });

    it("reclaims staggered holds independently across progressive timeline steps", async () => {
      const { repo, slotId, defaultSlot } = createTestFixture();

      // Hold 1: 3 seats, expires at T + 60s
      repo.bookings.push({
        id: "hold-t1",
        bookingReference: "LV-STG1-1111",
        userId: "u1",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 3,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() + 60000),
        totalAmountMinorUnits: 750000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      // Hold 2: 4 seats, expires at T + 180s
      repo.bookings.push({
        id: "hold-t2",
        bookingReference: "LV-STG2-2222",
        userId: "u2",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 4,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() + 180000),
        totalAmountMinorUnits: 1000000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      // Hold 3: 2 seats, expires at T + 300s
      repo.bookings.push({
        id: "hold-t3",
        bookingReference: "LV-STG3-3333",
        userId: "u3",
        experienceId: defaultSlot.experienceId,
        slotId,
        guestCount: 2,
        status: "HELD",
        heldUntil: new Date(BASE_TIME.getTime() + 300000),
        totalAmountMinorUnits: 500000,
        currency: "INR",
        customerEmail: null,
        customerPhone: null,
        specialRequests: null,
        createdAt: BASE_TIME,
      });

      // At T + 0s: All 3 active -> 3 + 4 + 2 = 9 held
      expect(await repo.getActiveHeldSeats(slotId, BASE_TIME)).toBe(9);

      // At T + 90s: Hold 1 expired -> 4 + 2 = 6 held
      expect(await repo.getActiveHeldSeats(slotId, new Date(BASE_TIME.getTime() + 90000))).toBe(6);

      // At T + 200s: Holds 1 and 2 expired -> 2 held
      expect(await repo.getActiveHeldSeats(slotId, new Date(BASE_TIME.getTime() + 200000))).toBe(2);

      // At T + 301s: All expired -> 0 held
      expect(await repo.getActiveHeldSeats(slotId, new Date(BASE_TIME.getTime() + 301000))).toBe(0);
    });

    it("evaluates time consistently across UTC and ISO timezone representations", async () => {
      const { engine, slotId } = createTestFixture();

      // UTC timestamp
      const utcString = "2026-11-10T10:00:00.000Z";
      // Equivalent IST (+05:30) timestamp
      const istString = "2026-11-10T15:30:00.000+05:30";

      const timeUtc = new Date(utcString);
      const timeIst = new Date(istString);
      expect(timeUtc.getTime()).toBe(timeIst.getTime());

      const result = await engine.reserveHold({
        slotId,
        userId: "u-tz",
        guests: 1,
      });

      expect(result.booking.heldUntil.getTime()).toBe(BASE_TIME.getTime() + HOLD_DURATION_MS);
    });

    it("rejects reservations on a completely sold out slot (reservedCount = capacity)", async () => {
      const { engine, repo, slotId, defaultSlot } = createTestFixture();
      repo.slots.set(slotId, { ...defaultSlot, reservedCount: 10 });

      await expect(
        engine.reserveHold({
          slotId,
          userId: "u-late",
          guests: 1,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects booking requests with extremely large guest numbers exceeding safety limits", async () => {
      const { engine, slotId } = createTestFixture();

      await expect(
        engine.reserveHold({
          slotId,
          userId: "u-huge",
          guests: Number.MAX_SAFE_INTEGER,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
