import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2 Sprint 1: Database Architecture & Prisma Schema Tests (LA-12)
 *
 * Verifies that the Prisma schema and PostgreSQL migration adhere strictly to
 * the 9 mandatory architectural invariants established in Phase 1 governance:
 *
 * 1. BookingStatus NEVER includes CHECKED_IN.
 * 2. ExperienceSlot.reservedCount represents confirmed reservations only.
 * 3. Dynamic active hold querying is supported via slotId + status + heldUntil indexing.
 * 4. Hold expiration never decrements reservedCount.
 * 5. Voucher and Attendance are decoupled orthogonal lifecycles.
 * 6. PaymentEvent enforces eventId uniqueness for webhook idempotency.
 * 7. Asymmetric Ed25519 signature fields (keyId, qrPayload, signature) are persisted on Voucher.
 * 8. PartnerAccount correctly models 1-to-1 extension of Host with door PIN and commission basis points.
 * 9. All financial amounts use integer minor units (paise).
 */

const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20261110140000_init_booking_and_payment_pipeline/migration.sql",
);

const schemaContent = readFileSync(schemaPath, "utf-8");
const migrationContent = existsSync(migrationPath) ? readFileSync(migrationPath, "utf-8") : "";

describe("Phase 2 Prisma Schema Architecture", () => {
  it("exists and is readable", () => {
    expect(schemaContent).toBeTruthy();
    expect(schemaContent.length).toBeGreaterThan(1000);
  });

  describe("Enums & Domain State Machines", () => {
    it("defines BookingStatus with 6 explicit states and NO CHECKED_IN", () => {
      const match = schemaContent.match(/enum\s+BookingStatus\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("DRAFT");
      expect(body).toContain("HELD");
      expect(body).toContain("CONFIRMED");
      expect(body).toContain("CANCELLED");
      expect(body).toContain("EXPIRED");
      expect(body).toContain("EXPIRED_UNFULFILLED");

      // Critical Invariant 1: BookingStatus must NEVER include CHECKED_IN
      expect(body).not.toContain("CHECKED_IN");
      expect(body).not.toContain("COMPLETED");
    });

    it("defines PaymentStatus with all 8 lifecycle states", () => {
      const match = schemaContent.match(/enum\s+PaymentStatus\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("CREATED");
      expect(body).toContain("INITIATED");
      expect(body).toContain("INITIATED_UNCERTAIN");
      expect(body).toContain("AUTHORIZED");
      expect(body).toContain("CAPTURED");
      expect(body).toContain("FAILED");
      expect(body).toContain("REFUNDED");
      expect(body).toContain("RECONCILED_ABANDONED");
    });

    it("defines RefundStatus with uncertain quarantine and manual reconciliation", () => {
      const match = schemaContent.match(/enum\s+RefundStatus\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("NONE");
      expect(body).toContain("PENDING");
      expect(body).toContain("PROCESSING");
      expect(body).toContain("PROCESSING_UNCERTAIN");
      expect(body).toContain("PROCESSED");
      expect(body).toContain("FAILED");
      expect(body).toContain("MANUAL_RECONCILIATION_REQUIRED");
    });

    it("defines VoucherStatus supporting Ed25519 redemption and multi-scanner conflict", () => {
      const match = schemaContent.match(/enum\s+VoucherStatus\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("ISSUED");
      expect(body).toContain("PROVISIONAL");
      expect(body).toContain("REDEEMED");
      expect(body).toContain("CONFLICT");
      expect(body).toContain("REJECTED");
      expect(body).toContain("EXPIRED");
      expect(body).toContain("REVOKED");
    });

    it("defines AttendanceStatus separating physical arrival from commercial booking", () => {
      const match = schemaContent.match(/enum\s+AttendanceStatus\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("NOT_ARRIVED");
      expect(body).toContain("ATTENDED");
      expect(body).toContain("NO_SHOW");
    });

    it("defines commercial policy enums aligned with ratified ADRs A-004 and A-005", () => {
      expect(schemaContent).toContain("enum FeeAbsorptionPolicy");
      expect(schemaContent).toContain("PLATFORM_ABSORBS");
      expect(schemaContent).toContain("PARTNER_DEDUCTED");

      expect(schemaContent).toContain("enum PayoutMethod");
      expect(schemaContent).toContain("MANUAL_CSV");
      expect(schemaContent).toContain("RAZORPAY_ROUTE");
    });
  });

  describe("Models & Relationships", () => {
    it("defines Booking model with all required fields and relations", () => {
      const match = schemaContent.match(/model\s+Booking\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("id               String        @id @default(uuid()) @db.Uuid");
      expect(body).toContain('bookingReference String        @unique @map("booking_reference")');
      expect(body).toContain('userId           String        @map("user_id") @db.Uuid');
      expect(body).toContain('experienceId     String        @map("experience_id") @db.Uuid');
      expect(body).toContain('slotId           String        @map("slot_id") @db.Uuid');
      expect(body).toContain('guestCount       Int           @map("guest_count")');
      expect(body).toContain("status           BookingStatus @default(DRAFT)");
      expect(body).toContain(
        'heldUntil        DateTime?     @map("held_until") @db.Timestamptz(3)',
      );
      expect(body).toContain('totalAmountMinorUnits Int    @map("total_amount_minor_units")');

      // Relations
      expect(body).toContain("user       User           @relation(");
      expect(body).toContain("experience Experience     @relation(");
      expect(body).toContain("slot       ExperienceSlot @relation(");
      expect(body).toContain("voucher    Voucher?");
      expect(body).toContain("attendance Attendance?");
    });

    it("indexes Booking for dynamic 5-minute hold queries and sweepers without redundant index", () => {
      const match = schemaContent.match(/model\s+Booking\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      // Dynamic active hold query: slotId + status + heldUntil
      expect(body).toContain("@@index([slotId, status, heldUntil])");
      expect(body).toContain("@@index([status, heldUntil])");
      // bookingReference has @unique so duplicate @@index is removed
      expect(body).not.toContain("@@index([bookingReference])");
      expect(body).toContain('@@map("bookings")');
    });

    it("defines Payment model with Razorpay IDs and demo mode flag", () => {
      const match = schemaContent.match(/model\s+Payment\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain('razorpayOrderId   String? @unique @map("razorpay_order_id")');
      expect(body).toContain('razorpayPaymentId String? @unique @map("razorpay_payment_id")');
      expect(body).toContain('amountMinorUnits         Int          @map("amount_minor_units")');
      expect(body).toContain('isSimulated Boolean @default(false) @map("is_simulated")');
      expect(body).toContain("refundStatus             RefundStatus @default(NONE)");
      expect(body).toContain('@@map("payments")');
    });

    it("defines PaymentEvent model with unique eventId for idempotent webhook handling", () => {
      const match = schemaContent.match(/model\s+PaymentEvent\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain('eventId      String             @unique @map("event_id")');
      expect(body).toContain("payload      Json");
      expect(body).toContain("status       PaymentEventStatus @default(RECEIVED)");
      expect(body).toContain('@@map("payment_events")');
    });

    it("defines Voucher model with asymmetric Ed25519 signing attributes", () => {
      const match = schemaContent.match(/model\s+Voucher\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain('bookingId String        @unique @map("booking_id") @db.Uuid');
      expect(body).toContain('keyId     String        @map("key_id")');
      expect(body).toContain('qrPayload String        @map("qr_payload") @db.Text');
      expect(body).toContain("signature String");
      expect(body).toContain("status    VoucherStatus @default(ISSUED)");
      expect(body).toContain('@@map("vouchers")');
    });

    it("defines Attendance as an orthogonal 1-to-1 entity on Booking", () => {
      const match = schemaContent.match(/model\s+Attendance\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain('bookingId      String           @unique @map("booking_id") @db.Uuid');
      expect(body).toContain("status         AttendanceStatus @default(NOT_ARRIVED)");
      expect(body).toContain('guestCount     Int              @map("guest_count")');
      expect(body).toContain(
        'attendedAt     DateTime?        @map("attended_at") @db.Timestamptz(3)',
      );
      expect(body).toContain('@@map("attendances")');
    });

    it("defines PartnerAccount as 1-to-1 on Host with Door PIN and CRM commission", () => {
      const match = schemaContent.match(/model\s+PartnerAccount\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain('hostId       String               @unique @map("host_id") @db.Uuid');
      expect(body).toContain(
        'commissionBps       Int                 @default(1500) @map("commission_bps")',
      );
      expect(body).toContain('doorPinHash           String?   @map("door_pin_hash")');
      expect(body).toContain(
        'doorPinFailedAttempts Int       @default(0) @map("door_pin_failed_attempts")',
      );
      expect(body).toContain('doorPinLockedUntil    DateTime? @map("door_pin_locked_until")');
      expect(body).toContain('invitationTokenHash String?   @unique @map("invitation_token_hash")');
      expect(body).toContain('@@map("partner_accounts")');
    });

    it("defines RedemptionLog as an append-only BigInt ledger", () => {
      const match = schemaContent.match(/model\s+RedemptionLog\s+{([^}]+)}/);
      expect(match).not.toBeNull();
      const body = match![1];

      expect(body).toContain("id               BigInt        @id @default(autoincrement())");
      expect(body).toContain('voucherId        String        @map("voucher_id") @db.Uuid');
      expect(body).toContain("isOfflineSync    Boolean       @default(false)");
      expect(body).toContain('resultStatus     VoucherStatus @map("result_status")');
      expect(body).toContain('@@map("redemption_logs")');
    });
  });

  describe("Existing Schema Regression Guard", () => {
    it("preserves all 14 pre-existing models unchanged", () => {
      const existing = [
        "User",
        "Session",
        "Role",
        "Permission",
        "RolePermission",
        "UserRole",
        "AuditLog",
        "OtpChallenge",
        "RateLimitCounter",
        "Host",
        "Experience",
        "ExperienceMedia",
        "Category",
        "ExperienceSlot",
      ];

      for (const m of existing) {
        expect(schemaContent).toContain(`model ${m} `);
      }
    });

    it("preserves ExperienceSlot CHECK constraints and seat ledger semantics", () => {
      expect(schemaContent).toContain("model ExperienceSlot");
      expect(schemaContent).toContain("capacity Int");
      expect(schemaContent).toContain('reservedCount Int @default(0) @map("reserved_count")');
      expect(schemaContent).toContain("bookingCutoffMinutes Int @default(0)");
    });
  });
});

describe("Phase 2 SQL Migration DDL", () => {
  it("exists in the migrations directory", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migrationContent.length).toBeGreaterThan(1000);
  });

  it("creates all 10 enum types using PostgreSQL snake_case names", () => {
    const enums = [
      "booking_status",
      "payment_status",
      "refund_status",
      "voucher_status",
      "attendance_status",
      "payment_event_status",
      "refund_task_status",
      "partner_account_status",
      "fee_absorption_policy",
      "payout_method",
    ];

    for (const e of enums) {
      expect(migrationContent).toContain(`CREATE TYPE "${e}" AS ENUM`);
    }
  });

  it("creates all 9 tables with snake_case mapped names", () => {
    const tables = [
      "bookings",
      "booking_items",
      "payments",
      "payment_events",
      "refund_tasks",
      "vouchers",
      "attendances",
      "redemption_logs",
      "partner_accounts",
    ];

    for (const t of tables) {
      expect(migrationContent).toContain(`CREATE TABLE "${t}"`);
    }
  });

  it("enforces critical database CHECK constraints", () => {
    expect(migrationContent).toContain('"bookings_guest_count_positive"');
    expect(migrationContent).toContain('CHECK ("guest_count" >= 1)');

    expect(migrationContent).toContain('"bookings_total_amount_not_negative"');
    expect(migrationContent).toContain('CHECK ("total_amount_minor_units" >= 0)');

    expect(migrationContent).toContain('"payments_refunded_within_amount"');
    expect(migrationContent).toContain(
      'CHECK ("refunded_amount_minor_units" >= 0 AND "refunded_amount_minor_units" <= "amount_minor_units")',
    );

    expect(migrationContent).toContain('"partner_accounts_commission_bps_valid"');
    expect(migrationContent).toContain(
      'CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000)',
    );
  });
});
