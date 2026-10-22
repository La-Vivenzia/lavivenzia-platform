import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/db";
import {
  createDiscoveryRepository,
  isDatabaseUnreachable,
} from "@/adapters/persistence/prisma/discovery-repositories";
import { createPilotDiscoveryRepository } from "@/adapters/persistence/prisma/pilot-discovery-fallback";
import { PILOT_EXPERIENCES } from "@/data/pune-pilot";
import { CATEGORY_KEYS } from "@/modules/experiences/categories";

/**
 * Discovery's offline fallback.
 *
 * Two properties matter. It must engage on a connection failure and on
 * nothing else — a query bug or a bad credential hidden behind a working-looking
 * page is worse than a crash. And it must stay off unless the caller asks for
 * it, which is what keeps it out of production.
 */

const urlFor = (key: string) => `https://cdn.test/${key}`;

function refused(): Error {
  return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
}

/** A client whose every read fails with `error`, counting how often it was asked. */
function failingPrisma(error: unknown) {
  const calls = { count: 0 };
  const fail = () => {
    calls.count += 1;
    return Promise.reject(error);
  };

  const prisma = {
    experience: { findMany: fail, findFirst: fail, groupBy: fail },
    category: { findMany: fail },
    $queryRaw: fail,
  } as unknown as PrismaClient;

  return { prisma, calls };
}

describe("isDatabaseUnreachable", () => {
  it("recognises Prisma's unreachable and timeout codes", () => {
    for (const code of ["P1001", "P1002", "P1008", "P1017"]) {
      expect(isDatabaseUnreachable({ code })).toBe(true);
    }
    expect(isDatabaseUnreachable({ errorCode: "P1001" })).toBe(true);
  });

  it("recognises a raw socket error, directly or as a cause", () => {
    expect(isDatabaseUnreachable(refused())).toBe(true);
    expect(isDatabaseUnreachable(new Error("wrapped", { cause: refused() }))).toBe(true);
  });

  it("recognises one refusal per address inside an AggregateError", () => {
    // What Node raises when `localhost` resolves to both ::1 and 127.0.0.1.
    expect(isDatabaseUnreachable(new AggregateError([refused(), refused()]))).toBe(true);
  });

  it("recognises the driver adapter's own error kind", () => {
    expect(isDatabaseUnreachable({ cause: { kind: "DatabaseNotReachable" } })).toBe(true);
  });

  it("does not treat misconfiguration or query errors as an outage", () => {
    expect(isDatabaseUnreachable({ code: "P1000" })).toBe(false); // bad credentials
    expect(isDatabaseUnreachable({ code: "P1003" })).toBe(false); // no such database
    expect(isDatabaseUnreachable({ code: "P2002" })).toBe(false);
    expect(isDatabaseUnreachable(new Error("syntax error at or near"))).toBe(false);
    expect(isDatabaseUnreachable(null)).toBe(false);
    expect(isDatabaseUnreachable("ECONNREFUSED")).toBe(false);
  });

  it("terminates on a cyclic cause chain", () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(isDatabaseUnreachable(a)).toBe(false);
  });
});

describe("createDiscoveryRepository offline fallback", () => {
  it("is off unless asked for, so an outage still throws", async () => {
    const { prisma } = failingPrisma(refused());
    const repository = createDiscoveryRepository(prisma, urlFor);

    await expect(repository.featuredExperiences(3)).rejects.toThrow("ECONNREFUSED");
  });

  it("serves the pilot catalogue when the database is unreachable", async () => {
    const { prisma } = failingPrisma(refused());
    const onFallback = vi.fn();
    const repository = createDiscoveryRepository(prisma, urlFor, {
      offlineFallback: { onFallback },
    });

    const featured = await repository.featuredExperiences(3);

    expect(featured.map((item) => item.slug)).toEqual(
      PILOT_EXPERIENCES.slice(0, 3).map((input) => input.slug),
    );
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("rethrows anything that is not a connection failure", async () => {
    const { prisma } = failingPrisma(Object.assign(new Error("bad query"), { code: "P2010" }));
    const onFallback = vi.fn();
    const repository = createDiscoveryRepository(prisma, urlFor, {
      offlineFallback: { onFallback },
    });

    await expect(repository.listCategories()).rejects.toThrow("bad query");
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("stops asking the database briefly, then tries it again", async () => {
    const { prisma, calls } = failingPrisma(refused());
    let clock = 1_000_000;
    const repository = createDiscoveryRepository(prisma, urlFor, {
      offlineFallback: { now: () => clock },
    });

    await repository.listDestinations();
    const afterFirst = calls.count;

    clock += 5_000;
    await repository.listDestinations();
    expect(calls.count).toBe(afterFirst);

    clock += 15_000;
    await repository.listDestinations();
    expect(calls.count).toBeGreaterThan(afterFirst);
  });
});

describe("createPilotDiscoveryRepository", () => {
  const repository = createPilotDiscoveryRepository(urlFor);
  const amanora = { latitude: 18.518012, longitude: 73.934521 };

  it("only uses categories that exist in the taxonomy", () => {
    for (const input of PILOT_EXPERIENCES) {
      expect(CATEGORY_KEYS).toContain(input.categoryKey);
    }
  });

  it("carries the seeded price and duration unchanged", async () => {
    const input = PILOT_EXPERIENCES[0]!;
    const detail = await repository.findExperienceBySlug(input.slug);

    expect(detail?.basePriceMinor).toBe(input.basePriceMinor);
    expect(detail?.durationMinutes).toBe(input.durationMinutes);
    expect(detail?.currency).toBe("INR");
    expect(detail?.coverUrl).toBe(urlFor(input.coverImageKey));
    expect(await repository.findExperienceBySlug("not-a-listing")).toBeNull();
  });

  it("derives Pune as the one destination", async () => {
    const destinations = await repository.listDestinations();

    expect(destinations).toEqual([
      expect.objectContaining({ slug: "pune", experienceCount: PILOT_EXPERIENCES.length }),
    ]);
    expect(await repository.findDestination("pune")).not.toBeNull();
    expect(await repository.findDestination("goa")).toBeNull();
  });

  it("lists only categories with something in them", async () => {
    const categories = await repository.listCategories();
    const total = categories.reduce((sum, category) => sum + category.experienceCount, 0);

    expect(total).toBe(PILOT_EXPERIENCES.length);
    expect(categories.every((category) => category.experienceCount > 0)).toBe(true);
  });

  it("filters by radius and orders by distance", async () => {
    const page = await repository.listExperiences({
      near: { ...amanora, radiusMetres: 2_000 },
      sort: "distance",
      page: 1,
      pageSize: 50,
    });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(PILOT_EXPERIENCES.length);

    const distances = page.items.map((item) => item.distanceMetres!);
    expect(distances.every((distance) => distance <= 2_000)).toBe(true);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("matches keywords case-insensitively and pages the result", async () => {
    const search = await repository.listExperiences({ search: "BOWLING", page: 1, pageSize: 20 });
    expect(search.items.some((item) => item.slug === "smaaash-vr-twilight-bowling-amanora")).toBe(
      true,
    );

    const firstPage = await repository.listExperiences({ page: 1, pageSize: 4 });
    expect(firstPage.items).toHaveLength(4);
    expect(firstPage.total).toBe(PILOT_EXPERIENCES.length);
  });

  it("matches nothing for an unknown destination rather than everything", async () => {
    const page = await repository.listExperiences({
      destinationSlug: "goa",
      page: 1,
      pageSize: 20,
    });

    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });
});
