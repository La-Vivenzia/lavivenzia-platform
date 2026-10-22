import "../src/lib/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PILOT_EXPERIENCES, PILOT_HOST, PILOT_LANGUAGES } from "../src/data/pune-pilot";

/**
 * Seed Curated Experiences for Amanora, Seasons Mall, Magarpatta & Hadapsar (Pune Pilot).
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

async function seedPilotExperiences(hostId: string): Promise<void> {
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
  }
}

async function main(): Promise<void> {
  console.log("Starting Pune Pilot Data Seed (Amanora, Seasons, Magarpatta)...");

  const hostId = await getOrCreatePilotHost();
  console.log(`✓ Pilot Host ready (Host ID: ${hostId})`);

  await seedPilotExperiences(hostId);
  console.log(`✓ ${PILOT_EXPERIENCES.length} Pilot experiences seeded & published successfully!`);
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
