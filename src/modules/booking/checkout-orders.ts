import { randomUUID } from "node:crypto";
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
import type { PaymentGatewayPort, ProviderOrder } from "@/ports/payments";
import type {
  BookingForCheckoutRecord,
  CheckoutOrdersRepository,
  PaymentRecord,
} from "./checkout-orders-ports";

export interface CheckoutOrderResponsePayload {
  readonly bookingId: string;
  readonly paymentId: string;
  /** Razorpay gateway order identifier (e.g. "order_MNOP1234567890"). */
  readonly gatewayOrderId: string;
  /** Canonical alias for frontend consumers (e.g. openRazorpayCheckout). Identical to gatewayOrderId. */
  readonly orderId: string;
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
  readonly status: string;
  readonly keyId?: string;
}

export interface CheckoutOrderResult {
  readonly statusCode: 200 | 201;
  readonly body: CheckoutOrderResponsePayload;
}

export interface CreateCheckoutOrderInput {
  readonly bookingId: string;
  readonly userId: string;
}

export interface CheckoutOrdersLogger {
  error(obj: Record<string, unknown>, msg: string): void;
  warn?(obj: Record<string, unknown>, msg: string): void;
}

export interface CheckoutOrdersServiceDependencies {
  readonly repository: CheckoutOrdersRepository;
  readonly gateway: PaymentGatewayPort;
  readonly now?: () => Date;
  readonly randomId?: () => string;
  readonly logger?: CheckoutOrdersLogger;
  readonly keyId?: string;
}

type Phase1Result =
  | {
      readonly kind: "REPLAY";
      readonly booking: BookingForCheckoutRecord;
      readonly payment: PaymentRecord;
    }
  | {
      readonly kind: "CREATED";
      readonly booking: BookingForCheckoutRecord;
      readonly payment: PaymentRecord;
    };

/**
 * CheckoutOrdersService (LA-12 Phase 2 Sprint 3).
 *
 * Implements decoupled checkout order initiation with attempt-level gateway correlation,
 * two-phase short database transaction boundaries, coherent order reuse, and fast-webhook race recovery.
 *
 * CRITICAL INVARIANTS:
 * 1. Database locks are NEVER held across the remote Razorpay network call.
 * 2. Phase 1 performs short pre-lock & validation, inserts Payment in CREATED status, and commits (< 10ms).
 * 3. Phase 2 calls Razorpay createOrder with receipt `p_<paymentId>` and notes { paymentId, bookingId }.
 * 4. Phase 3 executes guarded conditional write `WHERE id = :paymentId AND status = 'CREATED'`.
 * 5. If Phase 3 affects zero rows, it re-reads PostgreSQL and preserves AUTHORIZED/CAPTURED states without clobbering.
 * 6. Never creates a duplicate gateway order for an open, payable order.
 */
export class CheckoutOrdersService {
  readonly #repo: CheckoutOrdersRepository;
  readonly #gateway: PaymentGatewayPort;
  readonly #now: () => Date;
  readonly #randomId: () => string;
  readonly #logger: CheckoutOrdersLogger;
  readonly #keyId?: string;

  constructor(dependencies: CheckoutOrdersServiceDependencies) {
    this.#repo = dependencies.repository;
    this.#gateway = dependencies.gateway;
    this.#now = dependencies.now ?? (() => new Date());
    this.#randomId = dependencies.randomId ?? (() => randomUUID());
    this.#logger = dependencies.logger ?? {
      error: () => {},
      warn: () => {},
    };
    this.#keyId = dependencies.keyId;
  }

  /**
   * Canonical entry point: POST /api/v1/checkout/orders
   */
  async createCheckoutOrder(input: CreateCheckoutOrderInput): Promise<CheckoutOrderResult> {
    const logger = this.#logger;

    // ──────────────────────────────────────────────────────────────────────────
    // Phase 1: Database Pre-Lock & In-Flight Gate (< 10ms)
    // ──────────────────────────────────────────────────────────────────────────
    const phase1 = await this.#repo.runInTransaction<Phase1Result>(async (tx) => {
      const booking = await tx.findAndLockBooking(input.bookingId);
      if (!booking) {
        throw new NotFoundError("Booking not found.", { bookingId: input.bookingId });
      }

      // 1. Authenticated Ownership Validation
      // Reporting 404 Not Found rather than 403 Forbidden prevents ID enumeration,
      // conforming to the platform security standard (an id belonging to another user resolves to nothing).
      if (booking.userId !== input.userId) {
        throw new NotFoundError("Booking not found.", {
          bookingId: input.bookingId,
        });
      }

      // 2. Status Invariant: Booking must be HELD
      if (booking.status !== "HELD") {
        throw new ConflictError("Booking is not in HELD status.", {
          bookingId: input.bookingId,
          status: booking.status,
        });
      }

      // 3. Active Hold TTL Invariant: heldUntil > now()
      const now = this.#now();
      if (!booking.heldUntil || booking.heldUntil.getTime() <= now.getTime()) {
        throw new ConflictError("Booking hold has expired.", {
          code: "HOLD_EXPIRED",
          bookingId: input.bookingId,
        });
      }

      // 4. Authoritative Amount & Currency Validation
      if (
        !Number.isSafeInteger(booking.totalAmountMinorUnits) ||
        booking.totalAmountMinorUnits <= 0
      ) {
        throw new ValidationError(
          "Booking total amount must be a positive integer in minor units (paise).",
          {
            totalAmountMinorUnits: booking.totalAmountMinorUnits,
          },
        );
      }

      if (booking.currency !== "INR") {
        throw new ValidationError("Booking currency must be INR.", {
          currency: booking.currency,
        });
      }

      // 5. Existing Payments Evaluation & Coherent Retry Policy
      // Sort: latest payment first
      const existingPayments = [...booking.payments];

      // A. Existing INITIATED payment with valid razorpayOrderId -> Replay existing order (Scenario B)
      const initiatedPayment = existingPayments.find(
        (p) => p.status === "INITIATED" && Boolean(p.razorpayOrderId),
      );
      if (initiatedPayment) {
        return {
          kind: "REPLAY",
          booking,
          payment: initiatedPayment,
        };
      }

      // B. Existing captured or authorized payment -> Return latest persisted state
      const completedPayment = existingPayments.find(
        (p) => (p.status === "CAPTURED" || p.status === "AUTHORIZED") && Boolean(p.razorpayOrderId),
      );
      if (completedPayment) {
        return {
          kind: "REPLAY",
          booking,
          payment: completedPayment,
        };
      }

      // C. In-flight payment currently in CREATED status -> Block concurrent requests (Scenario E)
      const inFlightPayment = existingPayments.find((p) => p.status === "CREATED");
      if (inFlightPayment) {
        throw new OrderCreationInProgressError(
          "An order creation request is currently being processed for this reservation. Please wait.",
          { bookingId: booking.id, paymentId: inFlightPayment.id },
        );
      }

      // D. Unresolved payment in INITIATED_UNCERTAIN -> Block with 409 Conflict (Scenario F)
      const uncertainPayment = existingPayments.find((p) => p.status === "INITIATED_UNCERTAIN");
      if (uncertainPayment) {
        throw new OrderStatusUnresolvedError(
          "A previous checkout attempt has an unresolved status. Please wait for automated verification or contact support.",
          {
            bookingId: booking.id,
            paymentId: uncertainPayment.id,
            status: "INITIATED_UNCERTAIN",
          },
        );
      }

      // E. Definitive pre-order creation failure (FAILED where razorpayOrderId is null)
      // Since booking hold is active, allow creating a fresh attempt.

      // 6. Allocate Attempt-Level Record in CREATED status
      const paymentId = this.#randomId();
      const newPayment = await tx.createPayment({
        id: paymentId,
        bookingId: booking.id,
        amountMinorUnits: booking.totalAmountMinorUnits,
        currency: booking.currency,
        status: "CREATED",
      });

      return {
        kind: "CREATED",
        booking,
        payment: newPayment,
      };
    });

    // Handle Idempotent Replay (Scenario B)
    if (phase1.kind === "REPLAY") {
      const receipt = `p_${phase1.payment.id}`;
      const orderId = phase1.payment.razorpayOrderId!;
      return {
        statusCode: 200,
        body: {
          bookingId: phase1.booking.id,
          paymentId: phase1.payment.id,
          gatewayOrderId: orderId,
          orderId,
          amount: phase1.booking.totalAmountMinorUnits,
          currency: phase1.booking.currency,
          receipt,
          status: phase1.payment.status,
          ...(this.#keyId ? { keyId: this.#keyId } : {}),
        },
      };
    }

    const { booking, payment } = phase1;
    const receipt = `p_${payment.id}`;

    // ──────────────────────────────────────────────────────────────────────────
    // Phase 2: Remote Gateway Execution (200ms - 8,000ms)
    // Zero database locks or connections held.
    // ──────────────────────────────────────────────────────────────────────────
    let gatewayOrder: ProviderOrder;
    try {
      gatewayOrder = await this.#gateway.createOrder({
        amount: {
          amountMinor: booking.totalAmountMinorUnits,
          currency: booking.currency,
        },
        referenceId: receipt,
        notes: {
          paymentId: payment.id,
          bookingId: booking.id,
        },
      });
    } catch (caught) {
      // Failure Classification
      if (caught instanceof ProviderTimeoutError) {
        // Network timeout (> 8000ms) or AbortController triggered
        try {
          await this.#repo.updatePaymentUncertain(payment.id, "GATEWAY_TIMEOUT", caught.message);
        } catch (dbError) {
          logger.error(
            { paymentId: payment.id, err: dbError },
            "Operational warning: Failed to record INITIATED_UNCERTAIN on timeout; record remains CREATED.",
          );
        }
        throw new PaymentGatewayTimeoutError(
          "Payment provider timed out. Order outcome is uncertain. Verification in progress.",
          { paymentId: payment.id, status: "INITIATED_UNCERTAIN" },
        );
      }

      if (caught instanceof InternalError) {
        // RazorpayAdapter throws InternalError on HTTP 400 or 401 (definitive rejection)
        try {
          await this.#repo.updatePaymentFailed(payment.id, "BAD_REQUEST", caught.message);
        } catch (dbError) {
          logger.error(
            { paymentId: payment.id, err: dbError },
            "Operational warning: Failed to record FAILED status on definitive rejection.",
          );
        }
        throw new PaymentGatewayError(
          "Payment provider rejected order creation. Please try again.",
          {
            paymentId: payment.id,
          },
        );
      }

      if (caught instanceof ProviderUnavailableError) {
        // 5xx or connection reset
        try {
          await this.#repo.updatePaymentUncertain(
            payment.id,
            "GATEWAY_ERROR_AMBIGUOUS",
            caught.message,
          );
        } catch (dbError) {
          logger.error(
            { paymentId: payment.id, err: dbError },
            "Operational warning: Failed to record INITIATED_UNCERTAIN on unavailable; record remains CREATED.",
          );
        }
        throw new PaymentGatewayTimeoutError(
          "Payment provider timed out. Order outcome is uncertain. Verification in progress.",
          { paymentId: payment.id, status: "INITIATED_UNCERTAIN" },
        );
      }

      // Any other unexpected exception
      try {
        await this.#repo.updatePaymentUncertain(
          payment.id,
          "UNKNOWN_GATEWAY_ERROR",
          caught instanceof Error ? caught.message : String(caught),
        );
      } catch (dbError) {
        logger.error(
          { paymentId: payment.id, err: dbError },
          "Operational warning: Failed to record INITIATED_UNCERTAIN on unexpected error.",
        );
      }
      throw new PaymentGatewayTimeoutError(
        "Payment provider timed out. Order outcome is uncertain. Verification in progress.",
        { paymentId: payment.id, status: "INITIATED_UNCERTAIN" },
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Phase 3: Guarded Database Post-Update & Race Recovery (< 10ms)
    // ──────────────────────────────────────────────────────────────────────────
    let rowsAffected: number;
    try {
      rowsAffected = await this.#repo.updatePaymentInitiated(
        payment.id,
        gatewayOrder.providerOrderId,
      );
    } catch (dbError) {
      // Database failure after gateway success
      logger.error(
        {
          paymentId: payment.id,
          bookingId: booking.id,
          gatewayOrderId: gatewayOrder.providerOrderId,
          err: dbError,
        },
        "CRITICAL: Database failure committing Phase 3 after gateway order creation. Payment remains CREATED.",
      );
      throw new ProviderTimeoutError(
        "Database failure committing order initiation. Order created at gateway.",
        { paymentId: payment.id, gatewayOrderId: gatewayOrder.providerOrderId },
      );
    }

    // Happy Path: Exactly 1 row updated from CREATED to INITIATED
    if (rowsAffected === 1) {
      return {
        statusCode: 201,
        body: {
          bookingId: booking.id,
          paymentId: payment.id,
          gatewayOrderId: gatewayOrder.providerOrderId,
          orderId: gatewayOrder.providerOrderId,
          amount: booking.totalAmountMinorUnits,
          currency: booking.currency,
          receipt,
          status: "INITIATED",
          ...(this.#keyId ? { keyId: this.#keyId } : {}),
        },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Race Handling: rowsAffected === 0 (Fast Webhook Arrived Before Phase 3)
    // ──────────────────────────────────────────────────────────────────────────
    const reRead = await this.#repo.findPaymentById(payment.id);
    if (!reRead) {
      throw new InternalError("Payment record not found during Phase 3 recovery.", {
        paymentId: payment.id,
      });
    }

    // Case 1: Same gateway order associated by webhook worker
    if (reRead.razorpayOrderId === gatewayOrder.providerOrderId) {
      if (
        reRead.status === "AUTHORIZED" ||
        reRead.status === "CAPTURED" ||
        reRead.status === "REFUNDED"
      ) {
        // Fast webhook advanced the record. NEVER overwrite back to INITIATED!
        return {
          statusCode: 201,
          body: {
            bookingId: booking.id,
            paymentId: payment.id,
            gatewayOrderId: gatewayOrder.providerOrderId,
            orderId: gatewayOrder.providerOrderId,
            amount: booking.totalAmountMinorUnits,
            currency: booking.currency,
            receipt,
            status: reRead.status,
            ...(this.#keyId ? { keyId: this.#keyId } : {}),
          },
        };
      }

      if (reRead.status === "INITIATED") {
        return {
          statusCode: 201,
          body: {
            bookingId: booking.id,
            paymentId: payment.id,
            gatewayOrderId: gatewayOrder.providerOrderId,
            orderId: gatewayOrder.providerOrderId,
            amount: booking.totalAmountMinorUnits,
            currency: booking.currency,
            receipt,
            status: "INITIATED",
            ...(this.#keyId ? { keyId: this.#keyId } : {}),
          },
        };
      }
    }

    // Case 2: Conflicting gateway order ID associated
    if (
      reRead.razorpayOrderId !== null &&
      reRead.razorpayOrderId !== gatewayOrder.providerOrderId
    ) {
      logger.error(
        {
          paymentId: payment.id,
          storedOrderId: reRead.razorpayOrderId,
          gatewayOrderId: gatewayOrder.providerOrderId,
        },
        "CRITICAL ANOMALY: Conflicting gateway order ID associated with payment.",
      );
      throw new OrderStatusUnresolvedError(
        "A previous checkout attempt has an unresolved status. Please wait for automated verification or contact support.",
        { paymentId: payment.id, conflictingOrderId: reRead.razorpayOrderId },
      );
    }

    // Case 3: Record was marked failed or abandoned out-of-band while order exists at gateway
    if (reRead.status === "FAILED" || reRead.status === "RECONCILED_ABANDONED") {
      if (reRead.razorpayOrderId === null) {
        try {
          await this.#repo.correlateOrderId(payment.id, gatewayOrder.providerOrderId);
        } catch (correlateErr) {
          logger.error(
            { paymentId: payment.id, err: correlateErr },
            "Failed to correlate order ID.",
          );
        }
      }
      throw new OrderStatusUnresolvedError(
        "A previous checkout attempt has an unresolved status. Please wait for automated verification or contact support.",
        { paymentId: payment.id, status: reRead.status },
      );
    }

    // Fallback for unresolved state
    throw new OrderStatusUnresolvedError(
      "A previous checkout attempt has an unresolved status. Please wait for automated verification or contact support.",
      { paymentId: payment.id, status: reRead.status },
    );
  }
}
