/**
 * Hexagonal architecture ports and domain types for decoupled checkout orders (LA-12 Phase 2 Sprint 3).
 *
 * Keeps domain logic free of framework, ORM, and database drivers (ADR-0002).
 */

export type CheckoutPaymentStatus =
  | "CREATED"
  | "INITIATED"
  | "INITIATED_UNCERTAIN"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "REFUNDED"
  | "RECONCILED_ABANDONED";

export interface PaymentRecord {
  readonly id: string;
  readonly bookingId: string;
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
  readonly amountMinorUnits: number;
  readonly currency: string;
  readonly status: CheckoutPaymentStatus;
  readonly errorCode: string | null;
  readonly errorDescription: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BookingForCheckoutRecord {
  readonly id: string;
  readonly bookingReference: string;
  readonly userId: string;
  readonly status: string;
  readonly heldUntil: Date | null;
  readonly totalAmountMinorUnits: number;
  readonly currency: string;
  readonly payments: ReadonlyArray<PaymentRecord>;
}

export interface CreatePaymentInput {
  readonly id: string;
  readonly bookingId: string;
  readonly amountMinorUnits: number;
  readonly currency: string;
  readonly status: "CREATED";
}

export interface CheckoutOrdersRepository {
  /**
   * Acquire a pessimistic row-level lock on `bookings` (SELECT ... FOR UPDATE)
   * and load associated payments ordered by creation time descending.
   */
  findAndLockBooking(bookingId: string): Promise<BookingForCheckoutRecord | null>;

  /**
   * Atomically insert a Payment record in CREATED status before gateway dispatch.
   */
  createPayment(input: CreatePaymentInput): Promise<PaymentRecord>;

  /**
   * Guarded conditional update after gateway success:
   * UPDATE payments SET razorpay_order_id = :orderId, status = 'INITIATED'
   * WHERE id = :paymentId AND status = 'CREATED'
   * Returns count of affected rows (0 or 1).
   */
  updatePaymentInitiated(paymentId: string, orderId: string): Promise<number>;

  /**
   * Guarded conditional update after definitive gateway rejection:
   * UPDATE payments SET status = 'FAILED', error_code = :errorCode, error_description = :errorDescription
   * WHERE id = :paymentId AND status = 'CREATED'
   */
  updatePaymentFailed(
    paymentId: string,
    errorCode: string,
    errorDescription?: string,
  ): Promise<number>;

  /**
   * Guarded conditional update after timeout / ambiguous failure:
   * UPDATE payments SET status = 'INITIATED_UNCERTAIN', error_code = :errorCode, error_description = :errorDescription
   * WHERE id = :paymentId AND status = 'CREATED'
   */
  updatePaymentUncertain(
    paymentId: string,
    errorCode: string,
    errorDescription?: string,
  ): Promise<number>;

  /**
   * Authoritative read of a payment by ID (used for re-reading when guarded update affected 0 rows).
   */
  findPaymentById(paymentId: string): Promise<PaymentRecord | null>;

  /**
   * Correlates an orderId to a payment record if the record exists but razorpayOrderId is null.
   */
  correlateOrderId(paymentId: string, orderId: string): Promise<void>;

  /**
   * Execute operations within a transactional boundary.
   */
  runInTransaction<T>(fn: (repo: CheckoutOrdersRepository) => Promise<T>): Promise<T>;
}
