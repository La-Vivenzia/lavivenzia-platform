import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_EMAIL_DOMAIN, testDb, testEmail } from "./helpers";
import { AuthService, type RequestContext } from "@/modules/auth/service";
import {
  createAuditRepository,
  createOtpRepository,
  createRateLimiter,
  createSessionRepository,
  createUserRepository,
} from "@/adapters/persistence/prisma/auth-repositories";
import { authorize } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { OTP_MAX_ATTEMPTS } from "@/modules/auth/otp";
import { generateTotpSecret } from "@/modules/auth/totp";
import {
  ConflictError,
  ForbiddenError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import { TOTP, Secret } from "otpauth";

/**
 * End-to-end authentication against the real database.
 *
 * Uses the production service with production adapters — only the clock and the
 * OTP transport are substituted, so what runs here is what runs in the app.
 */

const PASSWORD = "a-sufficiently-long-password";

/** Captures issued codes so tests can complete a flow without an email transport. */
const delivered: { email: string; code: string }[] = [];

let currentTime = new Date("2026-08-21T12:00:00.000Z");

function makeService(): AuthService {
  return new AuthService({
    users: createUserRepository(testDb),
    sessions: createSessionRepository(testDb),
    otps: createOtpRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    audit: createAuditRepository(testDb),
    now: () => currentTime,
    deliverOtp: async (email, code) => {
      delivered.push({ email, code });
    },
  });
}

let auth: AuthService;

function context(ip = "203.0.113.10"): RequestContext {
  return { ipAddress: ip, userAgent: "vitest", correlationId: null };
}

/** Unique IP per test, so one test's rate-limit usage cannot fail another. */
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

function lastCodeFor(email: string): string {
  const entry = [...delivered].reverse().find((d) => d.email.toLowerCase() === email.toLowerCase());
  if (!entry) throw new Error(`No code delivered for ${email}`);
  return entry.code;
}

beforeEach(() => {
  auth = makeService();
  delivered.length = 0;
  currentTime = new Date("2026-08-21T12:00:00.000Z");
});

afterEach(async () => {
  await testDb.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
  await testDb.otpChallenge.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
  await testDb.rateLimitCounter.deleteMany({});
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("registration", () => {
  it("creates a traveller with the traveller role and no password", async () => {
    const email = testEmail("traveller");
    const { userId } = await auth.register({ email, role: "traveller", context: context() });

    const user = await testDb.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.roles.map((r) => r.role.key)).toEqual(["traveller"]);
  });

  it("creates a host with an argon2id password hash", async () => {
    const email = testEmail("host");
    const { userId } = await auth.register({
      email,
      password: PASSWORD,
      role: "host",
      context: context(),
    });

    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    // The plaintext must never appear anywhere in the row.
    expect(JSON.stringify(user)).not.toContain(PASSWORD);
  });

  it("rejects a duplicate address", async () => {
    const email = testEmail("dupe");
    await auth.register({ email, role: "traveller", context: context() });

    await expect(auth.register({ email, role: "traveller", context: context() })).rejects.toThrow(
      ConflictError,
    );
  });

  it("treats a differently-cased duplicate as the same account", async () => {
    const email = testEmail("case");
    await auth.register({ email, role: "traveller", context: context() });

    await expect(
      auth.register({ email: email.toUpperCase(), role: "traveller", context: context() }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to self-assign a privileged role", async () => {
    // Straightforward privilege escalation if allowed.
    await expect(
      auth.register({ email: testEmail("esc"), role: "super_admin", context: context() }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      auth.register({ email: testEmail("esc2"), role: "finance", context: context() }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("requires a password for hosts and forbids one for travellers", async () => {
    await expect(
      auth.register({ email: testEmail("nopw"), role: "host", context: context() }),
    ).rejects.toThrow(ValidationError);

    await expect(
      auth.register({
        email: testEmail("pw"),
        role: "traveller",
        password: PASSWORD,
        context: context(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("writes an audit record", async () => {
    const email = testEmail("audit");
    const { userId } = await auth.register({ email, role: "traveller", context: context() });

    const entries = await testDb.auditLog.findMany({ where: { actorId: userId } });
    expect(entries.map((e) => e.action)).toContain("auth.registered");
  });
});

describe("traveller email OTP login", () => {
  it("completes the full request-then-verify flow", async () => {
    const email = testEmail("otp");
    await auth.register({ email, role: "traveller", context: context() });

    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    const session = await auth.verifyLoginOtp({
      email,
      code: lastCodeFor(email),
      context: context(freshIp()),
    });

    expect(session.token).toBeTruthy();
    expect(session.mfaRequired).toBe(false);

    const principal = await auth.resolvePrincipal(session.token);
    expect(principal?.userId).toBe(session.userId);
    expect(principal?.roles).toEqual(["traveller"]);
  });

  it("marks the email verified once a code is completed", async () => {
    const email = testEmail("verify");
    const { userId } = await auth.register({ email, role: "traveller", context: context() });

    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    await auth.verifyLoginOtp({ email, code: lastCodeFor(email), context: context(freshIp()) });

    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("does not reveal whether an address is registered", async () => {
    // Both must succeed identically — any difference is an enumeration oracle.
    await expect(
      auth.requestLoginOtp({ email: testEmail("ghost"), context: context(freshIp()) }),
    ).resolves.toBeUndefined();

    const known = testEmail("known");
    await auth.register({ email: known, role: "traveller", context: context() });
    await expect(
      auth.requestLoginOtp({ email: known, context: context(freshIp()) }),
    ).resolves.toBeUndefined();

    // ...but a code is only ever issued for the real account.
    expect(delivered.some((d) => d.email.toLowerCase() === known.toLowerCase())).toBe(true);
    expect(delivered).toHaveLength(1);
  });

  it("refuses to issue a code for a password account", async () => {
    // Otherwise every host and admin collapses to single-factor email possession.
    const email = testEmail("hostotp");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });

    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    expect(delivered).toHaveLength(0);
  });

  it("rejects a wrong code and burns the challenge after the attempt cap", async () => {
    const email = testEmail("brute");
    await auth.register({ email, role: "traveller", context: context() });
    await auth.requestLoginOtp({ email, context: context(freshIp()) });

    const realCode = lastCodeFor(email);
    const wrongCode = realCode === "000000" ? "111111" : "000000";

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      await expect(
        auth.verifyLoginOtp({ email, code: wrongCode, context: context(freshIp()) }),
      ).rejects.toThrow(UnauthenticatedError);
    }

    // Even the correct code must now fail — that is what bounds a brute force.
    await expect(
      auth.verifyLoginOtp({ email, code: realCode, context: context(freshIp()) }),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects an expired code", async () => {
    const email = testEmail("expired");
    await auth.register({ email, role: "traveller", context: context() });
    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    const code = lastCodeFor(email);

    currentTime = new Date(currentTime.getTime() + 11 * 60 * 1000);

    await expect(auth.verifyLoginOtp({ email, code, context: context(freshIp()) })).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("makes a code single-use", async () => {
    const email = testEmail("replay");
    await auth.register({ email, role: "traveller", context: context() });
    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    const code = lastCodeFor(email);

    await auth.verifyLoginOtp({ email, code, context: context(freshIp()) });

    // A replayed code must not mint a second session.
    await expect(auth.verifyLoginOtp({ email, code, context: context(freshIp()) })).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("supersedes an earlier code when a new one is issued", async () => {
    const email = testEmail("supersede");
    await auth.register({ email, role: "traveller", context: context() });

    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    const firstCode = lastCodeFor(email);

    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    const secondCode = lastCodeFor(email);

    if (firstCode !== secondCode) {
      await expect(
        auth.verifyLoginOtp({ email, code: firstCode, context: context(freshIp()) }),
      ).rejects.toThrow(UnauthenticatedError);
    }

    await expect(
      auth.verifyLoginOtp({ email, code: secondCode, context: context(freshIp()) }),
    ).resolves.toBeDefined();
  });

  it("stores only a hash of the code", async () => {
    const email = testEmail("hashed");
    await auth.register({ email, role: "traveller", context: context() });
    await auth.requestLoginOtp({ email, context: context(freshIp()) });

    const challenge = await testDb.otpChallenge.findFirstOrThrow({ where: { email } });
    expect(challenge.codeHash).not.toBe(lastCodeFor(email));
    expect(challenge.codeHash).toHaveLength(64);
  });
});

describe("password login", () => {
  it("issues a session for correct credentials", async () => {
    const email = testEmail("pwlogin");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });

    const session = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: context(freshIp()),
    });

    const principal = await auth.resolvePrincipal(session.token);
    expect(principal?.roles).toEqual(["host"]);
  });

  it("rejects a wrong password", async () => {
    const email = testEmail("wrongpw");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });

    await expect(
      auth.loginWithPassword({ email, password: "not-the-password", context: context(freshIp()) }),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("gives an identical error for an unknown account", async () => {
    // Message parity is what stops login being an enumeration oracle.
    const unknown = auth
      .loginWithPassword({
        email: testEmail("nobody"),
        password: PASSWORD,
        context: context(freshIp()),
      })
      .catch((e: Error) => e.message);

    const email = testEmail("known2");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });
    const wrong = auth
      .loginWithPassword({ email, password: "wrong-password-here", context: context(freshIp()) })
      .catch((e: Error) => e.message);

    expect(await unknown).toBe(await wrong);
  });

  it("refuses a suspended account with the same message", async () => {
    const email = testEmail("suspended");
    const { userId } = await auth.register({
      email,
      password: PASSWORD,
      role: "host",
      context: context(),
    });
    await testDb.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });

    await expect(
      auth.loginWithPassword({ email, password: PASSWORD, context: context(freshIp()) }),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("refuses a passwordless traveller account", async () => {
    const email = testEmail("travpw");
    await auth.register({ email, role: "traveller", context: context() });

    await expect(
      auth.loginWithPassword({ email, password: PASSWORD, context: context(freshIp()) }),
    ).rejects.toThrow(UnauthenticatedError);
  });
});

describe("sessions", () => {
  async function loggedInHost() {
    const email = testEmail("session");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });
    return auth.loginWithPassword({ email, password: PASSWORD, context: context(freshIp()) });
  }

  it("stores only a hash of the session token", async () => {
    const session = await loggedInHost();
    const row = await testDb.session.findUniqueOrThrow({ where: { id: session.sessionId } });

    expect(row.tokenHash).not.toBe(session.token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it("issues a distinct token per login, defeating fixation", async () => {
    const email = testEmail("fixation");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });

    const first = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: context(freshIp()),
    });
    const second = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: context(freshIp()),
    });

    expect(first.token).not.toBe(second.token);
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it("rejects a forged or unknown token", async () => {
    expect(await auth.resolvePrincipal("not-a-real-token")).toBeNull();
    expect(await auth.resolvePrincipal("")).toBeNull();
  });

  it("stops resolving after revocation", async () => {
    const session = await loggedInHost();
    expect(await auth.resolvePrincipal(session.token)).not.toBeNull();

    await auth.revokeSession(session.sessionId, context());
    expect(await auth.resolvePrincipal(session.token)).toBeNull();
  });

  it("stops resolving after expiry", async () => {
    const session = await loggedInHost();
    currentTime = new Date(currentTime.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await auth.resolvePrincipal(session.token)).toBeNull();
  });

  it("stops resolving once the account is suspended", async () => {
    // Immediate revocation is the whole reason sessions are server-side
    // rather than JWTs (ADR-0005).
    const session = await loggedInHost();
    await testDb.user.update({ where: { id: session.userId }, data: { status: "SUSPENDED" } });

    expect(await auth.resolvePrincipal(session.token)).toBeNull();
  });

  it("stops resolving once the account is soft-deleted", async () => {
    const session = await loggedInHost();
    await testDb.user.update({ where: { id: session.userId }, data: { deletedAt: currentTime } });

    expect(await auth.resolvePrincipal(session.token)).toBeNull();
  });

  it("carries the role's permission set onto the principal", async () => {
    const session = await loggedInHost();
    const principal = await auth.resolvePrincipal(session.token);

    expect(principal?.permissions.has(PERMISSIONS.EXPERIENCE_CREATE)).toBe(true);
    // A host must never hold platform-wide reads.
    expect(principal?.permissions.has(PERMISSIONS.BOOKING_READ_ALL)).toBe(false);
    expect(principal?.permissions.has(PERMISSIONS.ROLE_GRANT)).toBe(false);
  });
});

describe("authorization through a real session", () => {
  async function loggedInAdmin(mfaSatisfied: boolean) {
    const email = testEmail("admin");
    const { userId } = await auth.register({
      email,
      password: PASSWORD,
      role: "host",
      context: context(),
    });

    // Privileged roles are granted, never self-assigned.
    await createUserRepository(testDb).grantRole(userId, "super_admin");

    const session = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: context(freshIp()),
    });

    if (mfaSatisfied) {
      const secret = generateTotpSecret();
      await testDb.user.update({
        where: { id: userId },
        data: { mfaSecret: secret, mfaEnrolledAt: currentTime },
      });
      const code = new TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      }).generate({ timestamp: currentTime.getTime() });

      await auth.verifyMfa({
        userId,
        sessionId: session.sessionId,
        code,
        context: context(freshIp()),
      });
    }

    return { session, userId };
  }

  it("denies a privileged action until MFA is satisfied", async () => {
    const { session } = await loggedInAdmin(false);
    const principal = await auth.resolvePrincipal(session.token);

    expect(principal).not.toBeNull();
    expect(principal?.mfaSatisfied).toBe(false);
    // Holding the permission is not enough while the MFA gate is unmet.
    expect(() => authorize(principal!, PERMISSIONS.ROLE_GRANT, currentTime)).toThrow(
      UnauthenticatedError,
    );
  });

  it("allows the action once MFA is satisfied", async () => {
    const { session } = await loggedInAdmin(true);
    const principal = await auth.resolvePrincipal(session.token);

    expect(principal?.mfaSatisfied).toBe(true);
    expect(() => authorize(principal!, PERMISSIONS.ROLE_GRANT, currentTime)).not.toThrow();
  });

  it("requires fresh authentication for a step-up action", async () => {
    const { session } = await loggedInAdmin(true);
    const principal = await auth.resolvePrincipal(session.token);

    const muchLater = new Date(currentTime.getTime() + 20 * 60 * 1000);
    expect(() => authorize(principal!, PERMISSIONS.ROLE_GRANT, muchLater)).toThrow(
      UnauthenticatedError,
    );
    // A non-step-up permission is unaffected by staleness.
    expect(() => authorize(principal!, PERMISSIONS.AUDIT_READ, muchLater)).not.toThrow();
  });

  it("gives an admin session the short admin lifetime", async () => {
    const { session } = await loggedInAdmin(false);
    const row = await testDb.session.findUniqueOrThrow({ where: { id: session.sessionId } });

    const hours = (row.expiresAt.getTime() - currentTime.getTime()) / (60 * 60 * 1000);
    expect(hours).toBeLessThanOrEqual(8);
  });
});

describe("MFA enrolment", () => {
  it("issues a provisioning URI and refuses a second enrolment", async () => {
    const email = testEmail("mfa");
    const { userId } = await auth.register({
      email,
      password: PASSWORD,
      role: "host",
      context: context(),
    });

    const { provisioningUri } = await auth.beginMfaEnrolment(userId);
    expect(provisioningUri).toMatch(/^otpauth:\/\/totp\//);

    const session = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: context(freshIp()),
    });

    const secret = await testDb.user
      .findUniqueOrThrow({ where: { id: userId }, select: { mfaSecret: true } })
      .then((u) => u.mfaSecret!);

    const code = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).generate({ timestamp: currentTime.getTime() });

    await auth.verifyMfa({
      userId,
      sessionId: session.sessionId,
      code,
      context: context(freshIp()),
    });

    // Re-enrolment would let a hijacked session swap the second factor.
    await expect(auth.beginMfaEnrolment(userId)).rejects.toThrow(ConflictError);
  });

  it("rejects an incorrect TOTP code", async () => {
    const email = testEmail("mfabad");
    const { userId } = await auth.register({
      email,
      password: PASSWORD,
      role: "host",
      context: context(),
    });
    await auth.beginMfaEnrolment(userId);

    const session = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: context(freshIp()),
    });

    await expect(
      auth.verifyMfa({
        userId,
        sessionId: session.sessionId,
        code: "000000",
        context: context(freshIp()),
      }),
    ).rejects.toThrow(UnauthenticatedError);
  });
});

describe("rate limiting", () => {
  it("blocks repeated password attempts against one address", async () => {
    const email = testEmail("ratelimit");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });

    let rateLimited = false;
    for (let i = 0; i < 15; i += 1) {
      try {
        await auth.loginWithPassword({
          email,
          password: "wrong-password-x",
          context: context(freshIp()),
        });
      } catch (error) {
        if (error instanceof RateLimitedError) {
          rateLimited = true;
          break;
        }
      }
    }

    expect(rateLimited).toBe(true);
  });

  it("counts a limit per subject, not globally", async () => {
    const a = testEmail("bucketa");
    const b = testEmail("bucketb");
    await auth.register({ email: a, password: PASSWORD, role: "host", context: context() });
    await auth.register({ email: b, password: PASSWORD, role: "host", context: context() });

    for (let i = 0; i < 9; i += 1) {
      await auth
        .loginWithPassword({ email: a, password: "wrong-password-x", context: context(freshIp()) })
        .catch(() => undefined);
    }

    // b's allowance must be untouched by a's failures.
    await expect(
      auth.loginWithPassword({ email: b, password: PASSWORD, context: context(freshIp()) }),
    ).resolves.toBeDefined();
  });

  it("rolls the window over time", async () => {
    const email = testEmail("window");
    await auth.register({ email, password: PASSWORD, role: "host", context: context() });

    for (let i = 0; i < 12; i += 1) {
      await auth
        .loginWithPassword({ email, password: "wrong-password-x", context: context(freshIp()) })
        .catch(() => undefined);
    }

    currentTime = new Date(currentTime.getTime() + 16 * 60 * 1000);

    await expect(
      auth.loginWithPassword({ email, password: PASSWORD, context: context(freshIp()) }),
    ).resolves.toBeDefined();
  });
});
