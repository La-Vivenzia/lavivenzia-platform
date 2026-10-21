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
import { createDiscoveryRepository } from "@/adapters/persistence/prisma/discovery-repositories";
import { LocalStorageAdapter } from "@/adapters/storage/local";
import { HostService } from "@/modules/hosts/service";
import { ExperienceService } from "@/modules/experiences/service";
import { OperationsService } from "@/modules/operations/service";
import { DiscoveryService, parseFilters } from "@/modules/discovery/service";
import type { Principal } from "@/modules/auth/authorization";
import type { HostRecord } from "@/modules/hosts/ports";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { slugify } from "@/modules/experiences/slug";

/**
 * Traveller discovery against the real database.
 *
 * The assertion that carries the most weight is the negative one: **nothing
 * unpublished is reachable through any discovery method**. A draft, a listing
 * awaiting review and a suspended one are all invisible, and each is checked
 * per method rather than once — the invariant is spread across every query in
 * the repository, so it has to be verified everywhere it is spread.
 */

const PASSWORD = "a-sufficiently-long-password";
let clock = new Date("2026-08-26T12:00:00.000Z");

let auth: AuthService;
let hosts: HostService;
let experiences: ExperienceService;
let ops: OperationsService;
let discovery: DiscoveryService;
let categoryId: string;
let categoryKey: string;

let counter = 0;
const context = () => {
  counter += 1;
  return { ipAddress: `198.51.100.${(counter % 250) + 1}`, correlationId: "discovery-test" };
};
const authContext = () => ({ ...context(), userAgent: "vitest" });

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "lv-discovery-"));
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

  discovery = new DiscoveryService({ discovery: createDiscoveryRepository(testDb, urlFor) });

  const seeded = await createCategoryRepository(testDb).listActive();
  const first = seeded[0];
  if (!first) throw new Error("Categories are not seeded; run npm run db:test:setup");
  categoryId = first.id;
  categoryKey = first.key;
});

/** An operator, granted the way the bootstrap script does it. */
async function operator(): Promise<Principal> {
  const email = testEmail("operations");
  await auth.register({ email, password: PASSWORD, role: "host", context: authContext() });

  const user = await testDb.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  await createUserRepository(testDb).grantRole(user.id, "operations");

  const session = await auth.loginWithPassword({
    email,
    password: PASSWORD,
    context: authContext(),
  });
  await testDb.session.update({
    where: { id: session.sessionId },
    data: { mfaSatisfiedAt: clock },
  });

  const principal = await auth.resolvePrincipal(session.token);
  if (!principal) throw new Error("Session did not resolve");
  return principal;
}

async function makeHost(name?: string): Promise<{ principal: Principal; host: HostRecord }> {
  const principal = await auth
    .register({
      email: testEmail("host"),
      password: PASSWORD,
      role: "host",
      context: authContext(),
    })
    .then(async () => {
      const email = (
        await testDb.user.findFirstOrThrow({
          where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          select: { email: true },
        })
      ).email;
      const session = await auth.loginWithPassword({
        email,
        password: PASSWORD,
        context: authContext(),
      });
      const resolved = await auth.resolvePrincipal(session.token);
      if (!resolved) throw new Error("Session did not resolve");
      return resolved;
    });

  counter += 1;
  const view = await hosts.createProfile(
    principal,
    { displayName: name ?? `Studio ${counter}`, hostType: "INDIVIDUAL", contactEmail: null },
    context(),
  );

  return { principal, host: view.host };
}

function jpegBytes(size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

/** A listing filled in far enough to be submittable. Returns its id and slug. */
async function makeListing(
  owner: { principal: Principal; host: HostRecord },
  overrides: {
    title?: string;
    summary?: string;
    city?: string;
    basePriceMinor?: number;
    durationMinutes?: number;
    latitude?: number;
    longitude?: number;
  } = {},
): Promise<{ id: string; slug: string }> {
  const created = await experiences.createDraft(
    owner.principal,
    owner.host,
    { title: overrides.title ?? "An evening of Chettinad cooking" },
    context(),
  );
  const id = created.experience.id;

  await experiences.updateContent(owner.principal, owner.host, id, {
    summary:
      overrides.summary ?? "Cook and eat with a family who have done it for four generations.",
    description: "d".repeat(220),
    categoryId,
    city: overrides.city ?? "Karaikudi",
    region: "Tamil Nadu",
    durationMinutes: overrides.durationMinutes ?? 180,
    maxGuests: 8,
    basePriceMinor: overrides.basePriceMinor ?? 450_000,
    inclusions: ["All ingredients"],
    ...(overrides.latitude !== undefined && overrides.longitude !== undefined
      ? { latitude: overrides.latitude, longitude: overrides.longitude }
      : {}),
  });

  const media = await experiences.addMedia(owner.principal, owner.host, id, {
    bytes: jpegBytes(),
    declaredType: "image/jpeg",
  });
  await experiences.updateMedia(owner.principal, owner.host, id, media.id, {
    altText: "A brass pot over a wood fire",
  });

  return { id, slug: created.experience.slug };
}

/** Carry a listing all the way to published, through the real review workflow. */
async function publish(
  owner: { principal: Principal; host: HostRecord },
  overrides?: Parameters<typeof makeListing>[1],
): Promise<{ id: string; slug: string }> {
  const listing = await makeListing(owner, overrides);
  await experiences.performAction(owner.principal, owner.host, listing.id, "submit", context());

  const admin = await operator();
  await ops.decideOnExperience(
    admin,
    { id: listing.id, decision: "approve", note: null },
    context(),
  );

  return listing;
}

const anyPage = () => parseFilters({});

afterEach(async () => {
  clock = new Date("2026-08-26T12:00:00.000Z");
  await testDb.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN, mode: "insensitive" } },
  });
  await testDb.rateLimitCounter.deleteMany({});
});

afterAll(async () => {
  await testDb.$disconnect();
});

// ── The invariant ──────────────────────────────────────────────────────────

describe("only published listings are discoverable", () => {
  it("hides a draft from every discovery method", async () => {
    const owner = await makeHost();
    const draft = await makeListing(owner, { title: "A draft nobody should see" });

    expect((await discovery.browse(anyPage())).items.map((i) => i.id)).not.toContain(draft.id);
    expect((await discovery.featured(12)).map((i) => i.id)).not.toContain(draft.id);
    await expect(discovery.getExperience(draft.slug)).rejects.toThrow(NotFoundError);
    expect(await discovery.destinations()).toEqual([]);
    expect(await discovery.categories()).toEqual([]);
  });

  it("hides a listing that is awaiting review", async () => {
    const owner = await makeHost();
    const listing = await makeListing(owner, { title: "Submitted but not yet approved" });
    await experiences.performAction(owner.principal, owner.host, listing.id, "submit", context());

    expect((await discovery.browse(anyPage())).total).toBe(0);
    await expect(discovery.getExperience(listing.slug)).rejects.toThrow(NotFoundError);
  });

  it("hides a rejected listing", async () => {
    const owner = await makeHost();
    const listing = await makeListing(owner);
    await experiences.performAction(owner.principal, owner.host, listing.id, "submit", context());

    const admin = await operator();
    await ops.decideOnExperience(
      admin,
      { id: listing.id, decision: "reject", note: "Needs better photographs of the venue." },
      context(),
    );

    expect((await discovery.browse(anyPage())).total).toBe(0);
    await expect(discovery.getExperience(listing.slug)).rejects.toThrow(NotFoundError);
  });

  it("removes a suspended listing from discovery immediately", async () => {
    // The point of suspension: an operator takes something down and it is gone
    // from the public site, not merely flagged.
    const owner = await makeHost();
    const listing = await publish(owner);

    expect((await discovery.browse(anyPage())).total).toBe(1);

    const admin = await operator();
    await ops.decideOnExperience(
      admin,
      { id: listing.id, decision: "suspend", note: "Reported by a guest; under investigation." },
      context(),
    );

    expect((await discovery.browse(anyPage())).total).toBe(0);
    await expect(discovery.getExperience(listing.slug)).rejects.toThrow(NotFoundError);
    expect(await discovery.destinations()).toEqual([]);
  });

  it("brings a reinstated listing back", async () => {
    const owner = await makeHost();
    const listing = await publish(owner);
    const admin = await operator();

    await ops.decideOnExperience(
      admin,
      { id: listing.id, decision: "suspend", note: "Temporarily withdrawn for checking." },
      context(),
    );
    await ops.decideOnExperience(
      admin,
      { id: listing.id, decision: "reinstate", note: null },
      context(),
    );

    expect((await discovery.browse(anyPage())).total).toBe(1);
    await expect(discovery.getExperience(listing.slug)).resolves.toBeDefined();
  });

  it("hides an archived listing", async () => {
    const owner = await makeHost();
    const listing = await publish(owner);
    await experiences.performAction(owner.principal, owner.host, listing.id, "archive", context());

    expect((await discovery.browse(anyPage())).total).toBe(0);
  });
});

// ── Reading a listing ──────────────────────────────────────────────────────

describe("experience detail", () => {
  it("returns the listing a traveller needs", async () => {
    const owner = await makeHost("Chettinad Kitchen Collective");
    const listing = await publish(owner);

    const detail = await discovery.getExperience(listing.slug);

    expect(detail.slug).toBe(listing.slug);
    expect(detail.title).toBeTruthy();
    expect(detail.images).toHaveLength(1);
    expect(detail.images[0]?.url).toMatch(/^\/uploads\//);
    expect(detail.categoryName).toBeTruthy();
    expect(detail.host.displayName).toBe("Chettinad Kitchen Collective");
    expect(detail.inclusions).toContain("All ingredients");
  });

  it("never exposes the host's private contact details", async () => {
    // The host gave us an email, a phone number and possibly a legal name for
    // operations. None of it belongs on a public page, so the shape returned
    // here simply has nowhere to put it.
    const owner = await makeHost();
    await hosts.updateProfile(owner.principal, {
      contactEmail: "private@example.com",
      contactPhone: "+91 98765 43210",
      legalName: "A Private Legal Entity Pvt Ltd",
    });
    const listing = await publish(owner);

    const detail = await discovery.getExperience(listing.slug);
    const serialised = JSON.stringify(detail);

    expect(serialised).not.toContain("private@example.com");
    expect(serialised).not.toContain("98765");
    expect(serialised).not.toContain("A Private Legal Entity");
    expect(Object.keys(detail.host).sort()).toEqual([
      "about",
      "city",
      "displayName",
      "headline",
      "isVerified",
    ]);
  });

  it("rejects a malformed slug without touching the database", async () => {
    await expect(discovery.getExperience("")).rejects.toThrow(ValidationError);
    await expect(discovery.getExperience("x".repeat(500))).rejects.toThrow(ValidationError);
  });

  it("reports an unknown slug as not found", async () => {
    await expect(discovery.getExperience("no-such-experience")).rejects.toThrow(NotFoundError);
  });
});

// ── Search, filter, sort, page ─────────────────────────────────────────────

describe("search and filtering", () => {
  it("searches by title, city and host name", async () => {
    const owner = await makeHost("Bagru Textile Studio");
    await publish(owner, { title: "Hand-block printing in Bagru", city: "Bagru" });

    for (const term of ["block printing", "bagru", "Bagru Textile"]) {
      const page = await discovery.browse(parseFilters({ search: term }));
      expect(page.total, `search: ${term}`).toBeGreaterThan(0);
    }
  });

  it("returns nothing for a term that matches nothing", async () => {
    const owner = await makeHost();
    await publish(owner);

    const page = await discovery.browse(parseFilters({ search: "zzz-nothing-matches-zzz" }));
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("filters by category", async () => {
    const owner = await makeHost();
    await publish(owner);

    expect((await discovery.browse(parseFilters({ category: categoryKey }))).total).toBe(1);
    expect((await discovery.browse(parseFilters({ category: "no-such-category" }))).total).toBe(0);
  });

  it("filters by destination", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "A long lunch in the Nilgiris", city: "Ooty" });
    await publish(owner, { title: "Hand-block printing in Bagru", city: "Bagru" });

    const ooty = await discovery.browse(parseFilters({ destination: "ooty" }));
    expect(ooty.total).toBe(1);
    expect(ooty.items[0]?.city).toBe("Ooty");
  });

  it("returns nothing for a destination that does not exist", async () => {
    // Rather than silently ignoring the filter and showing everything, which
    // would be worse: the traveller believes they are seeing one city.
    const owner = await makeHost();
    await publish(owner);

    expect((await discovery.browse(parseFilters({ destination: "atlantis" }))).total).toBe(0);
  });

  it("filters by price range", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "An inexpensive morning walk", basePriceMinor: 100_000 });
    await publish(owner, { title: "A rather expensive private dinner", basePriceMinor: 900_000 });

    // Query values are major units: ₹1,000 and ₹9,000 respectively.
    expect((await discovery.browse(parseFilters({ maxPrice: "5000" }))).total).toBe(1);
    expect((await discovery.browse(parseFilters({ minPrice: "5000" }))).total).toBe(1);
    expect((await discovery.browse(parseFilters({ minPrice: "0", maxPrice: "10000" }))).total).toBe(
      2,
    );
  });

  it("filters by maximum duration", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "A short morning session", durationMinutes: 60 });
    await publish(owner, { title: "A full day in the hills", durationMinutes: 480 });

    expect((await discovery.browse(parseFilters({ maxDuration: "120" }))).total).toBe(1);
  });

  it("sorts by price in both directions", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "An inexpensive morning walk", basePriceMinor: 100_000 });
    await publish(owner, { title: "A rather expensive private dinner", basePriceMinor: 900_000 });

    const asc = await discovery.browse(parseFilters({ sort: "price_asc" }));
    const desc = await discovery.browse(parseFilters({ sort: "price_desc" }));

    expect(asc.items[0]?.basePriceMinor).toBe(100_000);
    expect(desc.items[0]?.basePriceMinor).toBe(900_000);
  });

  it("sorts by shortest duration", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "A full day in the hills", durationMinutes: 480 });
    await publish(owner, { title: "A short morning session", durationMinutes: 60 });

    const page = await discovery.browse(parseFilters({ sort: "duration_asc" }));
    expect(page.items[0]?.durationMinutes).toBe(60);
  });

  it("pages without overlapping or dropping rows", async () => {
    const owner = await makeHost();
    for (let i = 0; i < 5; i += 1) {
      await publish(owner, { title: `A published listing number ${i}` });
    }

    const first = await discovery.browse({ ...parseFilters({}), pageSize: 2, page: 1 });
    const second = await discovery.browse({ ...parseFilters({}), pageSize: 2, page: 2 });
    const third = await discovery.browse({ ...parseFilters({}), pageSize: 2, page: 3 });

    expect(first.total).toBe(5);
    expect(first.totalPages).toBe(3);
    expect(third.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items, ...third.items].map((i) => i.id)).size).toBe(
      5,
    );
  });
});

// ── Destinations and categories ────────────────────────────────────────────

describe("destinations", () => {
  it("derives destinations from published listings, with counts", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "A long lunch in the Nilgiris", city: "Ooty" });
    await publish(owner, { title: "A morning walk in the Nilgiris", city: "Ooty" });
    await publish(owner, { title: "Hand-block printing in Bagru", city: "Bagru" });

    const destinations = await discovery.destinations();
    const ooty = destinations.find((d) => d.city === "Ooty");

    expect(destinations).toHaveLength(2);
    expect(ooty?.experienceCount).toBe(2);
    expect(ooty?.slug).toBe(slugify("Ooty"));
    expect(ooty?.coverUrl).toMatch(/^\/uploads\//);
  });

  it("never lists a destination with nothing published in it", async () => {
    // A destination with no listings is a dead end for a traveller.
    const owner = await makeHost();
    await makeListing(owner, { city: "Nowhere" });

    expect((await discovery.destinations()).some((d) => d.city === "Nowhere")).toBe(false);
  });

  it("resolves a destination by slug and rejects an unknown one", async () => {
    const owner = await makeHost();
    await publish(owner, { city: "Ooty" });

    await expect(discovery.getDestination("ooty")).resolves.toMatchObject({ city: "Ooty" });
    await expect(discovery.getDestination("atlantis")).rejects.toThrow(NotFoundError);
  });
});

describe("categories", () => {
  it("lists only categories with something published, with counts", async () => {
    const owner = await makeHost();
    await publish(owner);

    const categories = await discovery.categories();
    expect(categories).toHaveLength(1);
    expect(categories[0]?.key).toBe(categoryKey);
    expect(categories[0]?.experienceCount).toBe(1);
  });
});

// ── Regression ─────────────────────────────────────────────────────────────

describe("existing flows still work", () => {
  it("leaves the host's own view of an unpublished listing intact", async () => {
    // Discovery hides it; the host still sees their own draft.
    const owner = await makeHost();
    const draft = await makeListing(owner, { title: "A draft only its host can see" });

    expect((await discovery.browse(anyPage())).total).toBe(0);

    const hostView = await experiences.getOwn(owner.principal, owner.host, draft.id);
    expect(hostView.experience.status).toBe("DRAFT");
  });

  it("leaves the operations console able to see every status", async () => {
    const owner = await makeHost();
    await makeListing(owner, { title: "A draft the console can still see" });

    const admin = await operator();
    const queue = await ops.listExperiences(admin, { page: 1, pageSize: 20, status: "DRAFT" });

    expect(queue.total).toBeGreaterThan(0);
    // And discovery still cannot.
    expect((await discovery.browse(anyPage())).total).toBe(0);
  });
});

// ── Location and proximity (FR-03) ─────────────────────────────────────────

/**
 * Real coordinates, at three deliberately different scales from Jaipur:
 * Bagru is about 30 km away, Delhi about 240 km, and Ooty about 1,900 km.
 *
 * The spread is what makes these assertions load-bearing. A query that confused
 * metres with kilometres, or swapped latitude with longitude, could not satisfy
 * expectations at 30 km and 240 km simultaneously.
 *
 * Ooty is beyond `RADIUS_METRES.max`, so it is unreachable by proximity search
 * at any requested radius — which is itself worth pinning, because that ceiling
 * is a deliberate product boundary rather than an accident.
 */
const PLACES = {
  jaipur: { latitude: 26.9124, longitude: 75.7873 },
  bagru: { latitude: 26.8144, longitude: 75.5436 },
  delhi: { latitude: 28.6139, longitude: 77.209 },
  ooty: { latitude: 11.4102, longitude: 76.695 },
} as const;

describe("proximity search", () => {
  it("returns only listings inside the radius", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Block printing", city: "Bagru", ...PLACES.bagru });
    await publish(owner, { title: "Tea slopes at sunrise", city: "Ooty", ...PLACES.ooty });

    const near = await discovery.browse(
      parseFilters({
        lat: String(PLACES.jaipur.latitude),
        lng: String(PLACES.jaipur.longitude),
        radiusKm: "50",
      }),
    );

    expect(near.items.map((item) => item.title)).toEqual(["Block printing"]);
    // The total must reflect the filter, not the catalogue: a page of one out
    // of a claimed two would paginate into an empty second page.
    expect(near.total).toBe(1);
  });

  it("widens with the radius", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Block printing", city: "Bagru", ...PLACES.bagru });
    await publish(owner, { title: "Old Delhi at dawn", city: "Delhi", ...PLACES.delhi });

    const wide = await discovery.browse(
      parseFilters({
        lat: String(PLACES.jaipur.latitude),
        lng: String(PLACES.jaipur.longitude),
        radiusKm: "400",
      }),
    );

    expect(wide.items.map((item) => item.title).sort()).toEqual([
      "Block printing",
      "Old Delhi at dawn",
    ]);
  });

  it("clamps a radius beyond the maximum rather than honouring it", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Tea slopes at sunrise", city: "Ooty", ...PLACES.ooty });

    // Ooty is ~1,900 km from Jaipur. Asking for 5,000 km does not reach it,
    // because `RADIUS_METRES.max` caps the search at 500 km — beyond that,
    // "nearby" has stopped meaning anything and the index stops helping.
    const page = await discovery.browse(
      parseFilters({
        lat: String(PLACES.jaipur.latitude),
        lng: String(PLACES.jaipur.longitude),
        radiusKm: "5000",
      }),
    );

    expect(page.items).toEqual([]);
  });

  it("reports the distance in metres, ordered nearest first", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Block printing", city: "Bagru", ...PLACES.bagru });
    await publish(owner, { title: "Old Delhi at dawn", city: "Delhi", ...PLACES.delhi });

    const page = await discovery.browse(
      parseFilters({
        lat: String(PLACES.jaipur.latitude),
        lng: String(PLACES.jaipur.longitude),
        radiusKm: "400",
        sort: "distance",
      }),
    );

    const [nearest, furthest] = page.items;
    expect(nearest?.title).toBe("Block printing");
    expect(furthest?.title).toBe("Old Delhi at dawn");

    // Metres, on the spheroid. Jaipur to Bagru is ~30 km and Jaipur to Delhi is
    // ~240 km; a result in degrees or kilometres misses these by orders of
    // magnitude rather than by a rounding error.
    expect(nearest?.distanceMetres).toBeGreaterThan(20_000);
    expect(nearest?.distanceMetres).toBeLessThan(45_000);
    expect(furthest?.distanceMetres).toBeGreaterThan(200_000);
    expect(furthest?.distanceMetres).toBeLessThan(300_000);
  });

  it("excludes a listing that has no coordinates", async () => {
    const owner = await makeHost();
    // Published and otherwise complete, but the host never gave a point.
    await publish(owner, { title: "Somewhere unplotted", city: "Karaikudi" });

    const page = await discovery.browse(
      parseFilters({
        lat: String(PLACES.jaipur.latitude),
        lng: String(PLACES.jaipur.longitude),
        radiusKm: "400",
      }),
    );

    // Not knowing where something is is not the same as knowing it is near.
    expect(page.items).toEqual([]);
  });

  it("leaves distance null when the search carried no location", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Block printing", city: "Bagru", ...PLACES.bagru });

    const page = await discovery.browse(anyPage());
    expect(page.items[0]?.distanceMetres).toBeNull();
  });

  it("never exposes an unpublished listing through a proximity search", async () => {
    const owner = await makeHost();
    const draft = await makeListing(owner, {
      title: "A draft with a location",
      city: "Bagru",
      ...PLACES.bagru,
    });

    const page = await discovery.browse(
      parseFilters({
        lat: String(PLACES.jaipur.latitude),
        lng: String(PLACES.jaipur.longitude),
        radiusKm: "400",
      }),
    );

    expect(page.items.map((item) => item.id)).not.toContain(draft.id);
  });
});

// ── Keyword relevance (FR-02) ──────────────────────────────────────────────

describe("keyword relevance", () => {
  it("ranks a title match above a summary match", async () => {
    const owner = await makeHost();
    await publish(owner, {
      title: "A morning with the potters",
      summary: "Throwing, trimming and firing in a working indigo studio.",
    });
    await publish(owner, {
      title: "Indigo dyeing by hand",
      summary: "A quiet afternoon at the vats, dipping and drying by hand.",
    });

    const page = await discovery.browse(parseFilters({ search: "indigo" }));

    expect(page.items).toHaveLength(2);
    // Both match; the one with it in the title is the one that was meant.
    expect(page.items[0]?.title).toBe("Indigo dyeing by hand");
  });

  it("finds a listing despite a misspelling", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Kerala backwater mornings", city: "Alleppey" });

    // Trigram similarity, not substring: "kerela" appears nowhere in the row.
    const page = await discovery.browse(parseFilters({ search: "kerela" }));

    expect(page.items.map((item) => item.title)).toContain("Kerala backwater mornings");
  });

  it("defaults to relevance when a term is given and no sort is", async () => {
    const owner = await makeHost();
    await publish(owner, {
      title: "Zzz unrelated",
      summary: "Nothing whatsoever to do with clay or with wheels.",
    });
    await publish(owner, { title: "Pottery at dawn" });

    const page = await discovery.browse(parseFilters({ search: "pottery" }));

    // Ordering by publication date would put the newer, weaker match first.
    expect(page.items[0]?.title).toBe("Pottery at dawn");
  });

  it("still returns nothing for a term that matches nothing", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Block printing", city: "Bagru" });

    const page = await discovery.browse(parseFilters({ search: "submarine welding" }));
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

// ── Paging over the new query path ─────────────────────────────────────────

describe("paging", () => {
  it("reports a total larger than the page and does not repeat rows", async () => {
    const owner = await makeHost();
    for (const index of [1, 2, 3]) {
      await publish(owner, { title: `Numbered listing ${index}` });
    }

    const first = await discovery.browse({ ...parseFilters({}), page: 1, pageSize: 2 });
    const second = await discovery.browse({ ...parseFilters({}), page: 2, pageSize: 2 });

    expect(first.total).toBe(3);
    expect(first.totalPages).toBe(2);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);

    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("wildcards in a search term", () => {
  it("treats a per cent sign as text, not as a wildcard", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Block printing", city: "Bagru" });
    await publish(owner, { title: "Pottery at dawn", city: "Jaipur" });

    // Unescaped, this pattern is "anything" and matches every published row.
    const page = await discovery.browse(parseFilters({ search: "%" }));

    expect(page.total).toBe(0);
  });

  it("finds a listing whose title genuinely contains a per cent sign", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Save 20% on a second seat" });
    await publish(owner, { title: "Block printing" });

    const page = await discovery.browse(parseFilters({ search: "20%" }));

    expect(page.items.map((item) => item.title)).toEqual(["Save 20% on a second seat"]);
  });

  it("treats an underscore as text", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Pottery at dawn" });

    // A lone underscore is "any single character" unescaped, so the pattern
    // `%_%` matches every non-empty title.
    //
    // Deliberately a lone underscore rather than something like "P_ttery":
    // that would be caught by the *fuzzy* arm of the predicate, which is the
    // feature working correctly and would make this assertion about the wrong
    // mechanism. Nothing is similar enough to a single underscore to trip it.
    const page = await discovery.browse(parseFilters({ search: "_" }));

    expect(page.items).toEqual([]);
  });

  it("still finds a near-miss spelling, which escaping must not disable", async () => {
    const owner = await makeHost();
    await publish(owner, { title: "Pottery at dawn" });

    // The guard on the guard: escaping the pattern must not have broken typo
    // tolerance, which runs on a different arm of the same predicate.
    const page = await discovery.browse(parseFilters({ search: "pottary" }));

    expect(page.items.map((item) => item.title)).toContain("Pottery at dawn");
  });
});
