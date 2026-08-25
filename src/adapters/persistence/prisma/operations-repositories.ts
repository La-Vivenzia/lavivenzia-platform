import type { PrismaClient } from "@/lib/db";
import type { ExperienceStatus } from "@/modules/experiences/lifecycle";
import type { UrlResolver } from "@/adapters/persistence/prisma/experience-repositories";
import type {
  ExperienceDetail,
  ExperienceFilters,
  ExperienceQueueItem,
  HostDetail,
  HostFilters,
  HostQueueItem,
  OperationsRepository,
  OperationsSummary,
  Page,
  ReviewEvent,
} from "@/modules/operations/ports";

/**
 * Prisma implementation of the operations port.
 *
 * Two things this file is careful about.
 *
 * **No N+1.** Every list resolves its related data — host name, category,
 * cover image, counts — through `include`/`select` on the same statement.
 * A twenty-row page issues two queries: the page and its count.
 *
 * **Server-side everything.** Filtering, ordering and paging all happen in
 * PostgreSQL. Nothing loads a table into memory to slice it.
 */

function toNumber(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

/** JSON snapshots in the audit log are `unknown`; read one field defensively. */
function readField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : null;
}

export function createOperationsRepository(
  prisma: PrismaClient,
  urlFor: UrlResolver,
): OperationsRepository {
  /**
   * Turn free text into a Prisma filter.
   *
   * `mode: "insensitive"` is not optional on the email columns: they are
   * `citext`, and Prisma casts the operand to `text` for `contains`, which
   * defeats citext and makes the match case-sensitive. Documented in
   * docs/DATABASE.md under Known traps; this is the second place it bites.
   */
  const like = (term: string) => ({ contains: term, mode: "insensitive" as const });

  function experienceWhere(filters: ExperienceFilters) {
    const term = filters.search?.trim();

    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.hostId ? { hostId: filters.hostId } : {}),
      ...(filters.city ? { city: like(filters.city) } : {}),
      ...(filters.submittedFrom || filters.submittedTo
        ? {
            submittedAt: {
              ...(filters.submittedFrom ? { gte: filters.submittedFrom } : {}),
              ...(filters.submittedTo ? { lte: filters.submittedTo } : {}),
            },
          }
        : {}),
      ...(term
        ? {
            OR: [
              { title: like(term) },
              { city: like(term) },
              { host: { displayName: like(term) } },
            ],
          }
        : {}),
    };
  }

  function hostWhere(filters: HostFilters) {
    const term = filters.search?.trim();

    return {
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.createdFrom || filters.createdTo
        ? {
            createdAt: {
              ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
              ...(filters.createdTo ? { lte: filters.createdTo } : {}),
            },
          }
        : {}),
      ...(term
        ? {
            OR: [
              { displayName: like(term) },
              { legalName: like(term) },
              { city: like(term) },
              { contactEmail: like(term) },
              // The sign-in address, which is what operations usually has.
              { user: { email: like(term) } },
            ],
          }
        : {}),
    };
  }

  return {
    async summary(): Promise<OperationsSummary> {
      // Grouped aggregates rather than one count per status: five figures, two
      // statements, and adding a status later needs no new query.
      const [byStatus, hostsPending, oldest] = await Promise.all([
        prisma.experience.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.host.count({ where: { verificationStatus: "PENDING" } }),
        prisma.experience.findFirst({
          where: { status: "IN_REVIEW", submittedAt: { not: null } },
          orderBy: { submittedAt: "asc" },
          select: { submittedAt: true },
        }),
      ]);

      const count = (status: ExperienceStatus): number =>
        byStatus.find((row) => row.status === status)?._count._all ?? 0;

      return {
        hostsPending,
        experiencesInReview: count("IN_REVIEW"),
        experiencesPublished: count("PUBLISHED"),
        experiencesRejected: count("REJECTED"),
        experiencesSuspended: count("SUSPENDED"),
        oldestSubmissionAt: oldest?.submittedAt ?? null,
      };
    },

    async listExperiences(filters): Promise<Page<ExperienceQueueItem>> {
      const where = experienceWhere(filters);
      const skip = (filters.page - 1) * filters.pageSize;

      const [rows, total] = await Promise.all([
        prisma.experience.findMany({
          where,
          // Oldest submission first: a review queue is a queue. Anything else
          // and the item that has waited longest is the one nobody sees.
          orderBy: [{ submittedAt: "asc" }, { updatedAt: "desc" }],
          skip,
          take: filters.pageSize,
          select: {
            id: true,
            title: true,
            summary: true,
            status: true,
            city: true,
            basePriceMinor: true,
            currency: true,
            submittedAt: true,
            updatedAt: true,
            category: { select: { name: true } },
            host: { select: { id: true, displayName: true, verificationStatus: true } },
            media: { select: { storageKey: true }, orderBy: { position: "asc" }, take: 1 },
          },
        }),
        prisma.experience.count({ where }),
      ]);

      return {
        items: rows.map((row): ExperienceQueueItem => ({
          id: row.id,
          title: row.title,
          summary: row.summary,
          status: row.status,
          city: row.city,
          categoryName: row.category?.name ?? null,
          basePriceMinor: row.basePriceMinor,
          currency: row.currency,
          coverUrl: row.media[0] ? urlFor(row.media[0].storageKey) : null,
          submittedAt: row.submittedAt,
          updatedAt: row.updatedAt,
          hostId: row.host.id,
          hostName: row.host.displayName,
          hostVerification: row.host.verificationStatus,
        })),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      };
    },

    async findExperience(id): Promise<ExperienceDetail | null> {
      const row = await prisma.experience.findUnique({
        where: { id },
        include: {
          category: { select: { name: true } },
          media: {
            select: {
              id: true,
              experienceId: true,
              storageKey: true,
              contentType: true,
              byteSize: true,
              altText: true,
              position: true,
            },
            orderBy: { position: "asc" },
          },
          host: { include: { user: { select: { email: true } } } },
          reviewer: { select: { id: true, email: true } },
        },
      });

      if (!row) return null;

      return {
        experience: {
          id: row.id,
          hostId: row.hostId,
          slug: row.slug,
          title: row.title,
          summary: row.summary,
          description: row.description,
          categoryId: row.categoryId,
          status: row.status,
          addressLine: row.addressLine,
          city: row.city,
          region: row.region,
          country: row.country,
          postalCode: row.postalCode,
          latitude: toNumber(row.latitude),
          longitude: toNumber(row.longitude),
          durationMinutes: row.durationMinutes,
          minGuests: row.minGuests,
          maxGuests: row.maxGuests,
          languages: row.languages,
          basePriceMinor: row.basePriceMinor,
          currency: row.currency,
          pricingUnit: row.pricingUnit,
          inclusions: row.inclusions,
          exclusions: row.exclusions,
          guestNotes: row.guestNotes,
          submittedAt: row.submittedAt,
          reviewedAt: row.reviewedAt,
          reviewNote: row.reviewNote,
          publishedAt: row.publishedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          media: row.media.map((media) => ({
            id: media.id,
            experienceId: media.experienceId,
            storageKey: media.storageKey,
            url: urlFor(media.storageKey),
            contentType: media.contentType,
            byteSize: media.byteSize,
            altText: media.altText,
            position: media.position,
          })),
        },
        categoryName: row.category?.name ?? null,
        host: {
          id: row.host.id,
          userId: row.host.userId,
          displayName: row.host.displayName,
          legalName: row.host.legalName,
          hostType: row.host.hostType,
          contactEmail: row.host.contactEmail,
          contactPhone: row.host.contactPhone,
          websiteUrl: row.host.websiteUrl,
          headline: row.host.headline,
          about: row.host.about,
          city: row.host.city,
          region: row.host.region,
          country: row.host.country,
          verificationStatus: row.host.verificationStatus,
          submittedAt: row.host.submittedAt,
          reviewedAt: row.host.reviewedAt,
          reviewNote: row.host.reviewNote,
          createdAt: row.host.createdAt,
          updatedAt: row.host.updatedAt,
        },
        hostAccountEmail: row.host.user.email,
        reviewer: row.reviewer,
      };
    },

    async listHosts(filters): Promise<Page<HostQueueItem>> {
      const where = hostWhere(filters);
      const skip = (filters.page - 1) * filters.pageSize;

      const [rows, total] = await Promise.all([
        prisma.host.findMany({
          where,
          orderBy: [{ submittedAt: "asc" }, { createdAt: "desc" }],
          skip,
          take: filters.pageSize,
          select: {
            id: true,
            displayName: true,
            legalName: true,
            hostType: true,
            contactEmail: true,
            city: true,
            verificationStatus: true,
            submittedAt: true,
            createdAt: true,
            user: { select: { email: true } },
            _count: { select: { experiences: true } },
          },
        }),
        prisma.host.count({ where }),
      ]);

      return {
        items: rows.map((row): HostQueueItem => ({
          id: row.id,
          displayName: row.displayName,
          legalName: row.legalName,
          hostType: row.hostType,
          contactEmail: row.contactEmail,
          accountEmail: row.user.email,
          city: row.city,
          verificationStatus: row.verificationStatus,
          submittedAt: row.submittedAt,
          createdAt: row.createdAt,
          experienceCount: row._count.experiences,
        })),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      };
    },

    async findHost(id): Promise<HostDetail | null> {
      const row = await prisma.host.findUnique({
        where: { id },
        include: {
          user: { select: { email: true } },
          reviewer: { select: { id: true, email: true } },
        },
      });

      if (!row) return null;

      const grouped = await prisma.experience.groupBy({
        by: ["status"],
        where: { hostId: id },
        _count: { _all: true },
      });

      const experienceCounts: Partial<Record<ExperienceStatus, number>> = {};
      for (const entry of grouped) experienceCounts[entry.status] = entry._count._all;

      return {
        host: {
          id: row.id,
          userId: row.userId,
          displayName: row.displayName,
          legalName: row.legalName,
          hostType: row.hostType,
          contactEmail: row.contactEmail,
          contactPhone: row.contactPhone,
          websiteUrl: row.websiteUrl,
          headline: row.headline,
          about: row.about,
          city: row.city,
          region: row.region,
          country: row.country,
          verificationStatus: row.verificationStatus,
          submittedAt: row.submittedAt,
          reviewedAt: row.reviewedAt,
          reviewNote: row.reviewNote,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        accountEmail: row.user.email,
        reviewer: row.reviewer,
        experienceCounts,
      };
    },

    async historyFor(subjectType, subjectId): Promise<readonly ReviewEvent[]> {
      const rows = await prisma.auditLog.findMany({
        // Served by the existing (subject_type, subject_id) index.
        where: { subjectType, subjectId },
        orderBy: { occurredAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          before: true,
          after: true,
          occurredAt: true,
          actor: { select: { email: true } },
        },
      });

      return rows.map((row) => toReviewEvent(row));
    },

    async recentActivity(limit): Promise<readonly ReviewEvent[]> {
      const rows = await prisma.auditLog.findMany({
        // Only review decisions. The audit log also carries logins and
        // registrations, which are not what an operations overview is for.
        where: { action: { startsWith: "experience.review." } },
        orderBy: { occurredAt: "desc" },
        take: limit,
        select: {
          id: true,
          action: true,
          before: true,
          after: true,
          occurredAt: true,
          actor: { select: { email: true } },
        },
      });

      const hostRows = await prisma.auditLog.findMany({
        where: { action: { startsWith: "host.review." } },
        orderBy: { occurredAt: "desc" },
        take: limit,
        select: {
          id: true,
          action: true,
          before: true,
          after: true,
          occurredAt: true,
          actor: { select: { email: true } },
        },
      });

      // Merged and re-sorted rather than filtered with an OR: two indexed
      // prefix scans beat one scan that cannot use the index on either.
      return [...rows, ...hostRows]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, limit)
        .map((row) => toReviewEvent(row));
    },

    async recordExperienceDecision(input): Promise<void> {
      await prisma.experience.update({
        where: { id: input.id },
        data: {
          status: input.status,
          reviewedBy: input.reviewerId,
          reviewedAt: input.reviewedAt,
          reviewNote: input.note,
          // Only ever set, never cleared: `publishedAt` means "when this first
          // went live", and a suspend-then-reinstate must not rewrite it.
          ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
        },
      });
    },

    async recordHostDecision(input): Promise<void> {
      await prisma.host.update({
        where: { id: input.id },
        data: {
          verificationStatus: input.status,
          reviewedBy: input.reviewerId,
          reviewedAt: input.reviewedAt,
          reviewNote: input.note,
        },
      });
    },
  };
}

interface AuditRow {
  id: bigint;
  action: string;
  before: unknown;
  after: unknown;
  occurredAt: Date;
  actor: { email: string } | null;
}

function toReviewEvent(row: AuditRow): ReviewEvent {
  return {
    // BigInt does not survive JSON serialisation to the client.
    id: row.id.toString(),
    action: row.action,
    actorEmail: row.actor?.email ?? null,
    occurredAt: row.occurredAt,
    fromStatus: readField(row.before, "status") ?? readField(row.before, "verificationStatus"),
    toStatus: readField(row.after, "status") ?? readField(row.after, "verificationStatus"),
    note: readField(row.after, "note"),
  };
}
