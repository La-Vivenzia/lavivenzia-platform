-- CreateEnum
CREATE TYPE "host_type" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "host_verification_status" AS ENUM ('DRAFT', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "experience_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pricing_unit" AS ENUM ('PER_PERSON', 'PER_GROUP');

-- CreateTable
CREATE TABLE "hosts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "host_type" "host_type" NOT NULL DEFAULT 'INDIVIDUAL',
    "contact_email" CITEXT,
    "contact_phone" TEXT,
    "website_url" TEXT,
    "headline" TEXT,
    "about" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "verification_status" "host_verification_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "category_id" UUID,
    "status" "experience_status" NOT NULL DEFAULT 'DRAFT',
    "address_line" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "postal_code" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "geo" geography(Point, 4326),
    "duration_minutes" INTEGER,
    "min_guests" INTEGER NOT NULL DEFAULT 1,
    "max_guests" INTEGER,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "base_price_minor" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "pricing_unit" "pricing_unit" NOT NULL DEFAULT 'PER_PERSON',
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guest_notes" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "review_note" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_media" (
    "id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experience_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hosts_user_id_key" ON "hosts"("user_id");

-- CreateIndex
CREATE INDEX "hosts_verification_status_idx" ON "hosts"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "experiences_slug_key" ON "experiences"("slug");

-- CreateIndex
CREATE INDEX "experiences_host_id_status_updated_at_idx" ON "experiences"("host_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "experiences_status_submitted_at_idx" ON "experiences"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "experiences_category_id_idx" ON "experiences"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "experience_media_storage_key_key" ON "experience_media"("storage_key");

-- CreateIndex
CREATE INDEX "experience_media_experience_id_position_idx" ON "experience_media"("experience_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");

-- CreateIndex
CREATE INDEX "categories_is_active_position_idx" ON "categories"("is_active", "position");

-- AddForeignKey
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_media" ADD CONSTRAINT "experience_media_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Spatial column (FR-03, ADR-0008)
-- ---------------------------------------------------------------------------
--
-- Prisma emits `geo` as a plain column because it has no PostGIS type. It is
-- rewritten here as a GENERATED column so it cannot drift out of step with the
-- latitude/longitude a host actually entered -- there is no code path that can
-- update one without the other.
--
-- Note the argument order: ST_MakePoint takes (longitude, latitude). Reversing
-- them is the classic PostGIS bug, and it fails silently for any point where
-- both values are individually in range.
ALTER TABLE "experiences" DROP COLUMN "geo";

ALTER TABLE "experiences"
    ADD COLUMN "geo" geography(Point, 4326)
    GENERATED ALWAYS AS (
        CASE
            WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
        END
    ) STORED;

-- GiST is the index type PostGIS distance and viewport queries can actually
-- use; a B-tree on a geography column is inert.
CREATE INDEX "experiences_geo_idx" ON "experiences" USING GIST ("geo");

-- ---------------------------------------------------------------------------
-- Data integrity
-- ---------------------------------------------------------------------------
--
-- These duplicate validation that also exists in the domain layer, deliberately.
-- Application validation protects the user experience; a database constraint is
-- what makes the invariant true regardless of which code path, migration or
-- console session wrote the row.

ALTER TABLE "experiences"
    ADD CONSTRAINT "experiences_min_guests_check" CHECK ("min_guests" >= 1);

ALTER TABLE "experiences"
    ADD CONSTRAINT "experiences_guest_range_check"
    CHECK ("max_guests" IS NULL OR "max_guests" >= "min_guests");

ALTER TABLE "experiences"
    ADD CONSTRAINT "experiences_duration_check"
    CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0);

-- Non-negative, not positive: a free experience is a legitimate listing, a
-- negative price is a defect. No fee, tax or commission is represented here.
ALTER TABLE "experiences"
    ADD CONSTRAINT "experiences_base_price_check"
    CHECK ("base_price_minor" IS NULL OR "base_price_minor" >= 0);

-- A half-set coordinate is worse than none: it looks like a location and maps
-- to nowhere.
ALTER TABLE "experiences"
    ADD CONSTRAINT "experiences_coordinates_check"
    CHECK (
        ("latitude" IS NULL AND "longitude" IS NULL)
        OR (
            "latitude" IS NOT NULL AND "longitude" IS NOT NULL
            AND "latitude" BETWEEN -90 AND 90
            AND "longitude" BETWEEN -180 AND 180
        )
    );

ALTER TABLE "experience_media"
    ADD CONSTRAINT "experience_media_byte_size_check" CHECK ("byte_size" > 0);

ALTER TABLE "experience_media"
    ADD CONSTRAINT "experience_media_position_check" CHECK ("position" >= 0);
