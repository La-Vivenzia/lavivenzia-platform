-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "experience_slots" (
    "id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "booking_cutoff_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "experience_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experience_slots_experience_id_starts_at_idx" ON "experience_slots"("experience_id", "starts_at");

-- CreateIndex
CREATE INDEX "experience_slots_starts_at_idx" ON "experience_slots"("starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "experience_slots_experience_id_starts_at_key" ON "experience_slots"("experience_id", "starts_at");

-- AddForeignKey
ALTER TABLE "experience_slots" ADD CONSTRAINT "experience_slots_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Capacity invariants (FR-08)
--
-- These are CHECK constraints rather than application validation because the
-- booking path that will increment `reserved_count` does not exist yet. When
-- it is written, a bug in it must not be able to oversell a slot: the database
-- refuses the write regardless of what the application believes.
--
-- `reserved_count <= capacity` is the one that prevents double-booking. It
-- also means lowering `capacity` below what is already committed fails loudly
-- instead of silently putting a slot into an impossible state.
-- ---------------------------------------------------------------------------
ALTER TABLE "experience_slots"
  ADD CONSTRAINT "experience_slots_capacity_positive"
  CHECK ("capacity" >= 1);

ALTER TABLE "experience_slots"
  ADD CONSTRAINT "experience_slots_reserved_within_capacity"
  CHECK ("reserved_count" >= 0 AND "reserved_count" <= "capacity");

ALTER TABLE "experience_slots"
  ADD CONSTRAINT "experience_slots_ends_after_starts"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "experience_slots"
  ADD CONSTRAINT "experience_slots_cutoff_not_negative"
  CHECK ("booking_cutoff_minutes" >= 0);
