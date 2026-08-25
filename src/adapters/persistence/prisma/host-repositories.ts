import type { PrismaClient } from "@/lib/db";
import type {
  CreateHostInput,
  HostRecord,
  HostRepository,
  UpdateHostInput,
} from "@/modules/hosts/ports";

/**
 * Prisma implementation of the host port.
 *
 * Takes a client rather than importing the singleton, so the integration suite
 * can bind the same code to its own database.
 */

type HostRow = {
  id: string;
  userId: string;
  displayName: string;
  legalName: string | null;
  hostType: "INDIVIDUAL" | "COMPANY";
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  headline: string | null;
  about: string | null;
  city: string | null;
  region: string | null;
  country: string;
  verificationStatus: "DRAFT" | "PENDING" | "VERIFIED" | "REJECTED";
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: HostRow): HostRecord {
  return {
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
  };
}

export function createHostRepository(prisma: PrismaClient): HostRepository {
  return {
    async findByUserId(userId) {
      const row = await prisma.host.findUnique({ where: { userId } });
      return row ? toRecord(row) : null;
    },

    async findById(id) {
      const row = await prisma.host.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async create(input: CreateHostInput) {
      const row = await prisma.host.create({
        data: {
          userId: input.userId,
          displayName: input.displayName,
          hostType: input.hostType,
          contactEmail: input.contactEmail,
        },
      });
      return toRecord(row);
    },

    async update(id, input: UpdateHostInput) {
      // Spread only the keys the caller actually supplied. Passing `undefined`
      // through would be harmless in Prisma, but building the object explicitly
      // keeps "not mentioned" and "set to null" distinguishable, which is the
      // whole point of a partial update.
      const row = await prisma.host.update({
        where: { id },
        data: { ...input },
      });
      return toRecord(row);
    },

    async markSubmitted(id, at) {
      const row = await prisma.host.update({
        where: { id },
        data: { verificationStatus: "PENDING", submittedAt: at },
      });
      return toRecord(row);
    },
  };
}
