import type { PrismaClient } from "@/lib/db";
import type {
  CategoryRepository,
  ExperienceContentInput,
  ExperienceListItem,
  ExperienceRecord,
  ExperienceRepository,
  MediaRecord,
} from "@/modules/experiences/ports";
import type { ExperienceStatus } from "@/modules/experiences/lifecycle";

/**
 * Prisma implementations of the experience and category ports.
 *
 * The media URL is not stored — it is derived from the storage key by the
 * storage adapter. Persisting a URL would freeze today's bucket and today's CDN
 * into every row, and moving either would mean a data migration rather than a
 * configuration change.
 */

type MediaRow = {
  id: string;
  experienceId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  altText: string | null;
  position: number;
};

/** Turns a storage key into something a browser can fetch. */
export type UrlResolver = (storageKey: string) => string;

function toMedia(row: MediaRow, urlFor: UrlResolver): MediaRecord {
  return {
    id: row.id,
    experienceId: row.experienceId,
    storageKey: row.storageKey,
    url: urlFor(row.storageKey),
    contentType: row.contentType,
    byteSize: row.byteSize,
    altText: row.altText,
    position: row.position,
  };
}

/**
 * Prisma returns `Decimal` for numeric columns. Coordinates are converted to
 * numbers at this boundary so the domain never handles a driver type — six
 * decimal places is roughly 11 cm, comfortably inside double precision.
 */
function toNumber(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

const MEDIA_SELECT = {
  id: true,
  experienceId: true,
  storageKey: true,
  contentType: true,
  byteSize: true,
  altText: true,
  position: true,
} as const;

export function createExperienceRepository(
  prisma: PrismaClient,
  urlFor: UrlResolver,
): ExperienceRepository {
  type FullRow = NonNullable<Awaited<ReturnType<typeof findFull>>>;

  async function findFull(id: string, hostId: string) {
    return prisma.experience.findFirst({
      // Both predicates in one query. An ownership check issued as a second
      // query is a check somebody can forget; here it is part of the lookup.
      where: { id, hostId },
      include: { media: { select: MEDIA_SELECT, orderBy: { position: "asc" } } },
    });
  }

  function toRecord(row: FullRow): ExperienceRecord {
    return {
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
      media: row.media.map((media) => toMedia(media, urlFor)),
    };
  }

  return {
    async findByIdForHost(id, hostId) {
      const row = await findFull(id, hostId);
      return row ? toRecord(row) : null;
    },

    async listForHost(hostId, options) {
      // One query, not one plus one per row: the cover image and the gallery
      // count both come back on the join. A dashboard listing twenty experiences
      // issues a single statement.
      const rows = await prisma.experience.findMany({
        where: { hostId, ...(options?.status ? { status: options.status } : {}) },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          status: true,
          city: true,
          basePriceMinor: true,
          currency: true,
          updatedAt: true,
          media: { select: { storageKey: true }, orderBy: { position: "asc" }, take: 1 },
          _count: { select: { media: true } },
        },
      });

      return rows.map((row): ExperienceListItem => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        status: row.status,
        city: row.city,
        basePriceMinor: row.basePriceMinor,
        currency: row.currency,
        updatedAt: row.updatedAt,
        coverUrl: row.media[0] ? urlFor(row.media[0].storageKey) : null,
        mediaCount: row._count.media,
      }));
    },

    countForHost(hostId) {
      return prisma.experience.count({ where: { hostId, status: { not: "ARCHIVED" } } });
    },

    async isSlugTaken(slug) {
      const found = await prisma.experience.findUnique({ where: { slug }, select: { id: true } });
      return found !== null;
    },

    async create(input) {
      const row = await prisma.experience.create({
        data: { hostId: input.hostId, slug: input.slug, title: input.title },
        include: { media: { select: MEDIA_SELECT, orderBy: { position: "asc" } } },
      });
      return toRecord(row);
    },

    async updateContent(id, input: ExperienceContentInput) {
      const { categoryId, languages, inclusions, exclusions, ...scalars } = input;

      const row = await prisma.experience.update({
        where: { id },
        data: {
          ...scalars,
          // Scalar lists arrive readonly from the domain; Prisma wants mutable
          // arrays. Copied rather than cast, so nothing downstream can mutate
          // the caller's array.
          ...(languages ? { languages: [...languages] } : {}),
          ...(inclusions ? { inclusions: [...inclusions] } : {}),
          ...(exclusions ? { exclusions: [...exclusions] } : {}),
          // Expressed as a relation rather than a raw foreign key: Prisma types
          // `categoryId` and `category` as mutually exclusive update styles, and
          // clearing a category is a disconnect rather than a null assignment.
          ...(categoryId === undefined
            ? {}
            : categoryId === null
              ? { category: { disconnect: true } }
              : { category: { connect: { id: categoryId } } }),
        },
        include: { media: { select: MEDIA_SELECT, orderBy: { position: "asc" } } },
      });

      return toRecord(row);
    },

    async updateStatus(id, input) {
      const row = await prisma.experience.update({
        where: { id },
        data: {
          status: input.status as ExperienceStatus,
          ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
          ...(input.publishedAt !== undefined ? { publishedAt: input.publishedAt } : {}),
        },
        include: { media: { select: MEDIA_SELECT, orderBy: { position: "asc" } } },
      });
      return toRecord(row);
    },

    async addMedia(input) {
      const row = await prisma.experienceMedia.create({
        data: {
          experienceId: input.experienceId,
          storageKey: input.storageKey,
          contentType: input.contentType,
          byteSize: input.byteSize,
          position: input.position,
        },
        select: MEDIA_SELECT,
      });
      return toMedia(row, urlFor);
    },

    async updateMedia(id, experienceId, input) {
      // updateMany rather than update: it scopes by experience as well as by id,
      // so a media id from another listing matches nothing instead of being
      // updated. `update` would need a separate ownership read first.
      const result = await prisma.experienceMedia.updateMany({
        where: { id, experienceId },
        data: { ...input },
      });

      if (result.count === 0) return null;

      const row = await prisma.experienceMedia.findUnique({ where: { id }, select: MEDIA_SELECT });
      return row ? toMedia(row, urlFor) : null;
    },

    async removeMedia(id, experienceId) {
      const row = await prisma.experienceMedia.findFirst({
        where: { id, experienceId },
        select: { id: true, storageKey: true },
      });

      if (!row) return null;

      await prisma.experienceMedia.delete({ where: { id: row.id } });
      return row.storageKey;
    },

    async nextMediaPosition(experienceId) {
      const result = await prisma.experienceMedia.aggregate({
        where: { experienceId },
        _max: { position: true },
      });

      // Append after the highest existing position. Starting from -1 makes the
      // first image position 0, which is the cover.
      return (result._max.position ?? -1) + 1;
    },
  };
}

export function createCategoryRepository(prisma: PrismaClient): CategoryRepository {
  return {
    async listActive() {
      return prisma.category.findMany({
        where: { isActive: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: { id: true, key: true, name: true, description: true },
      });
    },

    async exists(id) {
      const found = await prisma.category.findFirst({
        where: { id, isActive: true },
        select: { id: true },
      });
      return found !== null;
    },
  };
}
