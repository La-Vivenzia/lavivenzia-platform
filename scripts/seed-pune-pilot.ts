process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import "../src/lib/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PILOT_EXPERIENCES, PILOT_HOST, PILOT_LANGUAGES } from "../src/data/pune-pilot";
import { validateSlot } from "../src/modules/availability/rules";

/**
 * Seed Curated Experiences for Amanora, Seasons Mall, Magarpatta, Hadapsar & Viman Nagar
 * (Pune Pilot), each with a rolling 30 days of bookable slots.
 *
 * Designed to provide rich, verified, real-world experiential spots for the
 * La Vivenzia AI Travel Copilot and Proximity Discovery engine (ST_DWithin).
 */

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function getOrCreatePilotHost(): Promise<string> {
  const hostUser = await prisma.user.upsert({
    where: { email: PILOT_HOST.email },
    create: {
      email: PILOT_HOST.email,
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
    },
  });

  const host = await prisma.host.upsert({
    where: { userId: hostUser.id },
    create: {
      userId: hostUser.id,
      displayName: PILOT_HOST.displayName,
      hostType: "COMPANY",
      headline: PILOT_HOST.headline,
      about: PILOT_HOST.about,
      city: PILOT_HOST.city,
      region: PILOT_HOST.region,
      country: PILOT_HOST.country,
      verificationStatus: "VERIFIED",
    },
    update: {
      verificationStatus: "VERIFIED",
    },
  });

  return host.id;
}

async function seedPilotExperiences(hostId: string): Promise<string[]> {
  const experienceIds: string[] = [];
  const categories = await prisma.category.findMany();
  const categoryMap = new Map(categories.map((c) => [c.key, c.id]));

  for (const exp of PILOT_EXPERIENCES) {
    const categoryId = categoryMap.get(exp.categoryKey) ?? null;

    const experience = await prisma.experience.upsert({
      where: { slug: exp.slug },
      create: {
        hostId,
        slug: exp.slug,
        title: exp.title,
        summary: exp.summary,
        description: exp.description,
        categoryId,
        status: "PUBLISHED",
        addressLine: exp.addressLine,
        city: exp.city,
        region: exp.region,
        country: "IN",
        postalCode: exp.postalCode,
        latitude: exp.latitude,
        longitude: exp.longitude,
        durationMinutes: exp.durationMinutes,
        minGuests: exp.minGuests,
        maxGuests: exp.maxGuests,
        languages: [...PILOT_LANGUAGES],
        basePriceMinor: exp.basePriceMinor,
        currency: "INR",
        pricingUnit: exp.pricingUnit,
        inclusions: exp.inclusions,
        exclusions: exp.exclusions,
        guestNotes: exp.guestNotes,
        publishedAt: new Date(),
      },
      update: {
        title: exp.title,
        summary: exp.summary,
        description: exp.description,
        categoryId,
        status: "PUBLISHED",
        addressLine: exp.addressLine,
        city: exp.city,
        region: exp.region,
        latitude: exp.latitude,
        longitude: exp.longitude,
        durationMinutes: exp.durationMinutes,
        minGuests: exp.minGuests,
        maxGuests: exp.maxGuests,
        basePriceMinor: exp.basePriceMinor,
        inclusions: exp.inclusions,
        exclusions: exp.exclusions,
        guestNotes: exp.guestNotes,
        publishedAt: new Date(),
      },
    });

    // Ensure cover media exists
    await prisma.experienceMedia.upsert({
      where: { storageKey: exp.coverImageKey },
      create: {
        experienceId: experience.id,
        storageKey: exp.coverImageKey,
        contentType: "image/jpeg",
        byteSize: 150000,
        position: 0,
        altText: exp.altText,
      },
      update: {
        altText: exp.altText,
      },
    });

    experienceIds.push(experience.id);
  }

  return experienceIds;
}

// ── Availability slots ──────────────────────────────────────────────────────

const SLOT_DAYS = 30;
const SLOT_CAPACITY = 12;
const SLOT_BOOKING_CUTOFF_MINUTES = 60;
/** India Standard Time is UTC+05:30 all year; there is no daylight saving. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Daily slots as IST wall-clock times. */
const DAILY_SLOTS = [
  { label: "Afternoon", start: { hour: 12, minute: 30 }, end: { hour: 14, minute: 30 } },
  { label: "Evening", start: { hour: 17, minute: 0 }, end: { hour: 19, minute: 0 } },
  { label: "Dinner", start: { hour: 20, minute: 0 }, end: { hour: 22, minute: 30 } },
] as const;

/** The instant at which the given IST wall-clock time occurs, `dayOffset` days after `istDate`. */
function istInstant(
  istDate: { year: number; month: number; day: number },
  dayOffset: number,
  time: { hour: number; minute: number },
): Date {
  // Date.UTC normalises an overflowing day, so month and year boundaries roll over.
  const asIfUtc = Date.UTC(
    istDate.year,
    istDate.month,
    istDate.day + dayOffset,
    time.hour,
    time.minute,
  );
  return new Date(asIfUtc - IST_OFFSET_MINUTES * 60_000);
}

/** Today's calendar date in IST, independent of the machine's own time zone. */
function istToday(now: Date): { year: number; month: number; day: number } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/**
 * Upsert three daily slots for Day 0 (today, IST) through Day 29.
 *
 * Idempotent: a re-run creates only slots that are missing and leaves existing
 * rows untouched, so seats already reserved and slots a host has closed are
 * never reset. Slots whose start has already passed today are skipped — the
 * availability rules refuse to create a slot in the past.
 */
async function seedSlotsForExperience(experienceId: string): Promise<number> {
  const now = new Date();
  const today = istToday(now);
  let ensured = 0;

  for (let dayOffset = 0; dayOffset < SLOT_DAYS; dayOffset += 1) {
    for (const slot of DAILY_SLOTS) {
      const startsAt = istInstant(today, dayOffset, slot.start);
      const endsAt = istInstant(today, dayOffset, slot.end);
      if (startsAt <= now) continue;

      validateSlot(
        {
          startsAt,
          endsAt,
          capacity: SLOT_CAPACITY,
          bookingCutoffMinutes: SLOT_BOOKING_CUTOFF_MINUTES,
        },
        now,
      );

      await prisma.experienceSlot.upsert({
        where: { experienceId_startsAt: { experienceId, startsAt } },
        create: {
          experienceId,
          startsAt,
          endsAt,
          capacity: SLOT_CAPACITY,
          reservedCount: 0,
          bookingCutoffMinutes: SLOT_BOOKING_CUTOFF_MINUTES,
          status: "OPEN",
        },
        update: {},
      });
      ensured += 1;
    }
  }

  return ensured;
}

async function main(): Promise<void> {
  console.log("Starting Pune Pilot Data Seed (Amanora, Seasons, Magarpatta, Viman Nagar)...");

  const hostId = await getOrCreatePilotHost();
  console.log(`✓ Pilot Host ready (Host ID: ${hostId})`);

  const experienceIds = await seedPilotExperiences(hostId);
  console.log(`✓ ${PILOT_EXPERIENCES.length} Pilot experiences seeded & published successfully!`);

  console.log(
    `Seeding 30-day availability slots for ${PILOT_EXPERIENCES.length} experiences (~${PILOT_EXPERIENCES.length * 90} slots)...`,
  );
  let slotCount = 0;
  for (const [index, experienceId] of experienceIds.entries()) {
    slotCount += await seedSlotsForExperience(experienceId);
    console.log(`  · ${index + 1}/${experienceIds.length} ${PILOT_EXPERIENCES[index]!.slug}`);
  }
  console.log(`✓ ${slotCount} availability slots ensured.`);
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
