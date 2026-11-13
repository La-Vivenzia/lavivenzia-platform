import { afterAll, afterEach, describe, expect, it } from "vitest";

import { cleanupUsers, createTestUser, testDb, testEmail } from "./helpers";
import { NotFoundError } from "@/lib/errors";
import { AuthService } from "@/modules/auth/service";
import {
  createAuditRepository,
  createOtpRepository,
  createRateLimiter,
  createSessionRepository,
  createUserRepository,
} from "@/adapters/persistence/prisma/auth-repositories";
import { createTasteGenomeAccountRepository } from "@/adapters/persistence/prisma/taste-genome-repositories";
import { createUserProfileRepository } from "@/adapters/persistence/prisma/user-profile-repositories";
import { defaultGenome, toStoredGenome } from "@/modules/taste-genome/repository";
import { calibratedWeights } from "@/modules/taste-genome/service";
import type { CalibrationAnswers } from "@/modules/taste-genome/types";

/**
 * The Taste Genome shares `users.preferences` with the profile screen. These
 * prove each side's write merges its own keys and leaves the other's alone —
 * the one property a mocked repository cannot show.
 */

const answers: CalibrationAnswers = {
  dietary: "PURE_VEGETARIAN",
  beverages: ["ZERO_PROOF_TEMPERANCE"],
  seating: "CHEF_COUNTER",
  acoustic: "WHISPER_CONVERSATION",
};

const stored = toStoredGenome({
  ...defaultGenome("user:x", new Date("2026-11-13T19:30:00.000Z")),
  taste: { ...answers },
  trackAffinity: calibratedWeights(answers),
  calibrated: true,
});

const genomes = createTasteGenomeAccountRepository(testDb);
const profiles = createUserProfileRepository(testDb);

afterEach(cleanupUsers);
afterAll(() => testDb.$disconnect());

describe("taste genome account persistence", () => {
  it("saves into preferences without disturbing the profile's keys, and loads it back", async () => {
    const user = await createTestUser();
    await profiles.update(user.id, {
      preferences: { dietary: ["jain"], vibes: ["culinary_tastings"], clusters: [] },
    });

    await genomes.save(user.id, stored);

    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.preferences).toMatchObject({ dietary: ["jain"], vibes: ["culinary_tastings"] });
    expect(await genomes.load(user.id)).toEqual(stored);
  });

  it("keeps the genome when the profile screen saves its preferences", async () => {
    const user = await createTestUser();
    await genomes.save(user.id, stored);

    await profiles.update(user.id, {
      fullName: "Aarav Mehta",
      preferences: { dietary: ["vegan"], vibes: [], clusters: [] },
    });

    expect(await genomes.load(user.id)).toEqual(stored);
    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ fullName: "Aarav Mehta", preferences: { dietary: ["vegan"] } });
  });

  it("anchors and fills only a blank name", async () => {
    const blank = await createTestUser();
    const named = await createTestUser();
    await testDb.user.update({ where: { id: named.id }, data: { fullName: "Chosen Name" } });

    await genomes.anchor(blank.id, stored, "Aarav");
    await genomes.anchor(named.id, stored, "Someone Else");

    const rows = await testDb.user.findMany({
      where: { id: { in: [blank.id, named.id] } },
      select: { id: true, fullName: true },
    });
    expect(Object.fromEntries(rows.map((row) => [row.id, row.fullName]))).toEqual({
      [blank.id]: "Aarav",
      [named.id]: "Chosen Name",
    });
    expect(await genomes.load(blank.id)).toEqual(stored);
  });

  it("refuses to save to a soft-deleted account", async () => {
    const user = await createTestUser();
    await testDb.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    await expect(genomes.save(user.id, stored)).rejects.toBeInstanceOf(NotFoundError);
    expect(await genomes.load(user.id)).toBeNull();
  });
});

describe("traveller access code", () => {
  const delivered: string[] = [];
  const auth = new AuthService({
    users: createUserRepository(testDb),
    sessions: createSessionRepository(testDb),
    otps: createOtpRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    audit: createAuditRepository(testDb),
    now: () => new Date(),
    deliverOtp: async (email) => {
      delivered.push(email);
    },
  });
  const context = { ipAddress: "198.51.100.201", userAgent: "vitest", correlationId: null };

  it("creates an unverified passwordless traveller once, and codes every request", async () => {
    const email = testEmail("anchor");

    await auth.requestTravellerAccessOtp({ email, context });
    await auth.requestTravellerAccessOtp({ email, context });

    const users = await testDb.user.findMany({
      where: { email },
      select: { passwordHash: true, emailVerifiedAt: true, roles: { select: { role: true } } },
    });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ passwordHash: null, emailVerifiedAt: null });
    expect(users[0]!.roles.map((link) => link.role.key)).toEqual(["traveller"]);
    expect(delivered.filter((address) => address === email)).toHaveLength(2);
  });
});
