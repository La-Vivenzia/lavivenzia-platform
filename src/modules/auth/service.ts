import {
  ConflictError,
  ForbiddenError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import {
  MFA_REQUIRED_ROLES,
  getRoleDefinition,
  type PermissionKey,
  type RoleKey,
} from "@/modules/auth/permissions";
import {
  SESSION_LIFETIMES,
  hashSessionToken,
  isSessionActive,
  issueSessionToken,
  type SessionLifetime,
} from "@/modules/auth/session";
import { getTimingEqualisationHash, hashPassword, verifyPassword } from "@/modules/auth/password";
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiryFrom,
  verifyOtpChallenge,
} from "@/modules/auth/otp";
import { generateTotpSecret, buildTotpProvisioningUri, verifyTotpCode } from "@/modules/auth/totp";
import { RATE_LIMITS, rateLimitKey, type RateLimitName } from "@/modules/auth/rate-limits";
import type { Principal } from "@/modules/auth/authorization";
import type {
  AuditRepository,
  OtpRepository,
  RateLimiter,
  SessionRepository,
  UserRecord,
  UserRepository,
} from "@/modules/auth/ports";

/**
 * Authentication service.
 *
 * Framework-free by design (ADR-0002): it receives repositories and a clock,
 * and returns plain values. The HTTP layer owns cookies and status codes; this
 * layer owns the security decisions.
 */

export interface AuthDependencies {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly otps: OtpRepository;
  readonly rateLimiter: RateLimiter;
  readonly audit: AuditRepository;
  /** Injected so tests can control time without faking timers globally. */
  readonly now: () => Date;
  /**
   * Delivers the code to the user. Returns the code in non-production only, so
   * local development works before the email adapter exists.
   */
  readonly deliverOtp: (email: string, code: string) => Promise<void>;
}

export interface RequestContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly correlationId: string | null;
}

export interface IssuedSession {
  /** Raw token for the cookie. Never persisted, returned exactly once. */
  readonly token: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly lifetime: SessionLifetime;
  /** True when the account requires MFA and the session has not satisfied it. */
  readonly mfaRequired: boolean;
}

/** Roles a self-service registration may create. Privileged roles are granted, never claimed. */
const SELF_SERVICE_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>(["traveller", "host"]);

export class AuthService {
  readonly #deps: AuthDependencies;

  constructor(deps: AuthDependencies) {
    this.#deps = deps;
  }

  // ── Rate limiting ────────────────────────────────────────────────────────

  async #enforceLimit(name: RateLimitName, subject: string): Promise<void> {
    const rule = RATE_LIMITS[name];
    const decision = await this.#deps.rateLimiter.consume(
      rateLimitKey(name, subject),
      rule.limit,
      rule.windowMs,
      this.#deps.now(),
    );

    if (!decision.allowed) {
      throw new RateLimitedError("Too many attempts. Please try again later.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Register a traveller or host.
   *
   * Travellers are passwordless (email OTP); hosts set a password. A duplicate
   * address is reported as a conflict — see the note below on why that is a
   * deliberate trade-off rather than an oversight.
   */
  async register(input: {
    readonly email: string;
    readonly password?: string;
    readonly role: RoleKey;
    readonly context: RequestContext;
  }): Promise<{ readonly userId: string }> {
    const { email, password, role, context } = input;

    if (!SELF_SERVICE_ROLES.has(role)) {
      // Privileged roles are granted by an admin through an audited action.
      // Accepting one here would be straightforward privilege escalation.
      throw new ForbiddenError("That role cannot be self-assigned.");
    }

    await this.#enforceLimit("registerPerIp", context.ipAddress ?? "unknown");

    if (role === "host" && !password) {
      throw new ValidationError("Hosts must set a password.");
    }
    if (role === "traveller" && password) {
      throw new ValidationError("Travellers sign in with an email code, not a password.");
    }

    const existing = await this.#deps.users.findByEmail(email);
    if (existing) {
      // Registration necessarily reveals whether an address is taken — the
      // alternative (silently succeeding, then emailing the existing owner)
      // trades enumeration for a confusing flow and a spam vector. The login
      // and OTP paths, where enumeration actually matters, do not leak.
      throw new ConflictError("An account with that email already exists.");
    }

    const passwordHash = password ? await hashPassword(password) : null;

    const user = await this.#deps.users.createWithRole({
      email,
      passwordHash,
      role,
      emailVerified: false,
    });

    await this.#deps.audit.record({
      actorId: user.id,
      sessionId: null,
      action: "auth.registered",
      subjectType: "user",
      subjectId: user.id,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      after: { role, email: user.email },
    });

    return { userId: user.id };
  }

  // ── Email OTP (travellers) ───────────────────────────────────────────────

  /**
   * Issue a login code.
   *
   * Always reports success, whether or not the address has an account. The
   * response must not distinguish the two, or it becomes an enumeration oracle.
   */
  async requestLoginOtp(input: {
    readonly email: string;
    readonly context: RequestContext;
  }): Promise<void> {
    const { email, context } = input;

    await this.#enforceLimit("otpRequestPerEmail", email);
    await this.#enforceLimit("otpRequestPerIp", context.ipAddress ?? "unknown");

    const user = await this.#deps.users.findByEmail(email);
    const now = this.#deps.now();

    // No account, or an account that cannot sign in: return silently. Doing the
    // work only for real accounts is safe because the *response* is identical.
    if (!user || user.deletedAt !== null || user.status !== "ACTIVE") return;

    // A password account must not be bypassable with an emailed code — that
    // would reduce every host and admin to single-factor email possession.
    if (user.passwordHash !== null) return;

    // Supersede any outstanding code, so only the newest is live.
    await this.#deps.otps.consumeAllForEmail(email, "LOGIN", now);

    const code = generateOtpCode();
    await this.#deps.otps.create({
      email,
      purpose: "LOGIN",
      codeHash: hashOtpCode(code),
      expiresAt: otpExpiryFrom(now),
      requestedIp: context.ipAddress,
    });

    await this.#deps.deliverOtp(email, code);
  }

  /** Verify a login code and issue a session. */
  async verifyLoginOtp(input: {
    readonly email: string;
    readonly code: string;
    readonly context: RequestContext;
  }): Promise<IssuedSession> {
    const { email, code, context } = input;

    await this.#enforceLimit("otpVerifyPerEmail", email);

    const now = this.#deps.now();
    const challenge = await this.#deps.otps.findActive(email, "LOGIN");

    // Uniform failure for every reason: no challenge, wrong code, expired,
    // burned. Distinguishing them tells an attacker whether the address exists
    // and whether a code is outstanding.
    const invalid = new UnauthenticatedError("That code is not valid.");

    if (!challenge) throw invalid;

    const result = verifyOtpChallenge(challenge, code, now);

    if (result.outcome !== "valid") {
      // Count the miss even when the challenge is already expired or burned —
      // the increment is what makes the cap bite under a brute-force attempt.
      if (result.outcome === "mismatch") {
        await this.#deps.otps.recordFailedAttempt(challenge.id);
      }
      throw invalid;
    }

    const user = await this.#deps.users.findByEmail(email);
    if (!user || user.deletedAt !== null || user.status !== "ACTIVE") throw invalid;

    // Single-use: consume before issuing, so a replay of the same code cannot
    // mint a second session.
    await this.#deps.otps.consume(challenge.id, now);

    if (user.emailVerifiedAt === null) {
      // Completing an emailed code proves control of the address.
      await this.#deps.users.markEmailVerified(user.id, now);
    }

    return this.#issueSession(user, { context, mfaSatisfied: false, reason: "auth.login.otp" });
  }

  // ── Password login (hosts and admins) ────────────────────────────────────

  async loginWithPassword(input: {
    readonly email: string;
    readonly password: string;
    readonly context: RequestContext;
  }): Promise<IssuedSession> {
    const { email, password, context } = input;

    await this.#enforceLimit("loginPerEmail", email);
    await this.#enforceLimit("loginPerIp", context.ipAddress ?? "unknown");

    const user = await this.#deps.users.findByEmail(email);
    const invalid = new UnauthenticatedError("Invalid email or password.");

    // Always run a verification, even with no account, so both branches cost
    // the same. Skipping it returns "unknown user" in microseconds against
    // ~80 ms for a real miss, which enumerates accounts through timing alone.
    const hashToCheck = user?.passwordHash ?? (await getTimingEqualisationHash());
    const passwordMatches = await verifyPassword(password, hashToCheck);

    if (!user || user.passwordHash === null || !passwordMatches) {
      if (user) {
        await this.#deps.audit.record({
          actorId: user.id,
          sessionId: null,
          action: "auth.login.failed",
          subjectType: "user",
          subjectId: user.id,
          ipAddress: context.ipAddress,
          correlationId: context.correlationId,
        });
      }
      throw invalid;
    }

    if (user.deletedAt !== null || user.status !== "ACTIVE") {
      // Same message as a bad password: a suspended account must not be
      // distinguishable from a non-existent one.
      throw invalid;
    }

    return this.#issueSession(user, {
      context,
      mfaSatisfied: false,
      reason: "auth.login.password",
    });
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async #issueSession(
    user: UserRecord,
    options: {
      readonly context: RequestContext;
      readonly mfaSatisfied: boolean;
      readonly reason: string;
    },
  ): Promise<IssuedSession> {
    const now = this.#deps.now();
    const lifetime = lifetimeForRoles(user.roles);
    const { token, tokenHash } = issueSessionToken();

    const mfaRequired = requiresMfaForRoles(user.roles) && !options.mfaSatisfied;

    const session = await this.#deps.sessions.create({
      userId: user.id,
      tokenHash,
      now,
      expiresAt: new Date(now.getTime() + lifetime.absoluteMs),
      mfaSatisfied: options.mfaSatisfied,
      ipAddress: options.context.ipAddress,
      userAgent: options.context.userAgent,
    });

    await this.#deps.audit.record({
      actorId: user.id,
      sessionId: session.id,
      action: options.reason,
      subjectType: "user",
      subjectId: user.id,
      ipAddress: options.context.ipAddress,
      correlationId: options.context.correlationId,
      after: { mfaRequired },
    });

    return {
      token,
      sessionId: session.id,
      userId: user.id,
      expiresAt: session.expiresAt,
      lifetime,
      mfaRequired,
    };
  }

  /**
   * Resolve a session token into a Principal.
   *
   * Returns null rather than throwing for anonymous or invalid sessions — the
   * caller decides whether that is an error. Every rejection path is silent by
   * design: a revoked session must look exactly like a forged one.
   */
  async resolvePrincipal(token: string): Promise<Principal | null> {
    if (!token) return null;

    const now = this.#deps.now();
    const stored = await this.#deps.sessions.findByTokenHash(hashSessionToken(token));
    if (!stored) return null;

    const user = await this.#deps.users.findById(stored.userId);
    if (!user || user.deletedAt !== null || user.status !== "ACTIVE") return null;

    const lifetime = lifetimeForRoles(user.roles);
    if (!isSessionActive(stored, lifetime, now)) return null;

    // Sliding idle window. Written on every resolution, which is a write on the
    // read path — acceptable at launch volume, and the first thing to batch or
    // throttle if session lookups become hot.
    await this.#deps.sessions.touch(stored.id, now);

    const permissions = new Set<string>();
    for (const role of user.roles) {
      for (const permission of getRoleDefinition(role).permissions) permissions.add(permission);
    }

    return {
      userId: user.id,
      email: user.email,
      sessionId: stored.id,
      roles: user.roles,
      permissions,
      mfaSatisfied: stored.mfaSatisfiedAt !== null,
      // Step-up freshness is measured from the last authentication event, which
      // is MFA satisfaction when required and session creation otherwise.
      lastAuthenticatedAt: stored.mfaSatisfiedAt ?? stored.createdAt,
    };
  }

  async revokeSession(sessionId: string, context: RequestContext): Promise<void> {
    const now = this.#deps.now();
    await this.#deps.sessions.revoke(sessionId, now);

    await this.#deps.audit.record({
      actorId: null,
      sessionId,
      action: "auth.logout",
      subjectType: "session",
      subjectId: sessionId,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
  }

  // ── MFA ──────────────────────────────────────────────────────────────────

  /**
   * Begin TOTP enrolment. Returns the provisioning URI, which carries the
   * secret and must only ever go to the enrolling user over an authenticated
   * channel — never to a log.
   */
  async beginMfaEnrolment(userId: string): Promise<{ readonly provisioningUri: string }> {
    const user = await this.#deps.users.findById(userId);
    if (!user) throw new UnauthenticatedError();

    if (user.mfaEnrolledAt !== null) {
      // Re-enrolment would let anyone holding a live session swap the second
      // factor, defeating it. Resetting MFA is an audited admin action.
      throw new ConflictError("Multi-factor authentication is already enrolled.");
    }

    const secret = generateTotpSecret();
    await this.#deps.users.setMfaSecret(userId, secret);

    return { provisioningUri: buildTotpProvisioningUri(secret, user.email) };
  }

  /**
   * Verify a TOTP code.
   *
   * Serves both enrolment confirmation and the per-session MFA challenge, and
   * marks the current session MFA-satisfied on success.
   */
  async verifyMfa(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly code: string;
    readonly context: RequestContext;
  }): Promise<void> {
    const { userId, sessionId, code, context } = input;

    await this.#enforceLimit("mfaVerifyPerUser", userId);

    const user = await this.#deps.users.findById(userId);
    if (!user?.mfaSecret)
      throw new UnauthenticatedError("Multi-factor authentication is not set up.");

    const now = this.#deps.now();

    // Uses the injected clock, so MFA honours the same time source as session
    // expiry and OTP TTL rather than reading the wall clock independently.
    if (
      !verifyTotpCode(user.mfaSecret, code, { accountLabel: user.email, timestamp: now.getTime() })
    ) {
      await this.#deps.audit.record({
        actorId: userId,
        sessionId,
        action: "auth.mfa.failed",
        subjectType: "user",
        subjectId: userId,
        ipAddress: context.ipAddress,
        correlationId: context.correlationId,
      });
      throw new UnauthenticatedError("That code is not valid.");
    }

    if (user.mfaEnrolledAt === null) {
      await this.#deps.users.confirmMfaEnrolment(userId, now);
    }

    await this.#deps.sessions.markMfaSatisfied(sessionId, now);

    await this.#deps.audit.record({
      actorId: userId,
      sessionId,
      action: "auth.mfa.satisfied",
      subjectType: "user",
      subjectId: userId,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
  }
}

/** The strictest lifetime among the roles held — never the most permissive. */
export function lifetimeForRoles(roles: readonly RoleKey[]): SessionLifetime {
  if (roles.some((role) => MFA_REQUIRED_ROLES.has(role))) return SESSION_LIFETIMES.admin;
  if (roles.includes("host")) return SESSION_LIFETIMES.host;
  return SESSION_LIFETIMES.traveller;
}

export function requiresMfaForRoles(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => MFA_REQUIRED_ROLES.has(role));
}

export type { PermissionKey };
