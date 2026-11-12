process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789012345678901234567890123456789012345678901234567890123";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://lavivenzia:lavivenzia_local_dev@localhost:5432/lavivenzia";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";

import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  OrderCreationInProgressError,
  OrderStatusUnresolvedError,
  PaymentGatewayError,
  PaymentGatewayTimeoutError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  ValidationError,
} from "@/lib/errors";
import { CheckoutOrdersService } from "@/modules/booking/checkout-orders";
import type {
  BookingForCheckoutRecord,
  CheckoutOrdersRepository,
  CreatePaymentInput,
  PaymentRecord,
} from "@/modules/booking/checkout-orders-ports";
import type { CreateOrderInput, PaymentGatewayPort, ProviderOrder } from "@/ports/payments";

const BASE_TIME = new Date("2026-11-11T12:00:00.000Z");
const BOOKING_ID = "8b9487c6-2c93-4e42-998e-4a64860b21a8";
const USER_ID = "traveller_user_123";

function createDefaultBooking(
  overrides: Partial<BookingForCheckoutRecord> = {},
): BookingForCheckoutRecord {
  return {
    id: BOOKING_ID,
    bookingReference: "LV-TEST-1234",
    userId: USER_ID,
    status: "HELD",
    heldUntil: new Date(BASE_TIME.getTime() + 300_000), // 5 min in future
    totalAmountMinorUnits: 50_000, // ₹500.00
    currency: "INR",
    payments: [],
    ...overrides,
  };
}

class InMemoryCheckoutOrdersRepository implements CheckoutOrdersRepository {
  public bookings = new Map<string, BookingForCheckoutRecord>();
  public payments = new Map<string, PaymentRecord>();
  public onBeforeUpdateInitiated?: (paymentId: string) => Promise<void> | void;
  public failUpdateInitiatedWithDbError = false;

  async findAndLockBooking(bookingId: string): Promise<BookingForCheckoutRecord | null> {
    const booking = this.bookings.get(bookingId);
    if (!booking) return null;

    const paymentsForBooking = Array.from(this.payments.values())
      .filter((p) => p.bookingId === bookingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      ...booking,
      payments: paymentsForBooking,
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const payment: PaymentRecord = {
      id: input.id,
      bookingId: input.bookingId,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      amountMinorUnits: input.amountMinorUnits,
      currency: input.currency,
      status: "CREATED",
      errorCode: null,
      errorDescription: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  async updatePaymentInitiated(paymentId: string, orderId: string): Promise<number> {
    if (this.failUpdateInitiatedWithDbError) {
      throw new Error("Database connection dropped during Phase 3");
    }

    if (this.onBeforeUpdateInitiated) {
      await this.onBeforeUpdateInitiated(paymentId);
    }

    const payment = this.payments.get(paymentId);
    if (!payment || payment.status !== "CREATED") {
      return 0;
    }

    this.payments.set(paymentId, {
      ...payment,
      razorpayOrderId: orderId,
      status: "INITIATED",
      updatedAt: new Date(),
    });
    return 1;
  }

  async updatePaymentFailed(
    paymentId: string,
    errorCode: string,
    errorDescription?: string,
  ): Promise<number> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.status !== "CREATED") {
      return 0;
    }

    this.payments.set(paymentId, {
      ...payment,
      status: "FAILED",
      errorCode,
      errorDescription: errorDescription ?? null,
      updatedAt: new Date(),
    });
    return 1;
  }

  async updatePaymentUncertain(
    paymentId: string,
    errorCode: string,
    errorDescription?: string,
  ): Promise<number> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.status !== "CREATED") {
      return 0;
    }

    this.payments.set(paymentId, {
      ...payment,
      status: "INITIATED_UNCERTAIN",
      errorCode,
      errorDescription: errorDescription ?? null,
      updatedAt: new Date(),
    });
    return 1;
  }

  async findPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    return this.payments.get(paymentId) ?? null;
  }

  async correlateOrderId(paymentId: string, orderId: string): Promise<void> {
    const payment = this.payments.get(paymentId);
    if (payment) {
      this.payments.set(paymentId, {
        ...payment,
        razorpayOrderId: orderId,
        updatedAt: new Date(),
      });
    }
  }

  async runInTransaction<T>(fn: (repo: CheckoutOrdersRepository) => Promise<T>): Promise<T> {
    return await fn(this);
  }
}

function createFakeGateway(overrides: Partial<PaymentGatewayPort> = {}): PaymentGatewayPort {
  return {
    createOrder: vi.fn().mockImplementation((input: CreateOrderInput): Promise<ProviderOrder> => {
      return Promise.resolve({
        providerOrderId: "order_mock_1234567890",
        amount: input.amount,
        status: "created",
      });
    }),
    verifyCheckoutSignature: vi.fn().mockReturnValue(true),
    verifyWebhook: vi.fn(),
    fetchPayment: vi.fn(),
    ...overrides,
  };
}

function createFixture() {
  const repo = new InMemoryCheckoutOrdersRepository();
  const defaultBooking = createDefaultBooking();
  repo.bookings.set(BOOKING_ID, defaultBooking);

  const gateway = createFakeGateway();
  let currentTime = new Date(BASE_TIME);
  let idCounter = 1;

  const service = new CheckoutOrdersService({
    repository: repo,
    gateway,
    now: () => currentTime,
    randomId: () => `7a32e18b-2c93-4e42-998e-4a64860b21a${idCounter++}`,
  });

  return {
    repo,
    gateway,
    service,
    defaultBooking,
    advanceTime: (ms: number) => {
      currentTime = new Date(currentTime.getTime() + ms);
    },
    setTime: (date: Date) => {
      currentTime = date;
    },
  };
}

describe("CheckoutOrdersService — Decoupled Checkout & Razorpay Order Creation (LA-12 Sprint 3)", () => {
  describe("Happy Path Order Creation (Scenario A)", () => {
    it("creates a Razorpay order, persists INITIATED status, and returns 201 Created", async () => {
      const { service, repo, gateway } = createFixture();

      const result = await service.createCheckoutOrder({
        bookingId: BOOKING_ID,
        userId: USER_ID,
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.bookingId).toBe(BOOKING_ID);
      expect(result.body.gatewayOrderId).toBe("order_mock_1234567890");
      expect(result.body.orderId).toBe("order_mock_1234567890");
      expect(result.body.amount).toBe(50_000);
      expect(result.body.currency).toBe("INR");
      expect(result.body.status).toBe("INITIATED");
      expect(result.body.receipt).toMatch(/^p_[0-9a-fA-F-]+$/);

      // Verify Razorpay gateway call
      expect(gateway.createOrder).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(gateway.createOrder).mock.calls[0]![0];
      expect(callArgs.amount).toEqual({ amountMinor: 50_000, currency: "INR" });
      expect(callArgs.referenceId).toBe(result.body.receipt);
      expect(callArgs.referenceId.length).toBeLessThanOrEqual(38);
      expect(callArgs.notes).toEqual({
        paymentId: result.body.paymentId,
        bookingId: BOOKING_ID,
      });

      // Verify persistence in DB
      const persisted = await repo.findPaymentById(result.body.paymentId);
      expect(persisted).not.toBeNull();
      expect(persisted?.status).toBe("INITIATED");
      expect(persisted?.razorpayOrderId).toBe("order_mock_1234567890");
      expect(persisted?.amountMinorUnits).toBe(50_000);
      expect(persisted?.currency).toBe("INR");
    });
  });

  describe("Validation & Invariants", () => {
    it("rejects non-existent booking with NotFoundError", async () => {
      const { service } = createFixture();

      await expect(
        service.createCheckoutOrder({
          bookingId: "00000000-0000-0000-0000-000000000000",
          userId: USER_ID,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects booking belonging to different user with NotFoundError (anti-enumeration)", async () => {
      const { service } = createFixture();

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: "attacker_user_999",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects booking not in HELD status with ConflictError", async () => {
      const { service, repo, defaultBooking } = createFixture();
      repo.bookings.set(BOOKING_ID, { ...defaultBooking, status: "DRAFT" });

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects booking with expired hold (heldUntil <= now) with ConflictError", async () => {
      const { service, advanceTime } = createFixture();
      // Advance 5 minutes + 1 second
      advanceTime(300_001);

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects booking with invalid totalAmountMinorUnits (non-integer or <= 0)", async () => {
      const { service, repo, defaultBooking } = createFixture();
      repo.bookings.set(BOOKING_ID, { ...defaultBooking, totalAmountMinorUnits: 0 });

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects non-INR currency with ValidationError", async () => {
      const { service, repo, defaultBooking } = createFixture();
      repo.bookings.set(BOOKING_ID, { ...defaultBooking, currency: "USD" });

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Coherent Retry Policy & Order Reuse (Scenario B: QA-13)", () => {
    it("re-uses existing INITIATED order and returns 200 OK without creating duplicate gateway orders", async () => {
      const { service, repo, gateway } = createFixture();

      // Seed an existing INITIATED payment with order_existing_999
      const existingPaymentId = "payment-existing-1";
      repo.payments.set(existingPaymentId, {
        id: existingPaymentId,
        bookingId: BOOKING_ID,
        razorpayOrderId: "order_existing_999",
        razorpayPaymentId: null,
        amountMinorUnits: 50_000,
        currency: "INR",
        status: "INITIATED",
        errorCode: null,
        errorDescription: null,
        createdAt: new Date(BASE_TIME.getTime() - 10_000),
        updatedAt: new Date(BASE_TIME.getTime() - 10_000),
      });

      const result = await service.createCheckoutOrder({
        bookingId: BOOKING_ID,
        userId: USER_ID,
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.gatewayOrderId).toBe("order_existing_999");
      expect(result.body.orderId).toBe("order_existing_999");
      expect(result.body.paymentId).toBe(existingPaymentId);
      expect(result.body.status).toBe("INITIATED");

      // Verify ZERO new gateway calls
      expect(gateway.createOrder).not.toHaveBeenCalled();
    });

    it("reuses existing INITIATED order after customer card attempt failure (payment.failed)", async () => {
      const { service, repo, gateway } = createFixture();

      // Customer tried card payment, issuer declined, webhook recorded failure metadata,
      // but payment remains INITIATED because order is still payable.
      const paymentId = "payment-card-declined";
      repo.payments.set(paymentId, {
        id: paymentId,
        bookingId: BOOKING_ID,
        razorpayOrderId: "order_payable_card_fail",
        razorpayPaymentId: null,
        amountMinorUnits: 50_000,
        currency: "INR",
        status: "INITIATED",
        errorCode: "BAD_REQUEST_ERROR",
        errorDescription: "Card declined by issuing bank",
        createdAt: new Date(BASE_TIME.getTime() - 30_000),
        updatedAt: new Date(BASE_TIME.getTime() - 15_000),
      });

      const result = await service.createCheckoutOrder({
        bookingId: BOOKING_ID,
        userId: USER_ID,
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.gatewayOrderId).toBe("order_payable_card_fail");
      expect(result.body.orderId).toBe("order_payable_card_fail");
      expect(result.body.status).toBe("INITIATED");
      expect(gateway.createOrder).not.toHaveBeenCalled();
    });
  });

  describe("In-Flight & Unresolved Blocking (Scenario E & F: QA-01, QA-02, QA-03, QA-08)", () => {
    it("blocks concurrent request when another request is in CREATED status (QA-08)", async () => {
      const { service, repo, gateway } = createFixture();

      // In-flight payment in CREATED status
      repo.payments.set("payment-inflight", {
        id: "payment-inflight",
        bookingId: BOOKING_ID,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        amountMinorUnits: 50_000,
        currency: "INR",
        status: "CREATED",
        errorCode: null,
        errorDescription: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(OrderCreationInProgressError);

      expect(gateway.createOrder).not.toHaveBeenCalled();
    });

    it("safely blocks request when application crashed leaving CREATED record (QA-01, QA-02, QA-03)", async () => {
      const { service, repo, gateway, advanceTime } = createFixture();

      // Simulated crash after gateway success or in-flight crash
      repo.payments.set("payment-crashed", {
        id: "payment-crashed",
        bookingId: BOOKING_ID,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        amountMinorUnits: 50_000,
        currency: "INR",
        status: "CREATED",
        errorCode: null,
        errorDescription: null,
        createdAt: new Date(BASE_TIME.getTime() - 15_000),
        updatedAt: new Date(BASE_TIME.getTime() - 15_000),
      });

      // Retrying 15 seconds after crash
      advanceTime(15_000);
      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(OrderCreationInProgressError);

      // Retrying several minutes later (hold still valid)
      advanceTime(180_000);
      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(OrderCreationInProgressError);

      expect(gateway.createOrder).not.toHaveBeenCalled();
    });

    it("blocks request when prior attempt is in INITIATED_UNCERTAIN status (Scenario F)", async () => {
      const { service, repo, gateway } = createFixture();

      repo.payments.set("payment-uncertain", {
        id: "payment-uncertain",
        bookingId: BOOKING_ID,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        amountMinorUnits: 50_000,
        currency: "INR",
        status: "INITIATED_UNCERTAIN",
        errorCode: "GATEWAY_TIMEOUT",
        errorDescription: "Payment provider timed out.",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(OrderStatusUnresolvedError);

      expect(gateway.createOrder).not.toHaveBeenCalled();
    });
  });

  describe("Failure Classification & Error Handling (Scenario C & D: QA-04, QA-05, QA-07)", () => {
    it("handles definitive gateway rejection (HTTP 400/401): marks FAILED and throws PaymentGatewayError", async () => {
      const { service, repo, gateway } = createFixture();
      gateway.createOrder = vi
        .fn()
        .mockRejectedValue(new InternalError("Payment provider rejected the order request."));

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(PaymentGatewayError);

      const payments = Array.from(repo.payments.values());
      expect(payments).toHaveLength(1);
      expect(payments[0]!.status).toBe("FAILED");
      expect(payments[0]!.errorCode).toBe("BAD_REQUEST");
    });

    it("allows a new attempt after a definitive pre-order FAILED attempt while hold is active", async () => {
      const { service, repo } = createFixture();

      // Seed a failed pre-order attempt
      repo.payments.set("payment-failed-prev", {
        id: "payment-failed-prev",
        bookingId: BOOKING_ID,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        amountMinorUnits: 50_000,
        currency: "INR",
        status: "FAILED",
        errorCode: "BAD_REQUEST",
        errorDescription: "Amount exceeds limits",
        createdAt: new Date(BASE_TIME.getTime() - 20_000),
        updatedAt: new Date(BASE_TIME.getTime() - 20_000),
      });

      // Customer fixed credentials or retry allowed while hold active
      const result = await service.createCheckoutOrder({
        bookingId: BOOKING_ID,
        userId: USER_ID,
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.status).toBe("INITIATED");
    });

    it("handles gateway timeout (> 8000ms): marks INITIATED_UNCERTAIN and throws PaymentGatewayTimeoutError (QA-04)", async () => {
      const { service, repo, gateway } = createFixture();
      gateway.createOrder = vi
        .fn()
        .mockRejectedValue(new ProviderTimeoutError("Payment provider timed out."));

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(PaymentGatewayTimeoutError);

      const payments = Array.from(repo.payments.values());
      expect(payments).toHaveLength(1);
      expect(payments[0]!.status).toBe("INITIATED_UNCERTAIN");
      expect(payments[0]!.errorCode).toBe("GATEWAY_TIMEOUT");
    });

    it("handles network connection reset: marks INITIATED_UNCERTAIN and throws PaymentGatewayTimeoutError (QA-05)", async () => {
      const { service, repo, gateway } = createFixture();
      gateway.createOrder = vi
        .fn()
        .mockRejectedValue(new ProviderUnavailableError("Payment provider is unreachable."));

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(PaymentGatewayTimeoutError);

      const payments = Array.from(repo.payments.values());
      expect(payments).toHaveLength(1);
      expect(payments[0]!.status).toBe("INITIATED_UNCERTAIN");
      expect(payments[0]!.errorCode).toBe("GATEWAY_ERROR_AMBIGUOUS");
    });

    it("handles database failure in Phase 3 after gateway returns HTTP 200: record remains CREATED (QA-07)", async () => {
      const { service, repo } = createFixture();
      repo.failUpdateInitiatedWithDbError = true;

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(ProviderTimeoutError);

      const payments = Array.from(repo.payments.values());
      expect(payments).toHaveLength(1);
      // Because DB failed in Phase 3, record remains CREATED
      expect(payments[0]!.status).toBe("CREATED");
      expect(payments[0]!.razorpayOrderId).toBeNull();
    });
  });

  describe("Phase 3 Webhook Race Recovery (Scenario A2: QA-15A & QA-15B)", () => {
    it("preserves CAPTURED state and returns 201 Created when webhook beats Phase 3 for an eligible booking (QA-15A)", async () => {
      const { service, repo } = createFixture();

      // Hook: simulate webhook worker processing payment.captured during Phase 2
      repo.onBeforeUpdateInitiated = (paymentId: string) => {
        const payment = repo.payments.get(paymentId);
        if (payment) {
          repo.payments.set(paymentId, {
            ...payment,
            razorpayOrderId: "order_mock_1234567890",
            status: "CAPTURED",
            updatedAt: new Date(),
          });
        }
      };

      const result = await service.createCheckoutOrder({
        bookingId: BOOKING_ID,
        userId: USER_ID,
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.gatewayOrderId).toBe("order_mock_1234567890");
      expect(result.body.orderId).toBe("order_mock_1234567890");
      expect(result.body.status).toBe("CAPTURED");

      // Verify status was NOT overwritten back to INITIATED
      const persisted = await repo.findPaymentById(result.body.paymentId);
      expect(persisted?.status).toBe("CAPTURED");
      expect(persisted?.razorpayOrderId).toBe("order_mock_1234567890");
    });

    it("preserves AUTHORIZED state when webhook beats Phase 3 without clobbering", async () => {
      const { service, repo } = createFixture();

      repo.onBeforeUpdateInitiated = (paymentId: string) => {
        const payment = repo.payments.get(paymentId);
        if (payment) {
          repo.payments.set(paymentId, {
            ...payment,
            razorpayOrderId: "order_mock_1234567890",
            status: "AUTHORIZED",
            updatedAt: new Date(),
          });
        }
      };

      const result = await service.createCheckoutOrder({
        bookingId: BOOKING_ID,
        userId: USER_ID,
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.gatewayOrderId).toBe("order_mock_1234567890");
      expect(result.body.orderId).toBe("order_mock_1234567890");
      expect(result.body.status).toBe("AUTHORIZED");

      const persisted = await repo.findPaymentById(result.body.paymentId);
      expect(persisted?.status).toBe("AUTHORIZED");
    });

    it("quarantines conflicting gateway order ID association during Phase 3 recovery", async () => {
      const { service, repo } = createFixture();

      // Webhook or external actor somehow associated a DIFFERENT order ID
      repo.onBeforeUpdateInitiated = (paymentId: string) => {
        const payment = repo.payments.get(paymentId);
        if (payment) {
          repo.payments.set(paymentId, {
            ...payment,
            razorpayOrderId: "order_CONFLICTING_different_999",
            status: "CAPTURED",
            updatedAt: new Date(),
          });
        }
      };

      await expect(
        service.createCheckoutOrder({
          bookingId: BOOKING_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(OrderStatusUnresolvedError);

      const persisted = Array.from(repo.payments.values())[0];
      // Conflicting order was NOT overwritten
      expect(persisted?.razorpayOrderId).toBe("order_CONFLICTING_different_999");
    });
  });
});
