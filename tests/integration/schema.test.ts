import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanupUsers, createTestUser, testDb, testEmail } from "./helpers";

/**
 * Schema behaviour that only a real database can prove.
 *
 * Unit tests cover the domain logic; these cover the guarantees the *database*
 * is responsible for — cascades, constraints, defaults and column semantics.
 * Getting any of these wrong is silent in application code and only surfaces as
 * corrupt data much later.
 */

afterEach(async () => {
  await cleanupUsers();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("Prisma connectivity", () => {
  it("connects and executes a query", async () => {
    const result = await testDb.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0]?.ok).toBe(1);
  });
});

describe("users", () => {
  it("treats email as case-insensitive for uniqueness", async () => {
    // citext, not a lowercasing convention in application code. If this ever
    // regresses, two accounts can exist for the same human.
    const email = testEmail("CaseTest").toUpperCase();
    await createTestUser(email);

    await expect(createTestUser(email.toLowerCase())).rejects.toThrow();
  });

  it("finds a user regardless of the case queried", async () => {
    const email = testEmail("Lookup");
    await createTestUser(email);

    const found = await testDb.user.findUnique({ where: { email: email.toUpperCase() } });
    expect(found).not.toBeNull();
  });

  it("defaults status to ACTIVE and stamps timestamps", async () => {
    const user = await testDb.user.findUniqueOrThrow({
      where: { id: (await createTestUser()).id },
    });

    expect(user.status).toBe("ACTIVE");
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(user.deletedAt).toBeNull();
    expect(user.passwordHash).toBeNull();
  });

  it("rejects a duplicate email outright", async () => {
    const email = testEmail("dupe");
    await createTestUser(email);
    await expect(createTestUser(email)).rejects.toThrow();
  });
});

describe("sessions", () => {
  it("cascades deletion from the owning user", async () => {
    const user = await createTestUser();
    await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: `hash-${user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await testDb.user.delete({ where: { id: user.id } });

    const remaining = await testDb.session.count({ where: { userId: user.id } });
    expect(remaining).toBe(0);
  });

  it("enforces uniqueness of the token hash", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const shared = `collision-${Date.now()}`;

    await testDb.session.create({
      data: { userId: a.id, tokenHash: shared, expiresAt: new Date(Date.now() + 60_000) },
    });

    await expect(
      testDb.session.create({
        data: { userId: b.id, tokenHash: shared, expiresAt: new Date(Date.now() + 60_000) },
      }),
    ).rejects.toThrow();
  });

  it("refuses a session for a user that does not exist", async () => {
    await expect(
      testDb.session.create({
        data: {
          userId: "00000000-0000-0000-0000-000000000000",
          tokenHash: `orphan-${Date.now()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("preserves timezone-aware timestamps across a round trip", async () => {
    const user = await createTestUser();
    const expiresAt = new Date("2027-03-01T09:30:00.000Z");

    const created = await testDb.session.create({
      data: { userId: user.id, tokenHash: `tz-${user.id}`, expiresAt },
    });

    expect(created.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });
});

describe("user_roles", () => {
  it("cascades from the user but leaves the role intact", async () => {
    const user = await createTestUser();
    const role = await testDb.role.findUniqueOrThrow({ where: { key: "traveller" } });

    await testDb.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await testDb.user.delete({ where: { id: user.id } });

    expect(await testDb.userRole.count({ where: { userId: user.id } })).toBe(0);
    // The role is shared reference data — deleting a user must never remove it.
    expect(await testDb.role.findUnique({ where: { id: role.id } })).not.toBeNull();
  });

  it("prevents granting the same role twice", async () => {
    const user = await createTestUser();
    const role = await testDb.role.findUniqueOrThrow({ where: { key: "host" } });

    await testDb.userRole.create({ data: { userId: user.id, roleId: role.id } });

    await expect(
      testDb.userRole.create({ data: { userId: user.id, roleId: role.id } }),
    ).rejects.toThrow();
  });
});

describe("audit_logs", () => {
  it("keeps the record when the actor is deleted, nulling the reference", async () => {
    // The central guarantee of an audit trail: deleting the user who performed
    // an action must not erase the evidence that it happened.
    const user = await createTestUser();

    const entry = await testDb.auditLog.create({
      data: {
        actorId: user.id,
        action: "role.granted",
        subjectType: "user",
        subjectId: user.id,
      },
    });

    await testDb.user.delete({ where: { id: user.id } });

    const after = await testDb.auditLog.findUnique({ where: { id: entry.id } });
    expect(after).not.toBeNull();
    expect(after?.actorId).toBeNull();
    expect(after?.action).toBe("role.granted");

    await testDb.auditLog.delete({ where: { id: entry.id } });
  });

  it("accepts a system-initiated entry with no actor", async () => {
    const entry = await testDb.auditLog.create({
      data: { action: "job.reconciliation", subjectType: "system" },
    });

    expect(entry.actorId).toBeNull();
    expect(entry.occurredAt).toBeInstanceOf(Date);

    await testDb.auditLog.delete({ where: { id: entry.id } });
  });

  it("stores before/after snapshots as JSON", async () => {
    const entry = await testDb.auditLog.create({
      data: {
        action: "user.suspended",
        subjectType: "user",
        before: { status: "ACTIVE" },
        after: { status: "SUSPENDED" },
      },
    });

    const read = await testDb.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(read.before).toEqual({ status: "ACTIVE" });
    expect(read.after).toEqual({ status: "SUSPENDED" });

    await testDb.auditLog.delete({ where: { id: entry.id } });
  });
});
