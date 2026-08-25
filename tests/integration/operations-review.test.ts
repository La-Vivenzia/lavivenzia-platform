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
import { createOperationsRepository } from "@/adapters/persistence/prisma/operations-repositories";
import { LocalStorageAdapter } from "@/adapters/storage/local";
import { HostService } from "@/modules/hosts/service";
import { ExperienceService } from "@/modules/experiences/service";
import { OperationsService } from "@/modules/operations/service";
import { getRoleDefinition, type RoleKey } from "@/modules/auth/permissions";
import type { Principal } from "@/modules/auth/authorization";
import type { HostRecord } from "@/modules/hosts/ports";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * The operations review workflow against the real database.
 *
 * Production services, production adapters; only the clock and the media
 * directory are substituted. The assertions that carry the most weight are the
 * ones about who may act and whose name ends up on the decision — neither can
 * be established against a fake repository.
 */

const PASSWORD = "a-sufficiently-long-password";
const REASON = "The photographs do not show the venue itself. Please add three of the room.";
let clock = new Date("2026-08-25T12:00:00.000Z");

let auth: AuthService;
let hosts: HostService;
let experiences: ExperienceService;
let ops: OperationsService;
let categoryId: string;

let ipCounter = 0;
const context = () => {
  ipCounter += 1;
  return { ipAddress: `198.51.100.${(ipCounter % 250) + 1}`, correlationId: "ops-test" };
};
const authContext = () => ({ ...context(), userAgent: "vitest" });

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "lv-ops-"));
  const storage = new LocalStorageAdapter({ publicDir: root });
  const urlFor = (key: string) => storage.publicUrl(key);

  auth = new AuthService({
    users: createUserRepository(testDb),
    sessions: createSessionRepository(testDb),
    otps: createOtpRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    audit: createAuditRepository(testDb),
    now: () => clock,
    deliverOtp: async () => undefined,
  });

  hosts = new HostService({
    hosts: createHostRepository(testDb),
    audit: createAuditRepository(testDb),
    now: () => clock,
  });

  experiences = new ExperienceService({
    experiences: createExperienceRepository(testDb, urlFor),
    categories: createCategoryRepository(testDb),
    storage,
    audit: createAuditRepository(testDb),
    rateLimiter: createRateLimiter(testDb),
    now: () => clock,
  });

  ops = new OperationsService({
    operations: createOperationsRepository(testDb, urlFor),
    audit: createAuditRepository(testDb),
    now: () => clock,
  });

  const seeded = await createCategoryRepository(testDb).listActive();
  const first = seeded[0];
  if (!first) throw new Error("Categories are not seeded; run npm run db:test:setup");
  categoryId = first.id;
});

/**
 * A signed-in account holding `role`.
 *
 * Privileged roles are granted the way the bootstrap script does it — register
 * normally, then add the role — because that is the only path that exists.
 * Registration itself refuses anything beyond traveller and host.
 */
async function signIn(role: RoleKey): Promise<Principal> {
  const email = testEmail(role);
  const selfService = role === "traveller" || role === "host";

  await auth.register({
    email,
    ...(role === "traveller" ? {} : { password: PASSWORD }),
    role: selfService ? role : "host",
    context: authContext(),
  });

  if (!selfService) {
    const user = await testDb.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    await createUserRepository(testDb).grantRole(user.id, role);
    // Drop the host role the registration created, so a privileged principal
    // does not accidentally carry host permissions and mask a missing check.
    await testDb.userRole.deleteMany({
      where: { userId: user.id, role: { key: "host" } },
    });
  }

  if (role === "traveller") {
    const user = await testDb.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    const permissions = new Set<string>(getRoleDefinition("traveller").permissions);
    return {
      userId: user.id,
      email,
      sessionId: "traveller-session",
      roles: ["traveller"],
      permissions,
      mfaSatisfied: false,
      lastAuthenticatedAt: clock,
    };
  }

  const session = await auth.loginWithPassword({
    email,
    password: PASSWORD,
    context: authContext(),
  });

  // Privileged roles require MFA, and `authorize()` refuses everything until
  // the session satisfies it. Marking it directly is what a TOTP code does.
  await testDb.session.update({
    where: { id: session.sessionId },
    data: { mfaSatisfiedAt: clock },
  });

  const principal = await auth.resolvePrincipal(session.token);
  if (!principal) throw new Error("Session did not resolve");
  return principal;
}

async function makeHost(): Promise<{ principal: Principal; host: HostRecord }> {
  const principal = await signIn("host");
  const view = await hosts.createProfile(
    principal,
    {
      displayName: `Studio ${Date.now()}-${ipCounter}`,
      hostType: "INDIVIDUAL",
      contactEmail: null,
    },
    context(),
  );
  return { principal, host: view.host };
}

function jpegBytes(size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

/** A listing sitting in the review queue, which is where operations meets it. */
async function submittedExperience(
  owner: { principal: Principal; host: HostRecord },
  title = "An evening of Chettinad cooking",
): Promise<string> {
  const created = await experiences.createDraft(owner.principal, owner.host, { title }, context());
  const id = created.experience.id;

  await experiences.updateContent(owner.principal, owner.host, id, {
    summary: "Cook and eat with a family who have done it for four generations.",
    description: "d".repeat(220),
    categoryId,
    city: "Karaikudi",
    durationMinutes: 180,
    maxGuests: 8,
    basePriceMinor: 450_000,
  });

  const media = await experiences.addMedia(owner.principal, owner.host, id, {
    bytes: jpegBytes(),
    declaredType: "image/jpeg",
  });
  await experiences.updateMedia(owner.principal, owner.host, id, media.id, {
    altText: "A brass pot over a wood fire",
  });

  await experiences.performAction(owner.principal, owner.host, id, "submit", context());
  return id;
}

/** A host application sitting in the verification queue. */
async function submittedHost(): Promise<{ principal: Principal; host: HostRecord }> {
  const owner = await makeHost();

  await hosts.updateProfile(owner.principal, {
    contactEmail: "studio@example.com",
    contactPhone: "+91 98765 43210",
    city: "Jaipur",
    headline: "Third-generation block printers in Bagru",
    about: "a".repeat(120),
  });
  const submitted = await hosts.submitForVerification(owner.principal, context());

  return { principal: owner.principal, host: submitted.host };
}

afterEach(async () => {
  clock = new Date("2026-08-25T12:00:00.000Z");
  await testDb.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
  await testDb.rateLimitCounter.deleteMany({});
});

afterAll(async () => {
  await testDb.$disconnect();
});

// ── Access ─────────────────────────────────────────────────────────────────

describe("operations access", () => {
  it("refuses a traveller every operations read", async () => {
    const traveller = await signIn("traveller");
    const paging = { page: 1, pageSize: 20 };

    await expect(ops.overview(traveller)).rejects.toThrow(ForbiddenError);
    await expect(ops.listExperiences(traveller, paging)).rejects.toThrow(ForbiddenError);
    await expect(ops.listHosts(traveller, paging)).rejects.toThrow(ForbiddenError);
  });

  it("refuses a host every operations read", async () => {
    // A host holds experience:read:own and experience:update:own. Neither is
    // experience:read:all, and the distinction is the whole point of the scope
    // suffix on the permission key.
    const owner = await makeHost();
    const paging = { page: 1, pageSize: 20 };

    await expect(ops.overview(owner.principal)).rejects.toThrow(ForbiddenError);
    await expect(ops.listExperiences(owner.principal, paging)).rejects.toThrow(ForbiddenError);
    await expect(ops.listHosts(owner.principal, paging)).rejects.toThrow(ForbiddenError);
  });

  it("refuses a host and a traveller any decision", async () => {
    const owner = await makeHost();
    const traveller = await signIn("traveller");
    const id = await submittedExperience(owner);

    for (const principal of [owner.principal, traveller]) {
      await expect(
        ops.decideOnExperience(principal, { id, decision: "approve", note: null }, context()),
      ).rejects.toThrow(ForbiddenError);
    }

    // And the listing did not move.
    const operator = await signIn("operations");
    const view = await ops.getExperience(operator, id);
    expect(view.detail.experience.status).toBe("IN_REVIEW");
  });

  it("allows an operator", async () => {
    const operator = await signIn("operations");
    await expect(ops.overview(operator)).resolves.toBeDefined();
    await expect(ops.listExperiences(operator, { page: 1, pageSize: 20 })).resolves.toBeDefined();
  });

  it("refuses an operator whose session has not satisfied MFA", async () => {
    // The role mandates a second factor, and `authorize()` gates every
    // privileged permission behind it — the console is unreachable until then.
    const email = testEmail("operations");
    await auth.register({ email, password: PASSWORD, role: "host", context: authContext() });

    const user = await testDb.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    await createUserRepository(testDb).grantRole(user.id, "operations");

    const session = await auth.loginWithPassword({
      email,
      password: PASSWORD,
      context: authContext(),
    });
    const principal = await auth.resolvePrincipal(session.token);

    expect(principal?.mfaSatisfied).toBe(false);
    await expect(ops.overview(principal!)).rejects.toThrow();
  });

  it("refuses a content admin the host surface but allows the listing surface", async () => {
    // content_admin holds experience:read:all and not host:read. Each screen
    // authorizes what it actually does rather than gating on "is an admin".
    const contentAdmin = await signIn("content_admin");

    await expect(
      ops.listExperiences(contentAdmin, { page: 1, pageSize: 20 }),
    ).resolves.toBeDefined();
    await expect(ops.listHosts(contentAdmin, { page: 1, pageSize: 20 })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("refuses a content admin an approval decision", async () => {
    // They may read every listing and approve none: experience:approve is an
    // operations permission.
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const contentAdmin = await signIn("content_admin");

    await expect(
      ops.decideOnExperience(contentAdmin, { id, decision: "approve", note: null }, context()),
    ).rejects.toThrow(ForbiddenError);
  });
});

// ── The workflow ───────────────────────────────────────────────────────────

describe("experience review", () => {
  it("carries a submitted listing through to published", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    const queue = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 20,
      status: "IN_REVIEW",
    });
    expect(queue.items.some((item) => item.id === id)).toBe(true);

    const decided = await ops.decideOnExperience(
      operator,
      { id, decision: "approve", note: null },
      context(),
    );

    expect(decided.detail.experience.status).toBe("PUBLISHED");
    expect(decided.detail.experience.publishedAt).toEqual(clock);
    expect(decided.detail.reviewer?.email).toBe(operator.email);
  });

  it("shows the host the result of the decision", async () => {
    // The end of the workflow: the host must be able to see what happened.
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "reject", note: REASON }, context());

    const hostView = await experiences.getOwn(owner.principal, owner.host, id);
    expect(hostView.experience.status).toBe("REJECTED");
    expect(hostView.experience.reviewNote).toBe(REASON);
    // Editable again, so they can act on the feedback.
    expect(hostView.canEdit).toBe(true);
  });

  it("lets a host fix and resubmit after a rejection", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "reject", note: REASON }, context());
    await experiences.updateContent(owner.principal, owner.host, id, { city: "Madurai" });
    const resubmitted = await experiences.performAction(
      owner.principal,
      owner.host,
      id,
      "submit",
      context(),
    );

    expect(resubmitted.experience.status).toBe("IN_REVIEW");

    const approved = await ops.decideOnExperience(
      operator,
      { id, decision: "approve", note: null },
      context(),
    );
    expect(approved.detail.experience.status).toBe("PUBLISHED");
  });

  it("suspends a published listing and keeps the original publication date", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context());
    const firstPublished = (await ops.getExperience(operator, id)).detail.experience.publishedAt;

    clock = new Date("2026-09-01T12:00:00.000Z");
    await ops.decideOnExperience(operator, { id, decision: "suspend", note: REASON }, context());

    clock = new Date("2026-09-02T12:00:00.000Z");
    const reinstated = await ops.decideOnExperience(
      operator,
      { id, decision: "reinstate", note: null },
      context(),
    );

    expect(reinstated.detail.experience.status).toBe("PUBLISHED");
    // `publishedAt` means "when this first went live" and must survive the round trip.
    expect(reinstated.detail.experience.publishedAt).toEqual(firstPublished);
  });

  it("refuses an invalid transition", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await expect(
      ops.decideOnExperience(operator, { id, decision: "suspend", note: REASON }, context()),
    ).rejects.toThrow(ConflictError);

    await ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context());

    // Already decided.
    await expect(
      ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context()),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a rejection with no reason, and does not move the record", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await expect(
      ops.decideOnExperience(operator, { id, decision: "reject", note: null }, context()),
    ).rejects.toThrow(ValidationError);
    await expect(
      ops.decideOnExperience(operator, { id, decision: "reject", note: "  " }, context()),
    ).rejects.toThrow(ValidationError);

    expect((await ops.getExperience(operator, id)).detail.experience.status).toBe("IN_REVIEW");
  });

  it("refuses a decision on an id that does not exist", async () => {
    const operator = await signIn("operations");

    await expect(
      ops.decideOnExperience(
        operator,
        { id: "00000000-0000-4000-8000-000000000000", decision: "approve", note: null },
        context(),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns the host and media a reviewer needs, in one read", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    const view = await ops.getExperience(operator, id);

    expect(view.detail.host.id).toBe(owner.host.id);
    expect(view.detail.hostAccountEmail).toContain("@");
    expect(view.detail.experience.media).toHaveLength(1);
    expect(view.detail.experience.media[0]?.url).toMatch(/^\/uploads\//);
    expect(view.detail.categoryName).toBeTruthy();
  });
});

describe("host review", () => {
  it("verifies a pending application", async () => {
    const applicant = await submittedHost();
    const operator = await signIn("operations");

    const decided = await ops.decideOnHost(
      operator,
      { id: applicant.host.id, decision: "verify", note: null },
      context(),
    );

    expect(decided.detail.host.verificationStatus).toBe("VERIFIED");
    expect(decided.detail.reviewer?.email).toBe(operator.email);
  });

  it("returns a rejected application to the host, with the reason", async () => {
    const applicant = await submittedHost();
    const operator = await signIn("operations");

    await ops.decideOnHost(
      operator,
      { id: applicant.host.id, decision: "reject", note: REASON },
      context(),
    );

    const hostView = await hosts.getOwnProfile(applicant.principal);
    expect(hostView?.host.verificationStatus).toBe("REJECTED");
    expect(hostView?.host.reviewNote).toBe(REASON);
    expect(hostView?.canEdit).toBe(true);
  });

  it("refuses a decision on an application that was never submitted", async () => {
    const owner = await makeHost();
    const operator = await signIn("operations");

    await expect(
      ops.decideOnHost(operator, { id: owner.host.id, decision: "verify", note: null }, context()),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a rejection with no reason", async () => {
    const applicant = await submittedHost();
    const operator = await signIn("operations");

    await expect(
      ops.decideOnHost(
        operator,
        { id: applicant.host.id, decision: "reject", note: null },
        context(),
      ),
    ).rejects.toThrow(ValidationError);
  });
});

// ── Audit ──────────────────────────────────────────────────────────────────

describe("audit trail", () => {
  it("attributes the decision to the authenticated operator", async () => {
    // The central claim: the actor comes from the session. No method takes one.
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context());

    const entry = await testDb.auditLog.findFirst({
      where: { action: "experience.review.approve", subjectId: id },
    });

    expect(entry?.actorId).toBe(operator.userId);
    expect(entry?.actorId).not.toBe(owner.principal.userId);
    expect(entry?.sessionId).toBe(operator.sessionId);
  });

  it("records the state on both sides of the decision", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "reject", note: REASON }, context());

    const entry = await testDb.auditLog.findFirstOrThrow({
      where: { action: "experience.review.reject", subjectId: id },
    });

    expect(entry.before).toEqual({ status: "IN_REVIEW" });
    expect(entry.after).toMatchObject({ status: "REJECTED", note: REASON });
  });

  it("writes nothing when the decision is refused", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops
      .decideOnExperience(operator, { id, decision: "suspend", note: REASON }, context())
      .catch(() => undefined);

    // Scoped to this listing. Audit rows deliberately outlive the users they
    // refer to (ON DELETE SET NULL), so they are not cleaned between tests and
    // an unscoped count would pick up every earlier decision in this file.
    expect(
      await testDb.auditLog.count({
        where: { subjectId: id, action: { startsWith: "experience.review." } },
      }),
    ).toBe(0);
  });

  it("surfaces the decision in the review history", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context());
    const view = await ops.getExperience(operator, id);

    const decision = view.history.find((event) => event.action === "experience.review.approve");
    expect(decision?.actorEmail).toBe(operator.email);
    expect(decision?.fromStatus).toBe("IN_REVIEW");
    expect(decision?.toStatus).toBe("PUBLISHED");
  });

  it("shows the decision on the overview activity feed", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context());
    const { recentActivity } = await ops.overview(operator);

    expect(recentActivity.some((event) => event.action === "experience.review.approve")).toBe(true);
    // Logins and registrations are not review activity.
    expect(recentActivity.some((event) => event.action.startsWith("auth."))).toBe(false);
  });
});

// ── Search, filtering, paging ──────────────────────────────────────────────

describe("search and filtering", () => {
  it("filters by status", async () => {
    const owner = await makeHost();
    const submitted = await submittedExperience(owner, "A submitted experience");
    await experiences.createDraft(
      owner.principal,
      owner.host,
      { title: "A draft experience" },
      context(),
    );

    const operator = await signIn("operations");

    const inReview = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 20,
      status: "IN_REVIEW",
    });
    expect(inReview.items.map((item) => item.id)).toEqual([submitted]);

    const drafts = await ops.listExperiences(operator, { page: 1, pageSize: 20, status: "DRAFT" });
    expect(drafts.items.every((item) => item.status === "DRAFT")).toBe(true);
  });

  it("searches by title, city and host name", async () => {
    const owner = await makeHost();
    await submittedExperience(owner, "Hand-block printing in Bagru");
    const operator = await signIn("operations");

    const byTitle = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 20,
      search: "block printing",
    });
    expect(byTitle.items.some((item) => item.title.includes("Hand-block"))).toBe(true);

    const byCity = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 20,
      search: "karaikudi",
    });
    expect(byCity.total).toBeGreaterThan(0);

    const byHost = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 20,
      search: owner.host.displayName,
    });
    expect(byHost.total).toBeGreaterThan(0);
  });

  it("searches case-insensitively across the citext email columns", async () => {
    // users.email is citext, and Prisma casts the operand to text for
    // `contains` — which silently makes the match case-sensitive without an
    // explicit insensitive mode. Documented in docs/DATABASE.md.
    const applicant = await submittedHost();
    const operator = await signIn("operations");

    const account = await testDb.user.findUniqueOrThrow({
      where: { id: applicant.host.userId },
      select: { email: true },
    });

    const found = await ops.listHosts(operator, {
      page: 1,
      pageSize: 20,
      search: account.email.toUpperCase(),
    });

    expect(found.items.some((item) => item.id === applicant.host.id)).toBe(true);
  });

  it("returns nothing rather than everything for a term that matches nothing", async () => {
    const owner = await makeHost();
    await submittedExperience(owner);
    const operator = await signIn("operations");

    const page = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 20,
      search: "zzz-no-such-listing-zzz",
    });

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("pages without overlapping or dropping rows", async () => {
    const owner = await makeHost();
    for (let i = 0; i < 5; i += 1) {
      await experiences.createDraft(
        owner.principal,
        owner.host,
        { title: `Paged listing number ${i}` },
        context(),
      );
    }

    const operator = await signIn("operations");
    const filters = { pageSize: 2, hostId: owner.host.id } as const;

    const first = await ops.listExperiences(operator, { ...filters, page: 1 });
    const second = await ops.listExperiences(operator, { ...filters, page: 2 });
    const third = await ops.listExperiences(operator, { ...filters, page: 3 });

    expect(first.total).toBe(5);
    expect(first.totalPages).toBe(3);
    expect(third.items).toHaveLength(1);

    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("counts the whole result set, not the page", async () => {
    const owner = await makeHost();
    for (let i = 0; i < 3; i += 1) {
      await experiences.createDraft(
        owner.principal,
        owner.host,
        { title: `Counted listing number ${i}` },
        context(),
      );
    }

    const operator = await signIn("operations");
    const page = await ops.listExperiences(operator, {
      page: 1,
      pageSize: 1,
      hostId: owner.host.id,
    });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it("counts the queue accurately on the overview", async () => {
    const ownerA = await makeHost();
    const ownerB = await makeHost();
    await submittedExperience(ownerA, "First submitted listing");
    await submittedExperience(ownerB, "Second submitted listing");
    await submittedHost();

    const operator = await signIn("operations");
    const { summary } = await ops.overview(operator);

    expect(summary.experiencesInReview).toBe(2);
    expect(summary.hostsPending).toBeGreaterThanOrEqual(1);
    expect(summary.oldestSubmissionAt).not.toBeNull();
  });
});

// ── Regression ─────────────────────────────────────────────────────────────

describe("existing flows still work", () => {
  it("keeps host ownership boundaries intact", async () => {
    const owner = await makeHost();
    const stranger = await makeHost();
    const id = await submittedExperience(owner);

    await expect(experiences.getOwn(stranger.principal, stranger.host, id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("keeps a published listing out of the host's own edit path", async () => {
    const owner = await makeHost();
    const id = await submittedExperience(owner);
    const operator = await signIn("operations");

    await ops.decideOnExperience(operator, { id, decision: "approve", note: null }, context());

    await expect(
      experiences.updateContent(owner.principal, owner.host, id, { city: "Madurai" }),
    ).rejects.toThrow(ConflictError);
  });

  it("still authenticates a traveller with an emailed code", async () => {
    const email = testEmail("traveller");
    await auth.register({ email, role: "traveller", context: authContext() });

    let delivered: string | null = null;
    const withCapture = new AuthService({
      users: createUserRepository(testDb),
      sessions: createSessionRepository(testDb),
      otps: createOtpRepository(testDb),
      rateLimiter: createRateLimiter(testDb),
      audit: createAuditRepository(testDb),
      now: () => clock,
      deliverOtp: async (_to, code) => {
        delivered = code;
      },
    });

    await withCapture.requestLoginOtp({ email, context: authContext() });
    expect(delivered).not.toBeNull();

    const session = await withCapture.verifyLoginOtp({
      email,
      code: delivered as unknown as string,
      context: authContext(),
    });

    expect(session.token).toBeTruthy();
  });
});
