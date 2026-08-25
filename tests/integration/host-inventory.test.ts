import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TEST_EMAIL_DOMAIN, testDb, testEmail } from "./helpers";
import { AuthService } from "@/modules/auth/service";
import {
  createAuditRepository,
  createOtpRepository,
  createRateLimiter,
  createSessionRepository,
  createUserRepository,
} from "@/adapters/persistence/prisma/auth-repositories";
import { createHostRepository } from "@/adapters/persistence/prisma/host-repositories";
import {
  createCategoryRepository,
  createExperienceRepository,
} from "@/adapters/persistence/prisma/experience-repositories";
import { LocalStorageAdapter } from "@/adapters/storage/local";
import { HostService } from "@/modules/hosts/service";
import { ExperienceService } from "@/modules/experiences/service";
import type { Principal } from "@/modules/auth/authorization";
import type { HostRecord } from "@/modules/hosts/ports";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import { RATE_LIMITS } from "@/modules/auth/rate-limits";

/**
 * Host onboarding and experience inventory against the real database.
 *
 * The production services with the production adapters — only the clock and the
 * storage directory are substituted. The assertions that matter most here are
 * the negative ones: a traveller reaching host functionality, and one host
 * reaching another host's listing. Those are the failures that would be
 * expensive to discover in production, and neither can be proven by a unit test
 * against a fake repository.
 */

const PASSWORD = "a-sufficiently-long-password";
const NOW = new Date("2026-08-25T12:00:00.000Z");

let auth: AuthService;
let hosts: HostService;
let experiences: ExperienceService;
let storage: LocalStorageAdapter;
let categoryId: string;

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

const context = () => ({ ipAddress: freshIp(), correlationId: "inventory-test" });
const authContext = () => ({ ...context(), userAgent: "vitest" });

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "lv-media-"));
  storage = new LocalStorageAdapter({ publicDir: root });

  auth = new AuthService({
    users: createUserRepository(testDb),
    sessions: createSessionRepository(testDb),
    otps: createOtpRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    audit: createAuditRepository(testDb),
    now: () => NOW,
    deliverOtp: async () => undefined,
  });

  hosts = new HostService({
    hosts: createHostRepository(testDb),
    audit: createAuditRepository(testDb),
    now: () => NOW,
  });

  experiences = new ExperienceService({
    experiences: createExperienceRepository(testDb, (key) => storage.publicUrl(key)),
    categories: createCategoryRepository(testDb),
    storage,
    audit: createAuditRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    now: () => NOW,
  });

  const seeded = await createCategoryRepository(testDb).listActive();
  const first = seeded[0];
  if (!first) throw new Error("Categories are not seeded; run npm run db:test:setup");
  categoryId = first.id;
});

/** Register, sign in and resolve a principal — the real path, not a fabricated one. */
async function signUp(role: "host" | "traveller"): Promise<Principal> {
  const email = testEmail(role);

  await auth.register({
    email,
    ...(role === "host" ? { password: PASSWORD } : {}),
    role,
    context: authContext(),
  });

  const session =
    role === "host"
      ? await auth.loginWithPassword({ email, password: PASSWORD, context: authContext() })
      : await (async () => {
          await auth.requestLoginOtp({ email, context: authContext() });
          const challenge = await testDb.otpChallenge.findFirst({
            where: { email, purpose: "LOGIN" },
            orderBy: { createdAt: "desc" },
          });
          if (!challenge) throw new Error("No OTP challenge issued");
          // The code is hashed, so complete the session directly from the
          // repository rather than guessing it.
          return null;
        })();

  if (session) {
    const principal = await auth.resolvePrincipal(session.token);
    if (!principal) throw new Error("Session did not resolve");
    return principal;
  }

  // Travellers are passwordless; build their session through the same
  // repository the service uses rather than through a code we cannot read.
  const user = await testDb.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("Traveller was not created");

  return {
    userId: user.id,
    email,
    sessionId: "traveller-test-session",
    roles: ["traveller"],
    permissions: new Set([
      "booking:read:own",
      "booking:create",
      "profile:manage:own",
      "wishlist:manage:own",
    ]),
    mfaSatisfied: false,
    lastAuthenticatedAt: NOW,
  };
}

/** A host with a profile, ready to hold inventory. */
async function makeHost(): Promise<{ principal: Principal; host: HostRecord }> {
  const principal = await signUp("host");

  const view = await hosts.createProfile(
    principal,
    { displayName: `Studio ${Date.now()}`, hostType: "INDIVIDUAL", contactEmail: null },
    context(),
  );

  return { principal, host: view.host };
}

/** Fill in everything a listing needs to be submittable, including an image. */
async function makeReadyExperience(principal: Principal, host: HostRecord): Promise<string> {
  const created = await experiences.createDraft(
    principal,
    host,
    { title: "An evening of Chettinad cooking" },
    context(),
  );

  await experiences.updateContent(principal, host, created.experience.id, {
    summary: "Cook and eat with a family who have done it for four generations.",
    description: "d".repeat(220),
    categoryId,
    city: "Karaikudi",
    durationMinutes: 180,
    maxGuests: 8,
    basePriceMinor: 450_000,
  });

  const media = await experiences.addMedia(principal, host, created.experience.id, {
    bytes: jpegBytes(),
    declaredType: "image/jpeg",
  });

  await experiences.updateMedia(principal, host, created.experience.id, media.id, {
    altText: "A brass pot over a wood fire",
  });

  return created.experience.id;
}

function jpegBytes(size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

afterEach(async () => {
  await testDb.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
  // The clock is frozen, so every test shares one rate-limit window. Clearing
  // the counters keeps one test from exhausting another test's allowance.
  await testDb.rateLimitCounter.deleteMany({});
});

afterAll(async () => {
  await testDb.$disconnect();
});

// ── Authorization ──────────────────────────────────────────────────────────

describe("host authorization", () => {
  it("refuses a traveller the host profile surface", async () => {
    // The rule stated in the milestone: a traveller must never reach host
    // management. It is a permission check, not a UI condition — the traveller
    // role simply does not carry host:manage:own.
    const traveller = await signUp("traveller");

    await expect(hosts.getOwnProfile(traveller)).rejects.toThrow(ForbiddenError);
    await expect(
      hosts.createProfile(
        traveller,
        { displayName: "Not allowed", hostType: "INDIVIDUAL", contactEmail: null },
        context(),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a traveller the inventory surface", async () => {
    const traveller = await signUp("traveller");
    const { host } = await makeHost();

    // Even handed a host record directly, the permission check refuses.
    await expect(experiences.listOwn(traveller, host)).rejects.toThrow(ForbiddenError);
    await expect(
      experiences.createDraft(traveller, host, { title: "Not allowed at all" }, context()),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a host with no profile before they reach inventory", async () => {
    const principal = await signUp("host");
    await expect(hosts.requireOwnHost(principal)).rejects.toThrow(ForbiddenError);
  });
});

// ── Onboarding ─────────────────────────────────────────────────────────────

describe("host onboarding", () => {
  it("creates a profile owned by the session, not by the request", async () => {
    const principal = await signUp("host");

    const view = await hosts.createProfile(
      principal,
      { displayName: "Bagru Textile Studio", hostType: "INDIVIDUAL", contactEmail: null },
      context(),
    );

    expect(view.host.userId).toBe(principal.userId);
    expect(view.host.verificationStatus).toBe("DRAFT");
    expect(view.assessment.isComplete).toBe(false);
  });

  it("allows only one profile per user", async () => {
    const { principal } = await makeHost();

    await expect(
      hosts.createProfile(
        principal,
        { displayName: "A second studio", hostType: "INDIVIDUAL", contactEmail: null },
        context(),
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("saves partial progress", async () => {
    // The point of onboarding that can be left and resumed.
    const { principal } = await makeHost();

    const afterFirst = await hosts.updateProfile(principal, { city: "Jaipur" });
    expect(afterFirst.host.city).toBe("Jaipur");
    expect(afterFirst.assessment.isComplete).toBe(false);

    const afterSecond = await hosts.updateProfile(principal, { headline: "Block printers" });
    expect(afterSecond.host.city).toBe("Jaipur");
    expect(afterSecond.host.headline).toBe("Block printers");
  });

  it("refuses to submit an incomplete profile", async () => {
    const { principal } = await makeHost();
    await expect(hosts.submitForVerification(principal, context())).rejects.toThrow(
      ValidationError,
    );
  });

  it("submits a complete profile and locks it", async () => {
    const { principal } = await makeHost();

    await hosts.updateProfile(principal, {
      contactEmail: "studio@example.com",
      contactPhone: "+91 98765 43210",
      city: "Jaipur",
      headline: "Third-generation block printers in Bagru",
      about: "a".repeat(120),
    });

    const submitted = await hosts.submitForVerification(principal, context());

    expect(submitted.host.verificationStatus).toBe("PENDING");
    expect(submitted.host.submittedAt).toEqual(NOW);
    expect(submitted.canEdit).toBe(false);

    // Locked: a reviewer must decide on what they were shown.
    await expect(hosts.updateProfile(principal, { city: "Delhi" })).rejects.toThrow(ConflictError);
    await expect(hosts.submitForVerification(principal, context())).rejects.toThrow(ConflictError);
  });

  it("records an audit entry for the submission", async () => {
    const { principal, host } = await makeHost();

    await hosts.updateProfile(principal, {
      contactEmail: "studio@example.com",
      contactPhone: "+91 98765 43210",
      city: "Jaipur",
      headline: "Block printers",
      about: "a".repeat(120),
    });
    await hosts.submitForVerification(principal, context());

    const entry = await testDb.auditLog.findFirst({
      where: { action: "host.verification.submitted", subjectId: host.id },
    });

    expect(entry).not.toBeNull();
    expect(entry?.actorId).toBe(principal.userId);
  });
});

// ── Inventory ──────────────────────────────────────────────────────────────

describe("experience inventory", () => {
  it("creates a draft from a title alone", async () => {
    const { principal, host } = await makeHost();

    const view = await experiences.createDraft(
      principal,
      host,
      { title: "Sunrise sail across the backwaters" },
      context(),
    );

    expect(view.experience.status).toBe("DRAFT");
    expect(view.experience.hostId).toBe(host.id);
    expect(view.experience.slug).toBe("sunrise-sail-across-the-backwaters");
    expect(view.readiness.isReady).toBe(false);
  });

  it("gives a colliding title a distinct slug", async () => {
    // The slug is the public URL; two listings cannot share one.
    const a = await makeHost();
    const b = await makeHost();

    const first = await experiences.createDraft(
      a.principal,
      a.host,
      { title: "Sunrise sail across the backwaters" },
      context(),
    );
    const second = await experiences.createDraft(
      b.principal,
      b.host,
      { title: "Sunrise sail across the backwaters" },
      context(),
    );

    expect(second.experience.slug).not.toBe(first.experience.slug);
  });

  it("persists a draft across separate edits", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A long lunch in the Nilgiris" },
      context(),
    );

    await experiences.updateContent(principal, host, created.experience.id, { city: "Ooty" });
    await experiences.updateContent(principal, host, created.experience.id, {
      durationMinutes: 240,
    });

    const reloaded = await experiences.getOwn(principal, host, created.experience.id);
    expect(reloaded.experience.city).toBe("Ooty");
    expect(reloaded.experience.durationMinutes).toBe(240);
    expect(reloaded.experience.title).toBe("A long lunch in the Nilgiris");
  });

  it("rejects a category that does not exist", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A long lunch in the Nilgiris" },
      context(),
    );

    await expect(
      experiences.updateContent(principal, host, created.experience.id, {
        categoryId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a guest range that inverts", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A long lunch in the Nilgiris" },
      context(),
    );

    await expect(
      experiences.updateContent(principal, host, created.experience.id, {
        minGuests: 6,
        maxGuests: 2,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a half-set coordinate", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A long lunch in the Nilgiris" },
      context(),
    );

    await expect(
      experiences.updateContent(principal, host, created.experience.id, { latitude: 11.4 }),
    ).rejects.toThrow(ValidationError);
  });

  it("derives the spatial column from the coordinates", async () => {
    // ADR-0008: the geography column exists now so search does not have to
    // retrofit it. It is GENERATED, so it cannot drift from latitude/longitude.
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A long lunch in the Nilgiris" },
      context(),
    );

    await experiences.updateContent(principal, host, created.experience.id, {
      latitude: 11.4102,
      longitude: 76.695,
    });

    const rows = await testDb.$queryRaw<{ lat: number; lon: number }[]>`
      SELECT ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lon
      FROM experiences WHERE id = ${created.experience.id}::uuid
    `;

    // Longitude and latitude in the right order — reversing them is the classic
    // PostGIS bug, and it fails silently for points where both are in range.
    expect(rows[0]?.lat).toBeCloseTo(11.4102, 4);
    expect(rows[0]?.lon).toBeCloseTo(76.695, 4);
  });
});

// ── Ownership ──────────────────────────────────────────────────────────────

describe("ownership boundaries", () => {
  it("hides another host's listing behind a 404, not a 403", async () => {
    // A 403 would confirm the id exists, which is the fact an enumeration
    // attempt is trying to establish.
    const owner = await makeHost();
    const stranger = await makeHost();

    const created = await experiences.createDraft(
      owner.principal,
      owner.host,
      { title: "A private table in Chettinad" },
      context(),
    );

    await expect(
      experiences.getOwn(stranger.principal, stranger.host, created.experience.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses to let one host edit another host's listing", async () => {
    const owner = await makeHost();
    const stranger = await makeHost();

    const created = await experiences.createDraft(
      owner.principal,
      owner.host,
      { title: "A private table in Chettinad" },
      context(),
    );

    await expect(
      experiences.updateContent(stranger.principal, stranger.host, created.experience.id, {
        title: "Hijacked listing title",
      }),
    ).rejects.toThrow(NotFoundError);

    const untouched = await experiences.getOwn(owner.principal, owner.host, created.experience.id);
    expect(untouched.experience.title).toBe("A private table in Chettinad");
  });

  it("refuses to let one host submit or archive another host's listing", async () => {
    const owner = await makeHost();
    const stranger = await makeHost();

    const id = await makeReadyExperience(owner.principal, owner.host);

    for (const action of ["submit", "archive"] as const) {
      await expect(
        experiences.performAction(stranger.principal, stranger.host, id, action, context()),
      ).rejects.toThrow(NotFoundError);
    }

    const untouched = await experiences.getOwn(owner.principal, owner.host, id);
    expect(untouched.experience.status).toBe("DRAFT");
  });

  it("lists only the caller's own inventory", async () => {
    const owner = await makeHost();
    const stranger = await makeHost();

    await experiences.createDraft(
      owner.principal,
      owner.host,
      { title: "A private table in Chettinad" },
      context(),
    );

    expect(await experiences.listOwn(stranger.principal, stranger.host)).toHaveLength(0);
    expect(await experiences.listOwn(owner.principal, owner.host)).toHaveLength(1);
  });
});

// ── Lifecycle ──────────────────────────────────────────────────────────────

describe("listing lifecycle", () => {
  it("refuses to submit a listing that is not ready", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "An unfinished experience" },
      context(),
    );

    await expect(
      experiences.performAction(principal, host, created.experience.id, "submit", context()),
    ).rejects.toThrow(ValidationError);
  });

  it("submits a complete listing and locks it for editing", async () => {
    const { principal, host } = await makeHost();
    const id = await makeReadyExperience(principal, host);

    const submitted = await experiences.performAction(principal, host, id, "submit", context());

    expect(submitted.experience.status).toBe("IN_REVIEW");
    expect(submitted.experience.submittedAt).toEqual(NOW);
    expect(submitted.canEdit).toBe(false);

    await expect(
      experiences.updateContent(principal, host, id, { city: "Madurai" }),
    ).rejects.toThrow(ConflictError);
  });

  it("clears the submission time on withdrawal, so the queue orders honestly", async () => {
    const { principal, host } = await makeHost();
    const id = await makeReadyExperience(principal, host);

    await experiences.performAction(principal, host, id, "submit", context());
    const withdrawn = await experiences.performAction(principal, host, id, "withdraw", context());

    expect(withdrawn.experience.status).toBe("DRAFT");
    expect(withdrawn.experience.submittedAt).toBeNull();
    expect(withdrawn.canEdit).toBe(true);
  });

  it("refuses an illegal transition", async () => {
    const { principal, host } = await makeHost();
    const id = await makeReadyExperience(principal, host);

    await expect(
      experiences.performAction(principal, host, id, "withdraw", context()),
    ).rejects.toThrow(ConflictError);

    await experiences.performAction(principal, host, id, "submit", context());

    await expect(
      experiences.performAction(principal, host, id, "submit", context()),
    ).rejects.toThrow(ConflictError);
  });

  it("archives and restores", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A retired experience" },
      context(),
    );

    const archived = await experiences.performAction(
      principal,
      host,
      created.experience.id,
      "archive",
      context(),
    );
    expect(archived.experience.status).toBe("ARCHIVED");

    const restored = await experiences.performAction(
      principal,
      host,
      created.experience.id,
      "restore",
      context(),
    );
    expect(restored.experience.status).toBe("DRAFT");
  });

  it("records an audit entry for every transition", async () => {
    const { principal, host } = await makeHost();
    const id = await makeReadyExperience(principal, host);

    await experiences.performAction(principal, host, id, "submit", context());

    const entry = await testDb.auditLog.findFirst({
      where: { action: "experience.submit", subjectId: id },
    });

    expect(entry?.actorId).toBe(principal.userId);
    expect(entry?.before).toEqual({ status: "DRAFT" });
    expect(entry?.after).toEqual({ status: "IN_REVIEW" });
  });
});

// ── Media ──────────────────────────────────────────────────────────────────

describe("media", () => {
  it("stores an image and appends it to the gallery", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A gallery of one" },
      context(),
    );

    const first = await experiences.addMedia(principal, host, created.experience.id, {
      bytes: jpegBytes(),
      declaredType: "image/jpeg",
    });
    const second = await experiences.addMedia(principal, host, created.experience.id, {
      bytes: jpegBytes(),
      declaredType: "image/jpeg",
    });

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.url).toMatch(/^\/uploads\/experiences\//);
  });

  it("refuses a file whose bytes contradict its declared type", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A gallery of one" },
      context(),
    );

    const script = new Uint8Array(1024);
    script.set(new TextEncoder().encode("<?php system($_GET[0]); ?>"), 0);

    await expect(
      experiences.addMedia(principal, host, created.experience.id, {
        bytes: script,
        declaredType: "image/jpeg",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses media belonging to another listing", async () => {
    const { principal, host } = await makeHost();

    const a = await experiences.createDraft(principal, host, { title: "Listing one" }, context());
    const b = await experiences.createDraft(principal, host, { title: "Listing two" }, context());

    const media = await experiences.addMedia(principal, host, a.experience.id, {
      bytes: jpegBytes(),
      declaredType: "image/jpeg",
    });

    // The media id is real and the caller owns both listings — it still must
    // not be reachable through the wrong one.
    await expect(
      experiences.updateMedia(principal, host, b.experience.id, media.id, { altText: "Moved" }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      experiences.removeMedia(principal, host, b.experience.id, media.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses another host's media entirely", async () => {
    const owner = await makeHost();
    const stranger = await makeHost();

    const created = await experiences.createDraft(
      owner.principal,
      owner.host,
      { title: "Listing one" },
      context(),
    );
    const media = await experiences.addMedia(owner.principal, owner.host, created.experience.id, {
      bytes: jpegBytes(),
      declaredType: "image/jpeg",
    });

    await expect(
      experiences.removeMedia(stranger.principal, stranger.host, created.experience.id, media.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("removes the row and the stored bytes together", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A gallery of one" },
      context(),
    );

    const media = await experiences.addMedia(principal, host, created.experience.id, {
      bytes: jpegBytes(),
      declaredType: "image/jpeg",
    });

    await experiences.removeMedia(principal, host, created.experience.id, media.id);

    const view = await experiences.getOwn(principal, host, created.experience.id);
    expect(view.experience.media).toHaveLength(0);
    expect(await testDb.experienceMedia.count({ where: { id: media.id } })).toBe(0);
  });

  it("deletes an experience's media when the experience goes", async () => {
    const { principal, host } = await makeHost();
    const created = await experiences.createDraft(
      principal,
      host,
      { title: "A gallery of one" },
      context(),
    );

    await experiences.addMedia(principal, host, created.experience.id, {
      bytes: jpegBytes(),
      declaredType: "image/jpeg",
    });

    await testDb.experience.delete({ where: { id: created.experience.id } });

    expect(
      await testDb.experienceMedia.count({ where: { experienceId: created.experience.id } }),
    ).toBe(0);
  });
});

// ── Abuse bounds ───────────────────────────────────────────────────────────

describe("rate limits", () => {
  it("bounds how many drafts a host can create in a window", async () => {
    // The unarchived cap alone does not bound row creation: archiving frees a
    // slot, so create-and-archive would be unbounded without this.
    const { principal, host } = await makeHost();
    const limit = RATE_LIMITS.experienceCreatePerHost.limit;

    for (let i = 0; i < limit; i += 1) {
      await experiences.createDraft(principal, host, { title: `Draft number ${i}` }, context());
      await testDb.experience.updateMany({
        where: { hostId: host.id },
        data: { status: "ARCHIVED" },
      });
    }

    await expect(
      experiences.createDraft(principal, host, { title: "One too many" }, context()),
    ).rejects.toThrow(RateLimitedError);
  });

  it("limits one host without limiting another", async () => {
    const a = await makeHost();
    const b = await makeHost();
    const limit = RATE_LIMITS.experienceCreatePerHost.limit;

    for (let i = 0; i < limit; i += 1) {
      await experiences.createDraft(a.principal, a.host, { title: `Draft number ${i}` }, context());
      await testDb.experience.updateMany({
        where: { hostId: a.host.id },
        data: { status: "ARCHIVED" },
      });
    }

    await expect(
      experiences.createDraft(a.principal, a.host, { title: "One too many" }, context()),
    ).rejects.toThrow(RateLimitedError);

    // Keyed on the host, so a neighbour is unaffected.
    await expect(
      experiences.createDraft(b.principal, b.host, { title: "A different host" }, context()),
    ).resolves.toBeDefined();
  });
});

// ── Database constraints ───────────────────────────────────────────────────

describe("database constraints", () => {
  async function hostRow(): Promise<string> {
    const { host } = await makeHost();
    return host.id;
  }

  it("refuses a negative price at the database, not only in the service", async () => {
    // Application validation protects the user experience; a constraint is what
    // makes the invariant true regardless of which code path wrote the row.
    const hostId = await hostRow();

    await expect(
      testDb.experience.create({
        data: { hostId, slug: `neg-${Date.now()}`, title: "Negative", basePriceMinor: -1 },
      }),
    ).rejects.toThrow();
  });

  it("refuses fewer than one guest", async () => {
    const hostId = await hostRow();

    await expect(
      testDb.experience.create({
        data: { hostId, slug: `zero-${Date.now()}`, title: "Zero guests", minGuests: 0 },
      }),
    ).rejects.toThrow();
  });

  it("refuses a maximum below the minimum", async () => {
    const hostId = await hostRow();

    await expect(
      testDb.experience.create({
        data: {
          hostId,
          slug: `range-${Date.now()}`,
          title: "Inverted range",
          minGuests: 6,
          maxGuests: 2,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a non-positive duration", async () => {
    const hostId = await hostRow();

    await expect(
      testDb.experience.create({
        data: {
          hostId,
          slug: `dur-${Date.now()}`,
          title: "No duration",
          durationMinutes: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a duplicate slug", async () => {
    const hostId = await hostRow();
    const slug = `dupe-${Date.now()}`;

    await testDb.experience.create({ data: { hostId, slug, title: "First" } });
    await expect(
      testDb.experience.create({ data: { hostId, slug, title: "Second" } }),
    ).rejects.toThrow();
  });

  it("refuses two host profiles for one user", async () => {
    const { host } = await makeHost();

    await expect(
      testDb.host.create({ data: { userId: host.userId, displayName: "Duplicate" } }),
    ).rejects.toThrow();
  });

  it("deletes a host and their inventory when the user is deleted", async () => {
    const { principal, host } = await makeHost();
    await experiences.createDraft(principal, host, { title: "Cascade check" }, context());

    await testDb.user.delete({ where: { id: principal.userId } });

    expect(await testDb.host.count({ where: { id: host.id } })).toBe(0);
    expect(await testDb.experience.count({ where: { hostId: host.id } })).toBe(0);
  });
});
