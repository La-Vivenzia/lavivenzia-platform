import { describe, expect, it } from "vitest";
import { BookingCapacityEngine } from "@/modules/booking/capacity-engine";
import { PrismaBookingCapacityRepository } from "@/adapters/persistence/prisma/booking-capacity-repositories";
import { ConflictError } from "@/lib/errors";
import { testDb, testEmail } from "./helpers";

/**
 * Concurrency & Mutex Integration Test Suite (LA-12 Phase 2 Sprint 2).
 *
 * Exercises PostgreSQL row-level mutex locking (`SELECT ... FOR UPDATE`)
 * across all 10 authoritative concurrency, isolation, stress, and rollback scenarios.
 */
describe("Booking Capacity Engine Concurrency Mutex (PostgreSQL)", () => {
  const isDbConfigured = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

  // Helper to create a test host & published experience
  async function createFixtureExperience(maxGuests = 50) {
    const hostUser = await testDb.user.create({
      data: { email: testEmail("host") },
    });

    const host = await testDb.host.create({
      data: {
        userId: hostUser.id,
        displayName: `Host-${Date.now()}`,
      },
    });

    const experience = await testDb.experience.create({
      data: {
        hostId: host.id,
        title: "Pessimistic Concurrency Heritage Tour",
        slug: `concurrency-tour-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        summary: "A high concurrency validation test listing for slot mutexes.",
        description:
          "Full description of high concurrency architecture tour in Shaniwar Wada Pune.",
        basePriceMinor: 100000, // INR 1,000.00
        currency: "INR",
        pricingUnit: "PER_PERSON",
        minGuests: 1,
        maxGuests,
        durationMinutes: 120,
        status: "PUBLISHED",
      },
    });

    return { hostUser, host, experience };
  }

  // ── Scenario 1: Capacity 5, ten concurrent requests for one seat ──────────
  it.runIf(isDbConfigured)(
    "Scenario 1: Capacity 5, ten concurrent requests for one seat each",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 5,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const travellers = await Promise.all(
        Array.from({ length: 10 }).map((_, i) =>
          testDb.user.create({ data: { email: testEmail(`s1-u${i}`) } }),
        ),
      );

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      const results = await Promise.allSettled(
        travellers.map((t) => engine.reserveHold({ slotId: slot.id, userId: t.id, guests: 1 })),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes.length).toBe(5);
      expect(failures.length).toBe(5);
      for (const f of failures) {
        if (f.status === "rejected") {
          expect(f.reason).toBeInstanceOf(ConflictError);
        }
      }

      const activeHeld = await repository.getActiveHeldSeats(slot.id, new Date());
      expect(activeHeld).toBe(5);

      const freshSlot = await testDb.experienceSlot.findUnique({ where: { id: slot.id } });
      expect(freshSlot?.reservedCount).toBe(0);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, ...travellers.map((t) => t.id)] } },
      });
    },
  );

  // ── Scenario 2: Capacity 10, two concurrent requests for six seats each ───
  it.runIf(isDbConfigured)(
    "Scenario 2: Capacity 10, two concurrent requests for six seats each",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 10,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const travellers = await Promise.all([
        testDb.user.create({ data: { email: testEmail("s2-u1") } }),
        testDb.user.create({ data: { email: testEmail("s2-u2") } }),
      ]);

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      const results = await Promise.allSettled(
        travellers.map((t) => engine.reserveHold({ slotId: slot.id, userId: t.id, guests: 6 })),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      const activeHeld = await repository.getActiveHeldSeats(slot.id, new Date());
      expect(activeHeld).toBe(6);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, ...travellers.map((t) => t.id)] } },
      });
    },
  );

  // ── Scenario 3: Capacity 20, twenty concurrent requests for one seat each ─
  it.runIf(isDbConfigured)(
    "Scenario 3: Capacity 20, twenty concurrent requests for one seat each",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience(25);

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 20,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const travellers = await Promise.all(
        Array.from({ length: 20 }).map((_, i) =>
          testDb.user.create({ data: { email: testEmail(`s3-u${i}`) } }),
        ),
      );

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      const results = await Promise.allSettled(
        travellers.map((t) => engine.reserveHold({ slotId: slot.id, userId: t.id, guests: 1 })),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes.length).toBe(20);
      expect(failures.length).toBe(0);

      const activeHeld = await repository.getActiveHeldSeats(slot.id, new Date());
      expect(activeHeld).toBe(20);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, ...travellers.map((t) => t.id)] } },
      });
    },
  );

  // ── Scenario 4: Capacity 10, twenty concurrent requests for two seats each ─
  it.runIf(isDbConfigured)(
    "Scenario 4: Capacity 10, twenty concurrent requests for two seats each",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 10,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const travellers = await Promise.all(
        Array.from({ length: 20 }).map((_, i) =>
          testDb.user.create({ data: { email: testEmail(`s4-u${i}`) } }),
        ),
      );

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      const results = await Promise.allSettled(
        travellers.map((t) => engine.reserveHold({ slotId: slot.id, userId: t.id, guests: 2 })),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes.length).toBe(5); // 5 * 2 = 10 seats
      expect(failures.length).toBe(15);

      const activeHeld = await repository.getActiveHeldSeats(slot.id, new Date());
      expect(activeHeld).toBe(10);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, ...travellers.map((t) => t.id)] } },
      });
    },
  );

  // ── Scenario 5: Capacity 10, one hundred concurrent requests for one seat each ─
  it.runIf(isDbConfigured)(
    "Scenario 5: Capacity 10, one hundred concurrent requests for one seat each",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 10,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const travellers = await Promise.all(
        Array.from({ length: 100 }).map((_, i) =>
          testDb.user.create({ data: { email: testEmail(`s5-u${i}`) } }),
        ),
      );

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      const results = await Promise.allSettled(
        travellers.map((t) => engine.reserveHold({ slotId: slot.id, userId: t.id, guests: 1 })),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes.length).toBe(10);
      expect(failures.length).toBe(90);

      const activeHeld = await repository.getActiveHeldSeats(slot.id, new Date());
      expect(activeHeld).toBe(10);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, ...travellers.map((t) => t.id)] } },
      });
    },
  );

  // ── Scenario 6: Two different slots receiving concurrent reservations ────
  it.runIf(isDbConfigured)(
    "Scenario 6: Concurrent requests against different slots proceed without blocking",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const [slotA, slotB] = await Promise.all([
        testDb.experienceSlot.create({
          data: {
            experienceId: experience.id,
            startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
            capacity: 5,
            reservedCount: 0,
            bookingCutoffMinutes: 0,
            status: "OPEN",
          },
        }),
        testDb.experienceSlot.create({
          data: {
            experienceId: experience.id,
            startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            endsAt: new Date(Date.now() + 50 * 60 * 60 * 1000),
            capacity: 5,
            reservedCount: 0,
            bookingCutoffMinutes: 0,
            status: "OPEN",
          },
        }),
      ]);

      const travellersA = await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          testDb.user.create({ data: { email: testEmail(`s6a-${i}`) } }),
        ),
      );
      const travellersB = await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          testDb.user.create({ data: { email: testEmail(`s6b-${i}`) } }),
        ),
      );

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      // Run 5 requests for Slot A and 5 requests for Slot B concurrently
      const allResults = await Promise.allSettled([
        ...travellersA.map((t) =>
          engine.reserveHold({ slotId: slotA.id, userId: t.id, guests: 1 }),
        ),
        ...travellersB.map((t) =>
          engine.reserveHold({ slotId: slotB.id, userId: t.id, guests: 1 }),
        ),
      ]);

      const successes = allResults.filter((r) => r.status === "fulfilled");
      expect(successes.length).toBe(10); // All 10 succeed independently

      // Cleanup
      await testDb.bookingItem.deleteMany({
        where: { booking: { slotId: { in: [slotA.id, slotB.id] } } },
      });
      await testDb.booking.deleteMany({ where: { slotId: { in: [slotA.id, slotB.id] } } });
      await testDb.experienceSlot.deleteMany({ where: { id: { in: [slotA.id, slotB.id] } } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: {
          id: {
            in: [hostUser.id, ...travellersA.map((t) => t.id), ...travellersB.map((t) => t.id)],
          },
        },
      });
    },
  );

  // ── Scenario 7: Transaction failure rollback ──────────────────────────────
  it.runIf(isDbConfigured)(
    "Scenario 7: Transaction failure leaves zero partial records on failure",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 5,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const traveller = await testDb.user.create({ data: { email: testEmail("s7-t") } });
      const repository = new PrismaBookingCapacityRepository(testDb);

      // Attempt reservation that fails capacity check
      const engine = new BookingCapacityEngine({ repository });
      await expect(
        engine.reserveHold({ slotId: slot.id, userId: traveller.id, guests: 6 }),
      ).rejects.toThrow(ConflictError);

      // Verify no booking or line items were created
      const count = await testDb.booking.count({ where: { slotId: slot.id } });
      expect(count).toBe(0);

      // Cleanup
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({ where: { id: { in: [hostUser.id, traveller.id] } } });
    },
  );

  // ── Scenario 8: Expired hold exclusion ────────────────────────────────────
  it.runIf(isDbConfigured)(
    "Scenario 8: Expired hold exclusion reclaims capacity immediately",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 5,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const oldTraveller = await testDb.user.create({ data: { email: testEmail("s8-old") } });
      const newTraveller = await testDb.user.create({ data: { email: testEmail("s8-new") } });

      // Create an expired hold in the database (heldUntil 10 seconds ago)
      await testDb.booking.create({
        data: {
          bookingReference: `LV-EXP1-${Date.now().toString().slice(-4)}`,
          userId: oldTraveller.id,
          experienceId: experience.id,
          slotId: slot.id,
          guestCount: 5,
          status: "HELD",
          heldUntil: new Date(Date.now() - 10000),
          totalAmountMinorUnits: 500000,
          currency: "INR",
        },
      });

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      // New reservation for all 5 seats should succeed because previous hold is expired
      const result = await engine.reserveHold({
        slotId: slot.id,
        userId: newTraveller.id,
        guests: 5,
      });

      expect(result.booking.guestCount).toBe(5);
      expect(result.slot.availableCapacityAfterHold).toBe(0);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, oldTraveller.id, newTraveller.id] } },
      });
    },
  );

  // ── Scenario 9: Multiple active hold aggregation ──────────────────────────
  it.runIf(isDbConfigured)(
    "Scenario 9: Multiple active hold aggregation sums correctly across users",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 10,
          reservedCount: 2, // 2 confirmed seats
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const t1 = await testDb.user.create({ data: { email: testEmail("s9-t1") } });
      const t2 = await testDb.user.create({ data: { email: testEmail("s9-t2") } });
      const t3 = await testDb.user.create({ data: { email: testEmail("s9-t3") } });

      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      // Reserve 2 seats, then 3 seats
      await engine.reserveHold({ slotId: slot.id, userId: t1.id, guests: 2 });
      await engine.reserveHold({ slotId: slot.id, userId: t2.id, guests: 3 });

      // Available: 10 - 2 (confirmed) - 5 (held) = 3 available
      const summary = await engine.getSlotCapacitySummary(slot.id);
      expect(summary.totalCapacity).toBe(10);
      expect(summary.confirmedReservedCount).toBe(2);
      expect(summary.activeHeldSeats).toBe(5);
      expect(summary.availableCapacity).toBe(3);

      // Requesting 4 seats fails
      await expect(
        engine.reserveHold({ slotId: slot.id, userId: t3.id, guests: 4 }),
      ).rejects.toThrow(ConflictError);

      // Requesting 3 seats succeeds
      const r3 = await engine.reserveHold({ slotId: slot.id, userId: t3.id, guests: 3 });
      expect(r3.slot.availableCapacityAfterHold).toBe(0);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({
        where: { id: { in: [hostUser.id, t1.id, t2.id, t3.id] } },
      });
    },
  );

  // ── Scenario 10: Repeated Reservation Requests — Capacity Exhaustion ────────
  it.runIf(isDbConfigured)(
    "Scenario 10: Repeated Reservation Requests — Capacity Exhaustion",
    async () => {
      const { hostUser, host, experience } = await createFixtureExperience();

      const slot = await testDb.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
          capacity: 5,
          reservedCount: 0,
          bookingCutoffMinutes: 0,
          status: "OPEN",
        },
      });

      const traveller = await testDb.user.create({ data: { email: testEmail("s10-t") } });
      const repository = new PrismaBookingCapacityRepository(testDb);
      const engine = new BookingCapacityEngine({ repository });

      // First request for 3 seats -> succeeds
      const first = await engine.reserveHold({
        slotId: slot.id,
        userId: traveller.id,
        guests: 3,
      });
      expect(first.booking.guestCount).toBe(3);

      // Under Step 2, each call creates a discrete hold until capacity exhausts.
      // Second request for 3 seats on remaining 2 capacity -> fails with ConflictError
      await expect(
        engine.reserveHold({
          slotId: slot.id,
          userId: traveller.id,
          guests: 3,
        }),
      ).rejects.toThrow(ConflictError);

      // Cleanup
      await testDb.bookingItem.deleteMany({ where: { booking: { slotId: slot.id } } });
      await testDb.booking.deleteMany({ where: { slotId: slot.id } });
      await testDb.experienceSlot.delete({ where: { id: slot.id } });
      await testDb.experience.delete({ where: { id: experience.id } });
      await testDb.host.delete({ where: { id: host.id } });
      await testDb.user.deleteMany({ where: { id: { in: [hostUser.id, traveller.id] } } });
    },
  );
});
