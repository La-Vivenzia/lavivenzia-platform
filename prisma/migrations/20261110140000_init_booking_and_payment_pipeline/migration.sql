-- CreateEnum: booking_status
CREATE TYPE "booking_status" AS ENUM ('DRAFT', 'HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'EXPIRED_UNFULFILLED');

-- CreateEnum: payment_status
CREATE TYPE "payment_status" AS ENUM ('CREATED', 'INITIATED', 'INITIATED_UNCERTAIN', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'RECONCILED_ABANDONED');

-- CreateEnum: refund_status
CREATE TYPE "refund_status" AS ENUM ('NONE', 'PENDING', 'PROCESSING', 'PROCESSING_UNCERTAIN', 'PROCESSED', 'FAILED', 'MANUAL_RECONCILIATION_REQUIRED');

-- CreateEnum: voucher_status
CREATE TYPE "voucher_status" AS ENUM ('ISSUED', 'PROVISIONAL', 'REDEEMED', 'CONFLICT', 'REJECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum: attendance_status
CREATE TYPE "attendance_status" AS ENUM ('NOT_ARRIVED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum: payment_event_status
CREATE TYPE "payment_event_status" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE_IGNORED', 'FAILED');

-- CreateEnum: refund_task_status
CREATE TYPE "refund_task_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum: partner_account_status
CREATE TYPE "partner_account_status" AS ENUM ('INVITED', 'PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum: fee_absorption_policy
CREATE TYPE "fee_absorption_policy" AS ENUM ('PLATFORM_ABSORBS', 'PARTNER_DEDUCTED');

-- CreateEnum: payout_method
CREATE TYPE "payout_method" AS ENUM ('MANUAL_CSV', 'RAZORPAY_ROUTE');

-- CreateTable: bookings
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "booking_reference" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'DRAFT',
    "held_until" TIMESTAMPTZ(3),
    "total_amount_minor_units" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "customer_email" CITEXT,
    "customer_phone" TEXT,
    "special_requests" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: booking_items
CREATE TABLE "booking_items" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_minor_units" INTEGER NOT NULL,
    "total_price_minor_units" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "razorpay_signature" TEXT,
    "amount_minor_units" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "payment_status" NOT NULL DEFAULT 'CREATED',
    "refund_status" "refund_status" NOT NULL DEFAULT 'NONE',
    "refunded_amount_minor_units" INTEGER NOT NULL DEFAULT 0,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT,
    "bank" TEXT,
    "wallet" TEXT,
    "vpa" TEXT,
    "fee_minor_units" INTEGER,
    "tax_minor_units" INTEGER,
    "error_code" TEXT,
    "error_description" TEXT,
    "captured_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_events
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "order_id" TEXT,
    "payment_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "payment_event_status" NOT NULL DEFAULT 'RECEIVED',
    "error_message" TEXT,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: refund_tasks
CREATE TABLE "refund_tasks" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_minor_units" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reason" TEXT NOT NULL,
    "status" "refund_task_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ(3),
    "razorpay_refund_id" TEXT,
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refund_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: vouchers
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "key_id" TEXT NOT NULL,
    "qr_payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "voucher_status" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "redeemed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: attendances
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL DEFAULT 'NOT_ARRIVED',
    "guest_count" INTEGER NOT NULL,
    "attended_at" TIMESTAMPTZ(3),
    "no_show_marked_at" TIMESTAMPTZ(3),
    "no_show_marked_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable: redemption_logs
CREATE TABLE "redemption_logs" (
    "id" BIGSERIAL NOT NULL,
    "voucher_id" UUID NOT NULL,
    "scanner_user_id" UUID,
    "device_id" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "is_offline_sync" BOOLEAN NOT NULL DEFAULT false,
    "offline_scanned_at" TIMESTAMPTZ(3),
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result_status" "voucher_status" NOT NULL,
    "raw_payload" TEXT,
    "failure_reason" TEXT,

    CONSTRAINT "redemption_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: partner_accounts
CREATE TABLE "partner_accounts" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "crm_partner_id" TEXT,
    "commission_bps" INTEGER NOT NULL DEFAULT 1500,
    "fee_absorption_policy" "fee_absorption_policy" NOT NULL DEFAULT 'PLATFORM_ABSORBS',
    "payout_method" "payout_method" NOT NULL DEFAULT 'MANUAL_CSV',
    "status" "partner_account_status" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "bank_account_number" TEXT,
    "bank_ifsc_code" TEXT,
    "bank_beneficiary_name" TEXT,
    "door_pin_hash" TEXT,
    "door_pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "door_pin_locked_until" TIMESTAMPTZ(3),
    "invitation_token_hash" TEXT,
    "invitation_expires_at" TIMESTAMPTZ(3),
    "invitation_accepted_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_reference_key" ON "bookings"("booking_reference");
CREATE INDEX "bookings_user_id_status_idx" ON "bookings"("user_id", "status");
CREATE INDEX "bookings_slot_id_status_held_until_idx" ON "bookings"("slot_id", "status", "held_until");
CREATE INDEX "bookings_experience_id_status_idx" ON "bookings"("experience_id", "status");
CREATE INDEX "bookings_status_held_until_idx" ON "bookings"("status", "held_until");

-- CreateIndex
CREATE INDEX "booking_items_booking_id_idx" ON "booking_items"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_order_id_key" ON "payments"("razorpay_order_id");
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_refund_status_idx" ON "payments"("refund_status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_event_id_key" ON "payment_events"("event_id");
CREATE INDEX "payment_events_event_type_idx" ON "payment_events"("event_type");
CREATE INDEX "payment_events_status_idx" ON "payment_events"("status");
CREATE INDEX "payment_events_order_id_idx" ON "payment_events"("order_id");
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_tasks_razorpay_refund_id_key" ON "refund_tasks"("razorpay_refund_id");
CREATE INDEX "refund_tasks_payment_id_idx" ON "refund_tasks"("payment_id");
CREATE INDEX "refund_tasks_status_next_attempt_at_idx" ON "refund_tasks"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_booking_id_key" ON "vouchers"("booking_id");
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");
CREATE INDEX "vouchers_expires_at_idx" ON "vouchers"("expires_at");
CREATE INDEX "vouchers_key_id_idx" ON "vouchers"("key_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_booking_id_key" ON "attendances"("booking_id");
CREATE INDEX "attendances_status_idx" ON "attendances"("status");
CREATE INDEX "attendances_attended_at_idx" ON "attendances"("attended_at");

-- CreateIndex
CREATE INDEX "redemption_logs_voucher_id_synced_at_idx" ON "redemption_logs"("voucher_id", "synced_at");
CREATE INDEX "redemption_logs_synced_at_idx" ON "redemption_logs"("synced_at");
CREATE INDEX "redemption_logs_result_status_idx" ON "redemption_logs"("result_status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_accounts_host_id_key" ON "partner_accounts"("host_id");
CREATE UNIQUE INDEX "partner_accounts_crm_partner_id_key" ON "partner_accounts"("crm_partner_id");
CREATE UNIQUE INDEX "partner_accounts_invitation_token_hash_key" ON "partner_accounts"("invitation_token_hash");
CREATE INDEX "partner_accounts_status_idx" ON "partner_accounts"("status");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "experience_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_tasks" ADD CONSTRAINT "refund_tasks_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariants & CHECK Constraints (LA-12 Phase 2)
-- ---------------------------------------------------------------------------

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_guest_count_positive"
  CHECK ("guest_count" >= 1);

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_total_amount_not_negative"
  CHECK ("total_amount_minor_units" >= 0);

ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_quantity_positive"
  CHECK ("quantity" >= 1);

ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_prices_not_negative"
  CHECK ("unit_price_minor_units" >= 0 AND "total_price_minor_units" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_not_negative"
  CHECK ("amount_minor_units" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_refunded_within_amount"
  CHECK ("refunded_amount_minor_units" >= 0 AND "refunded_amount_minor_units" <= "amount_minor_units");

ALTER TABLE "refund_tasks"
  ADD CONSTRAINT "refund_tasks_amount_positive"
  CHECK ("amount_minor_units" >= 1);

ALTER TABLE "refund_tasks"
  ADD CONSTRAINT "refund_tasks_attempts_not_negative"
  CHECK ("attempts" >= 0);

ALTER TABLE "attendances"
  ADD CONSTRAINT "attendances_guest_count_positive"
  CHECK ("guest_count" >= 1);

ALTER TABLE "partner_accounts"
  ADD CONSTRAINT "partner_accounts_commission_bps_valid"
  CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000);

ALTER TABLE "partner_accounts"
  ADD CONSTRAINT "partner_accounts_door_pin_failed_attempts_not_negative"
  CHECK ("door_pin_failed_attempts" >= 0);
