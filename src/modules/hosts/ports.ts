import type { HostProfileDraft, HostType, HostVerificationStatus } from "@/modules/hosts/profile";

/** Persistence ports the host domain owns. Prisma implementations live in src/adapters. */

export interface HostRecord extends HostProfileDraft {
  readonly id: string;
  readonly userId: string;
  readonly verificationStatus: HostVerificationStatus;
  readonly submittedAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateHostInput {
  readonly userId: string;
  readonly displayName: string;
  readonly hostType: HostType;
  readonly contactEmail: string | null;
}

/** Every field a host may change. Absent keys are left alone. */
export type UpdateHostInput = Partial<Omit<HostProfileDraft, "displayName">> & {
  readonly displayName?: string;
};

export interface HostRepository {
  findByUserId(userId: string): Promise<HostRecord | null>;
  findById(id: string): Promise<HostRecord | null>;
  create(input: CreateHostInput): Promise<HostRecord>;
  update(id: string, input: UpdateHostInput): Promise<HostRecord>;
  markSubmitted(id: string, at: Date): Promise<HostRecord>;
}
