import { describe, expect, it } from "vitest";
import { testDb, testEmail } from "./helpers";
import { CheckoutOrdersService, type CheckoutOrderResult } from "@/modules/booking/checkout-orders";
import { PrismaCheckoutOrdersRepository } from "@/adapters/persistence/prisma/checkout-orders-repositories";
import type { CreateOrderInput, PaymentGatewayPort, ProviderOrder } from "@/ports/payments";
import {
  OrderCreationInProgressError,
  OrderStatusUnresolvedError,
  PaymentGatewayTimeoutError,
  ProviderTimeoutError,
} from "@/lib/errors";

/**
 * PostgreSQL Integration Test Suite for Decoupled Checkout Orders (LA-12 Phase 2 Sprint 3).
 *
 * Exercises real PostgreSQL row-level mutex locking (`SELECT ... FOR UPDATE`),
 * two-phase short database transaction boundaries, coherent order reuse,
 * ambiguous state blocking, and fast-webhook race recovery using real PostgreSQL transactions.
 */
describe("Checkout Orders Concurrency & Mutex (PostgreSQL)", () => {
  const isDbConfigured = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

  async function createFixture() {
    const hostUser = await testDb.user.create({
      data: { email: testEmail("co-host") },
    });
    const host = await testDb.host.create({
      data: { userId: hostUser.id, displayName: `Host-${Date.now()}` },
    });
    const experience = await testDb.experience.create({
      data: {
        hostId: host.id,
        title: "Pessimistic Concurrency Heritage Tour",
        slug: `concurrency-tour-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        summary: "Summary for concurrency test.",
        description: "Description for concurrency test.",
        basePriceMinor: 50000,
        currency: "INR",
        pricingUnit: "PER_PERSON",
        minGuests: 1,
        maxGuests: 20,
        durationMinutes: 120,
        status: "PUBLISHED",
      },
    });
    const slot = await testDb.experienceSlot.create({
      data: {
        experienceId: experience.id,
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
        capacity: 10,
        reservedCount: 0,
      },
    });
    const traveller = await testDb.user.create({
      data: { email: testEmail("co-traveller") },
    });
    const booking = await testDb.booking.create({
      data: {
        userId: traveller.id,
        experienceId: experience.id,
        slotId: slot.id,
        guestCount: 2,
        bookingReference: `BK-CO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: "HELD",
        heldUntil: new Date(Date.now() + 300_000), // 5 min hold
        totalAmountMinorUnits: 50000,
        currency: "INR",
      },
    });

    return { hostUser, host, experience, slot, traveller, booking };
  }

  async function cleanupFixture(bookingId: string, userIds: string[]) {
    await testDb.payment.deleteMany({ where: { bookingId } });
    await testDb.booking.deleteMany({ where: { id: bookingId } });
    await testDb.user.deleteMany({ where: { id: { in: userIds } } });
  }

  function createMockGateway(
    createOrder: (input: CreateOrderInput) => Promise<ProviderOrder>,
  ): PaymentGatewayPort {
    return {
      createOrder,
      verifyCheckoutSignature: () => true,
      verifyWebhook: async () => ({ eventId: "evt_mock", eventType: "test", payload: {} }),
      fetchPayment: async () => {
        throw new Error("fetchPayment not implemented");
      },
    };
  }

  // ── Scenario 1: Two Simultaneous Checkout Requests Against Same Held Booking ─
  it.runIf(isDbConfigured)(
    "Scenario 1: Two simultaneous requests create exactly one Payment row and make exactly one gateway call",
    async () => {
      const { booking, traveller, hostUser } = await createFixture();

      let gatewayCallCount = 0;
      const mockGateway = createMockGateway(async (input) => {
        gatewayCallCount += 1;
        // Simulate realistic remote gateway latency (150ms)
        await new Promise((resolve) => setTimeout(resolve, 150));
        return {
          providerOrderId: `order_real_pg_${Date.now()}`,
          amount: input.amount,
          status: "created",
        };
      });

      const repository = new PrismaCheckoutOrdersRepository(testDb);
      const service = new CheckoutOrdersService({
        repository,
        gateway: mockGateway,
      });

      // Dispatch 2 simultaneous checkout requests for the same HELD booking
      const [result1, result2] = await Promise.allSettled([
        service.createCheckoutOrder({ bookingId: booking.id, userId: traveller.id }),
        service.createCheckoutOrder({ bookingId: booking.id, userId: traveller.id }),
      ]);

      // Exactly one gateway call occurred!
      expect(gatewayCallCount).toBe(1);

      // Verify responses: one request succeeds with 201 Created.
      // The second request either receives 409 Conflict (OrderCreationInProgressError)
      // or 200 OK (idempotent replay of the newly committed order).
      const successes = [result1, result2].filter((r) => r.status === "fulfilled");
      const rejections = [result1, result2].filter((r) => r.status === "rejected");

      if (rejections.length > 0) {
        expect(rejections[0]?.status).toBe("rejected");
        expect(
          (rejections[0] as PromiseRejectedResult).reason instanceof OrderCreationInProgressError,
        ).toBe(true);
        expect(successes.length).toBe(1);
        const success = (successes[0] as PromiseFulfilledResult<CheckoutOrderResult>).value;
        expect(success.statusCode).toBe(201);
        expect(success.body.orderId).toBe(success.body.gatewayOrderId);
      } else {
        // Both fulfilled: first request returned 201 Created, second returned 200 OK (idempotent replay)
        expect(successes.length).toBe(2);
        const statusCodes = successes.map(
          (s) => (s as PromiseFulfilledResult<CheckoutOrderResult>).value.statusCode,
        );
        expect(statusCodes).toContain(201);
        expect(statusCodes).toContain(200);
      }

      // Assert PostgreSQL state: EXACTLY ONE Payment row created for this booking
      const paymentsInDb = await testDb.payment.findMany({
        where: { bookingId: booking.id },
      });
      expect(paymentsInDb.length).toBe(1);
      expect(paymentsInDb[0]?.status).toBe("INITIATED");
      expect(paymentsInDb[0]?.razorpayOrderId).toMatch(/^order_real_pg_/);

      await cleanupFixture(booking.id, [traveller.id, hostUser.id]);
    },
  );

  // ── Scenario 2: Existing INITIATED Order Reused Idempotently (Scenario B) ─────
  it.runIf(isDbConfigured)(
    "Scenario 2: Existing INITIATED order is reused without another gateway order",
    async () => {
      const { booking, traveller, hostUser } = await createFixture();

      // Pre-seed an INITIATED payment in real PostgreSQL
      const existingPayment = await testDb.payment.create({
        data: {
          bookingId: booking.id,
          amountMinorUnits: 50000,
          currency: "INR",
          status: "INITIATED",
          razorpayOrderId: "order_pre_existing_789",
        },
      });

      let gatewayCallCount = 0;
      const mockGateway = createMockGateway(async () => {
        gatewayCallCount += 1;
        throw new Error("createOrder must not be called when INITIATED order exists!");
      });

      const repository = new PrismaCheckoutOrdersRepository(testDb);
      const service = new CheckoutOrdersService({
        repository,
        gateway: mockGateway,
      });

      const result = await service.createCheckoutOrder({
        bookingId: booking.id,
        userId: traveller.id,
      });

      // Verify response: HTTP 200 OK with identical orderId and gatewayOrderId
      expect(result.statusCode).toBe(200);
      expect(result.body.gatewayOrderId).toBe("order_pre_existing_789");
      expect(result.body.orderId).toBe("order_pre_existing_789");
      expect(result.body.paymentId).toBe(existingPayment.id);
      expect(result.body.status).toBe("INITIATED");

      // Verify ZERO gateway calls
      expect(gatewayCallCount).toBe(0);

      // Verify exactly 1 Payment record remains in PostgreSQL
      const paymentsInDb = await testDb.payment.findMany({
        where: { bookingId: booking.id },
      });
      expect(paymentsInDb.length).toBe(1);

      await cleanupFixture(booking.id, [traveller.id, hostUser.id]);
    },
  );

  // ── Scenario 3: Existing INITIATED_UNCERTAIN Blocks New Order Creation ────────
  it.runIf(isDbConfigured)(
    "Scenario 3: Existing INITIATED_UNCERTAIN payment blocks new order creation",
    async () => {
      const { booking, traveller, hostUser } = await createFixture();

      // Pre-seed an INITIATED_UNCERTAIN payment in real PostgreSQL
      await testDb.payment.create({
        data: {
          bookingId: booking.id,
          amountMinorUnits: 50000,
          currency: "INR",
          status: "INITIATED_UNCERTAIN",
          errorCode: "GATEWAY_TIMEOUT",
          errorDescription: "Provider timed out during attempt 1",
        },
      });

      let gatewayCallCount = 0;
      const mockGateway = createMockGateway(async () => {
        gatewayCallCount += 1;
        throw new Error("createOrder must not be called when UNCERTAIN payment exists!");
      });

      const repository = new PrismaCheckoutOrdersRepository(testDb);
      const service = new CheckoutOrdersService({
        repository,
        gateway: mockGateway,
      });

      await expect(
        service.createCheckoutOrder({
          bookingId: booking.id,
          userId: traveller.id,
        }),
      ).rejects.toThrow(OrderStatusUnresolvedError);

      expect(gatewayCallCount).toBe(0);

      // Verify no second payment record was inserted in PostgreSQL
      const paymentsInDb = await testDb.payment.findMany({
        where: { bookingId: booking.id },
      });
      expect(paymentsInDb.length).toBe(1);
      expect(paymentsInDb[0]?.status).toBe("INITIATED_UNCERTAIN");

      await cleanupFixture(booking.id, [traveller.id, hostUser.id]);
    },
  );

  // ── Scenario 4: Gateway Timeout Persists INITIATED_UNCERTAIN in PostgreSQL ───
  it.runIf(isDbConfigured)(
    "Scenario 4: Gateway timeout persists INITIATED_UNCERTAIN in PostgreSQL and blocks subsequent attempts",
    async () => {
      const { booking, traveller, hostUser } = await createFixture();

      const mockGateway = createMockGateway(async () => {
        throw new ProviderTimeoutError("Payment provider timed out after 8000ms.");
      });

      const repository = new PrismaCheckoutOrdersRepository(testDb);
      const service = new CheckoutOrdersService({
        repository,
        gateway: mockGateway,
      });

      // First attempt triggers gateway timeout
      await expect(
        service.createCheckoutOrder({
          bookingId: booking.id,
          userId: traveller.id,
        }),
      ).rejects.toThrow(PaymentGatewayTimeoutError);

      // Verify PostgreSQL row was updated to INITIATED_UNCERTAIN
      const paymentsInDb = await testDb.payment.findMany({
        where: { bookingId: booking.id },
      });
      expect(paymentsInDb.length).toBe(1);
      expect(paymentsInDb[0]?.status).toBe("INITIATED_UNCERTAIN");
      expect(paymentsInDb[0]?.errorCode).toBe("GATEWAY_TIMEOUT");

      // Immediate retry is safely blocked without making a new gateway call
      await expect(
        service.createCheckoutOrder({
          bookingId: booking.id,
          userId: traveller.id,
        }),
      ).rejects.toThrow(OrderStatusUnresolvedError);

      await cleanupFixture(booking.id, [traveller.id, hostUser.id]);
    },
  );

  // ── Scenario 5: Fast Concurrent Webhook State Advance Not Overwritten ────────
  it.runIf(isDbConfigured)(
    "Scenario 5: Concurrent webhook state advance to CAPTURED is preserved by Phase 3 conditional update",
    async () => {
      const { booking, traveller, hostUser } = await createFixture();
      const mockGatewayOrderId = `order_webhook_race_${Date.now()}`;

      const mockGateway = createMockGateway(async () => {
        // While Phase 2 runs, simulate an out-of-band webhook arriving and updating the row in PostgreSQL
        const createdPayment = await testDb.payment.findFirstOrThrow({
          where: { bookingId: booking.id, status: "CREATED" },
        });

        await testDb.payment.update({
          where: { id: createdPayment.id },
          data: {
            status: "CAPTURED",
            razorpayOrderId: mockGatewayOrderId,
            razorpayPaymentId: "pay_test_race_123",
          },
        });

        return {
          providerOrderId: mockGatewayOrderId,
          amount: { amountMinor: 50000, currency: "INR" },
          status: "created",
        };
      });

      const repository = new PrismaCheckoutOrdersRepository(testDb);
      const service = new CheckoutOrdersService({
        repository,
        gateway: mockGateway,
      });

      const result = await service.createCheckoutOrder({
        bookingId: booking.id,
        userId: traveller.id,
      });

      // Phase 3 detected 0 rows affected by WHERE status = 'CREATED',
      // re-read PostgreSQL, verified matching orderId, preserved CAPTURED, and returned 201 Created (Scenario A2)
      expect(result.statusCode).toBe(201);
      expect(result.body.gatewayOrderId).toBe(mockGatewayOrderId);
      expect(result.body.orderId).toBe(mockGatewayOrderId);
      expect(result.body.status).toBe("CAPTURED");

      // Verify PostgreSQL was NOT overwritten back to INITIATED
      const paymentsInDb = await testDb.payment.findMany({
        where: { bookingId: booking.id },
      });
      expect(paymentsInDb.length).toBe(1);
      expect(paymentsInDb[0]?.status).toBe("CAPTURED");
      expect(paymentsInDb[0]?.razorpayOrderId).toBe(mockGatewayOrderId);
      expect(paymentsInDb[0]?.razorpayPaymentId).toBe("pay_test_race_123");

      await cleanupFixture(booking.id, [traveller.id, hostUser.id]);
    },
  );
});
