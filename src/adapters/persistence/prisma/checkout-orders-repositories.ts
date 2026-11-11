import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  BookingForCheckoutRecord,
  CheckoutOrdersRepository,
  CheckoutPaymentStatus,
  CreatePaymentInput,
  PaymentRecord,
} from "@/modules/booking/checkout-orders-ports";

type DbClient = PrismaClient | Prisma.TransactionClient;

type BookingRow = {
  id: string;
  bookingReference: string;
  userId: string;
  status: string;
  heldUntil: Date | null;
  totalAmountMinorUnits: number;
  currency: string;
};

type PaymentRow = {
  id: string;
  bookingId: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  amountMinorUnits: number;
  currency: string;
  status: string;
  errorCode: string | null;
  errorDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPaymentRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    razorpayOrderId: row.razorpayOrderId,
    razorpayPaymentId: row.razorpayPaymentId,
    amountMinorUnits: row.amountMinorUnits,
    currency: row.currency,
    status: row.status as CheckoutPaymentStatus,
    errorCode: row.errorCode,
    errorDescription: row.errorDescription,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/**
 * Prisma adapter for CheckoutOrdersRepository (LA-12 Phase 2 Sprint 3).
 *
 * Implements pessimistic row-level locking on `bookings` (`SELECT ... FOR UPDATE`),
 * atomic Payment creation, and guarded conditional updates.
 */
export class PrismaCheckoutOrdersRepository implements CheckoutOrdersRepository {
  readonly #db: DbClient;

  constructor(db: DbClient) {
    this.#db = db;
  }

  /**
   * Acquires a pessimistic row-level lock on `bookings` (SELECT ... FOR UPDATE)
   * and loads all associated payments ordered by createdAt descending.
   */
  async findAndLockBooking(bookingId: string): Promise<BookingForCheckoutRecord | null> {
    const rows = await this.#db.$queryRaw<BookingRow[]>`
      SELECT
        id,
        booking_reference AS "bookingReference",
        user_id AS "userId",
        status,
        held_until AS "heldUntil",
        total_amount_minor_units AS "totalAmountMinorUnits",
        currency
      FROM bookings
      WHERE id = ${bookingId}::uuid
      FOR UPDATE
    `;

    if (!rows || rows.length === 0 || !rows[0]) {
      return null;
    }

    const row = rows[0];

    const payments = await this.#db.payment.findMany({
      where: {
        bookingId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      id: row.id,
      bookingReference: row.bookingReference,
      userId: row.userId,
      status: row.status,
      heldUntil: row.heldUntil ? new Date(row.heldUntil) : null,
      totalAmountMinorUnits: row.totalAmountMinorUnits,
      currency: row.currency,
      payments: payments.map(toPaymentRecord),
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const payment = await this.#db.payment.create({
      data: {
        id: input.id,
        bookingId: input.bookingId,
        amountMinorUnits: input.amountMinorUnits,
        currency: input.currency,
        status: "CREATED",
      },
    });

    return toPaymentRecord(payment);
  }

  async updatePaymentInitiated(paymentId: string, orderId: string): Promise<number> {
    const result = await this.#db.payment.updateMany({
      where: {
        id: paymentId,
        status: "CREATED",
      },
      data: {
        razorpayOrderId: orderId,
        status: "INITIATED",
      },
    });

    return result.count;
  }

  async updatePaymentFailed(
    paymentId: string,
    errorCode: string,
    errorDescription?: string,
  ): Promise<number> {
    const result = await this.#db.payment.updateMany({
      where: {
        id: paymentId,
        status: "CREATED",
      },
      data: {
        status: "FAILED",
        errorCode,
        errorDescription: errorDescription ?? null,
      },
    });

    return result.count;
  }

  async updatePaymentUncertain(
    paymentId: string,
    errorCode: string,
    errorDescription?: string,
  ): Promise<number> {
    const result = await this.#db.payment.updateMany({
      where: {
        id: paymentId,
        status: "CREATED",
      },
      data: {
        status: "INITIATED_UNCERTAIN",
        errorCode,
        errorDescription: errorDescription ?? null,
      },
    });

    return result.count;
  }

  async findPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    const payment = await this.#db.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

    return payment ? toPaymentRecord(payment) : null;
  }

  async correlateOrderId(paymentId: string, orderId: string): Promise<void> {
    await this.#db.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        razorpayOrderId: orderId,
      },
    });
  }

  async runInTransaction<T>(fn: (repo: CheckoutOrdersRepository) => Promise<T>): Promise<T> {
    if (
      "$transaction" in this.#db &&
      typeof (this.#db as PrismaClient).$transaction === "function"
    ) {
      return await (this.#db as PrismaClient).$transaction(async (tx) => {
        const txRepo = new PrismaCheckoutOrdersRepository(tx);
        return await fn(txRepo);
      });
    }

    return await fn(this);
  }
}
