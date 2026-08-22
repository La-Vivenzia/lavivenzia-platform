import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "pino";
import type { SendEmailCommand, SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import { TEST_EMAIL_DOMAIN, testDb, testEmail } from "./helpers";
import { AuthService, type RequestContext } from "@/modules/auth/service";
import {
  createAuditRepository,
  createOtpRepository,
  createRateLimiter,
  createSessionRepository,
  createUserRepository,
} from "@/adapters/persistence/prisma/auth-repositories";
import { ConsoleEmailAdapter } from "@/adapters/email/console";
import { SesEmailAdapter, type SesSendClient } from "@/adapters/email/ses";
import { OTP_TTL_MS } from "@/modules/auth/otp";
import type { EmailPort } from "@/ports/email";
import { ProviderUnavailableError } from "@/lib/errors";

/**
 * Login codes travelling through a real email adapter, against a real database.
 *
 * The unit suite proves each adapter in isolation. What it cannot prove is that
 * the code the service generates is the code that reaches the message body —
 * that requires the real service, the real OTP repository and a real adapter in
 * one line. Every previous defect in this flow lived in exactly that seam.
 */

const OTP_TTL_MINUTES = Math.round(OTP_TTL_MS / 60_000);

interface LogLine {
  readonly payload: Record<string, unknown>;
}

function recordingLogger(): { logger: () => Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const push =
    () =>
    (payload: Record<string, unknown>): void => {
      lines.push({ payload });
    };

  const fake = { info: push(), warn: push(), error: push() };
  return { logger: () => fake as unknown as Logger, lines };
}

/** Build the service with the real repositories and a given email transport. */
function makeService(email: EmailPort): AuthService {
  return new AuthService({
    users: createUserRepository(testDb),
    sessions: createSessionRepository(testDb),
    otps: createOtpRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    audit: createAuditRepository(testDb),
    now: () => new Date(),
    // The same wiring as src/lib/container.ts, which is the point: this proves
    // the composition, not a substitute for it.
    deliverOtp: async (to, code) => {
      await email.send({
        to,
        template: "auth.login-code",
        variables: { code, expiresInMinutes: OTP_TTL_MINUTES },
      });
    },
  });
}

function context(ip: string): RequestContext {
  return { ipAddress: ip, userAgent: "vitest", correlationId: "email-delivery-test" };
}

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

afterEach(async () => {
  await testDb.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
  await testDb.otpChallenge.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("login code delivery through the email port", () => {
  let log: ReturnType<typeof recordingLogger>;
  let auth: AuthService;

  beforeEach(() => {
    log = recordingLogger();
    auth = makeService(new ConsoleEmailAdapter({ logger: log.logger }));
  });

  it("puts the issued code into the message body", async () => {
    const email = testEmail("traveller");
    await auth.register({ email, role: "traveller", context: context(freshIp()) });

    await auth.requestLoginOtp({ email, context: context(freshIp()) });

    expect(log.lines).toHaveLength(1);
    const body = String(log.lines[0]!.payload.body);
    expect(body).toMatch(/\b\d{6}\b/);
    expect(log.lines[0]!.payload.to).toBe(email);
  });

  it("issues a code that actually completes the login", async () => {
    // The end-to-end assertion: the code in the email is the code the verify
    // path accepts. A rendering or generation mismatch fails here and nowhere
    // else.
    const email = testEmail("traveller");
    await auth.register({ email, role: "traveller", context: context(freshIp()) });
    await auth.requestLoginOtp({ email, context: context(freshIp()) });

    const code = /\b(\d{6})\b/.exec(String(log.lines[0]!.payload.body))?.[1];
    expect(code).toBeDefined();

    const session = await auth.verifyLoginOtp({
      email,
      code: code as string,
      context: context(freshIp()),
    });

    expect(session.token).toBeTruthy();
    expect(session.mfaRequired).toBe(false);
  });

  it("states the same expiry the challenge was actually given", async () => {
    const email = testEmail("traveller");
    await auth.register({ email, role: "traveller", context: context(freshIp()) });

    const before = Date.now();
    await auth.requestLoginOtp({ email, context: context(freshIp()) });

    const challenge = await testDb.otpChallenge.findFirst({
      where: { email, purpose: "LOGIN" },
      orderBy: { createdAt: "desc" },
    });

    const actualMinutes = Math.round((challenge!.expiresAt.getTime() - before) / 60_000);
    expect(actualMinutes).toBe(OTP_TTL_MINUTES);
    expect(String(log.lines[0]!.payload.body)).toContain(`${OTP_TTL_MINUTES} minutes`);
  });

  it("sends nothing for an address with no account", async () => {
    // The enumeration guarantee reaches the transport, not just the response:
    // an attacker probing addresses must not be able to trigger mail.
    await auth.requestLoginOtp({ email: testEmail("nobody"), context: context(freshIp()) });
    expect(log.lines).toHaveLength(0);
  });

  it("sends nothing for an account that signs in with a password", async () => {
    const email = testEmail("host");
    await auth.register({
      email,
      password: "a-sufficiently-long-password",
      role: "host",
      context: context(freshIp()),
    });

    await auth.requestLoginOtp({ email, context: context(freshIp()) });
    expect(log.lines).toHaveLength(0);
  });
});

describe("provider failure during login", () => {
  function failingSes(): EmailPort {
    const log = recordingLogger();
    const client: SesSendClient = {
      send(_command: SendEmailCommand): Promise<SendEmailCommandOutput> {
        const error = new Error("SES is down");
        error.name = "InternalServiceErrorException";
        Object.assign(error, { $metadata: { httpStatusCode: 500 } });
        return Promise.reject(error);
      },
    };

    return new SesEmailAdapter(
      { from: "no-reply@lavivenzia.test", region: "ap-south-1" },
      { logger: log.logger, client },
    );
  }

  it("surfaces the failure rather than reporting a code that was never sent", async () => {
    const auth = makeService(failingSes());
    const email = testEmail("traveller");
    await auth.register({ email, role: "traveller", context: context(freshIp()) });

    await expect(auth.requestLoginOtp({ email, context: context(freshIp()) })).rejects.toThrow(
      ProviderUnavailableError,
    );
  });

  it("leaves the challenge behind, so a retry supersedes it rather than stacking", async () => {
    const auth = makeService(failingSes());
    const email = testEmail("traveller");
    await auth.register({ email, role: "traveller", context: context(freshIp()) });

    await auth.requestLoginOtp({ email, context: context(freshIp()) }).catch(() => undefined);
    await auth.requestLoginOtp({ email, context: context(freshIp()) }).catch(() => undefined);

    const live = await testDb.otpChallenge.count({
      where: { email, purpose: "LOGIN", consumedAt: null },
    });

    // Each request consumes the previous outstanding challenge before issuing a
    // new one, so a provider outage cannot leave a pile of valid codes.
    expect(live).toBe(1);
  });
});
