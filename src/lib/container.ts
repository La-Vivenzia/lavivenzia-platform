import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AuthService } from "@/modules/auth/service";
import { OTP_TTL_MS } from "@/modules/auth/otp";
import { HostService } from "@/modules/hosts/service";
import { ExperienceService } from "@/modules/experiences/service";
import { AvailabilityService } from "@/modules/availability/service";
import { OperationsService } from "@/modules/operations/service";
import { DiscoveryService } from "@/modules/discovery/service";
import type { EmailPort } from "@/ports/email";
import type { StoragePort } from "@/ports/storage";
import type { MapsPort } from "@/ports/maps";
import { createEmailAdapter } from "@/adapters/email";
import { createStorageAdapter } from "@/adapters/storage";
import { createMapsAdapter } from "@/adapters/maps";
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
import { PrismaSlotRepository } from "@/adapters/persistence/prisma/availability-repositories";
import { createOperationsRepository } from "@/adapters/persistence/prisma/operations-repositories";
import { createDiscoveryRepository } from "@/adapters/persistence/prisma/discovery-repositories";

/**
 * Composition root.
 *
 * The one place allowed to know both the domain and its concrete adapters.
 * Everything else depends on interfaces, which is what keeps `src/modules`
 * free of driver imports (ADR-0002).
 */

let emailPort: EmailPort | undefined;

/**
 * The transactional email transport.
 *
 * Built once, on first use. `createEmailAdapter` refuses an impossible
 * configuration — the console transport in production, or SES with no verified
 * sender — so the first send fails at wiring with a clear message rather than
 * on a real traveller's login attempt.
 */
function getEmailPort(): EmailPort {
  emailPort ??= createEmailAdapter();
  return emailPort;
}

/** Derived from the code's own lifetime, so the email can never contradict it. */
const OTP_TTL_MINUTES = Math.round(OTP_TTL_MS / 60_000);

/**
 * Deliver a login code.
 *
 * Sent inline rather than queued (ADR-0011): the traveller is waiting on this
 * exact message, and routing it through the worker would make login depend on a
 * second process being healthy.
 *
 * A provider failure propagates. The endpoint returns an error and the
 * traveller can retry, which is the honest outcome — swallowing it would return
 * 202 to someone who will never receive a code.
 */
async function deliverOtp(email: string, code: string): Promise<void> {
  await getEmailPort().send({
    to: email,
    template: "auth.login-code",
    variables: { code, expiresInMinutes: OTP_TTL_MINUTES },
  });
}

let authService: AuthService | undefined;

export function getAuthService(): AuthService {
  authService ??= new AuthService({
    users: createUserRepository(prisma),
    sessions: createSessionRepository(prisma),
    otps: createOtpRepository(prisma),
    rateLimiter: createRateLimiter(prisma),
    audit: createAuditRepository(prisma),
    now: () => new Date(),
    deliverOtp,
  });

  return authService;
}

// ── Hosts and inventory ────────────────────────────────────────────────────

let storage: StoragePort | undefined;

/**
 * Object storage for experience media.
 *
 * Built once. `createStorageAdapter` refuses local storage in production, where
 * an ephemeral container filesystem would lose every upload on the next deploy.
 */
function getStorage(): StoragePort {
  storage ??= createStorageAdapter();
  return storage;
}

let hostService: HostService | undefined;

export function getHostService(): HostService {
  hostService ??= new HostService({
    hosts: createHostRepository(prisma),
    audit: createAuditRepository(prisma),
    now: () => new Date(),
  });

  return hostService;
}

let availabilityService: AvailabilityService | undefined;

/**
 * Availability (FR-08).
 *
 * Shares the experience repository so ownership is resolved exactly once, by
 * the same query the rest of the host surface uses. A second notion of "does
 * this host own this experience" is how the two drift apart.
 */
export function getAvailabilityService(): AvailabilityService {
  availabilityService ??= new AvailabilityService({
    slots: new PrismaSlotRepository(prisma),
    experiences: createExperienceRepository(prisma, (key) => getStorage().publicUrl(key)),
    now: () => new Date(),
  });

  return availabilityService;
}

let experienceService: ExperienceService | undefined;

export function getExperienceService(): ExperienceService {
  experienceService ??= new ExperienceService({
    // The URL for a stored object is derived by the storage adapter rather than
    // persisted, so moving bucket or CDN is a configuration change instead of a
    // data migration.
    experiences: createExperienceRepository(prisma, (key) => getStorage().publicUrl(key)),
    categories: createCategoryRepository(prisma),
    storage: getStorage(),
    audit: createAuditRepository(prisma),
    rateLimiter: createRateLimiter(prisma),
    now: () => new Date(),
  });

  return experienceService;
}

let operationsService: OperationsService | undefined;

export function getOperationsService(): OperationsService {
  operationsService ??= new OperationsService({
    operations: createOperationsRepository(prisma, (key) => getStorage().publicUrl(key)),
    audit: createAuditRepository(prisma),
    now: () => new Date(),
  });

  return operationsService;
}

let discoveryService: DiscoveryService | undefined;

/**
 * Traveller discovery.
 *
 * Takes no principal: everything it can reach is already published. The
 * repository hard-codes the status filter, so there is no configuration here
 * that could widen what the public site can see.
 */
export function getDiscoveryService(): DiscoveryService {
  discoveryService ??= new DiscoveryService({
    discovery: createDiscoveryRepository(prisma, (key) => getStorage().publicUrl(key)),
  });

  return discoveryService;
}

let mapsPort: MapsPort | undefined;

/**
 * Location search and geocoding (FR-03).
 *
 * Built once. `createMapsAdapter` selects Google when a key is configured and
 * the catalogue provider otherwise, so an absent key degrades reach rather than
 * breaking the endpoint — unlike email, location search has a real fallback and
 * is not permitted to fail at wiring.
 */
export function getMapsPort(): MapsPort {
  mapsPort ??= createMapsAdapter();
  return mapsPort;
}

export { env };
