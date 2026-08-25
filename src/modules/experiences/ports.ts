import type { ExperienceStatus } from "@/modules/experiences/lifecycle";
import type { PricingUnit } from "@/modules/experiences/readiness";

/** Persistence ports the experience domain owns. */

export interface MediaRecord {
  readonly id: string;
  readonly experienceId: string;
  readonly storageKey: string;
  readonly url: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly altText: string | null;
  readonly position: number;
}

export interface ExperienceRecord {
  readonly id: string;
  readonly hostId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly status: ExperienceStatus;

  readonly addressLine: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string;
  readonly postalCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;

  readonly durationMinutes: number | null;
  readonly minGuests: number;
  readonly maxGuests: number | null;
  readonly languages: readonly string[];

  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly pricingUnit: PricingUnit;

  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly guestNotes: string | null;

  readonly submittedAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  readonly media: readonly MediaRecord[];
}

/** Everything a host may edit. Absent keys are left unchanged. */
export interface ExperienceContentInput {
  readonly title?: string;
  readonly summary?: string | null;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly addressLine?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string;
  readonly postalCode?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly durationMinutes?: number | null;
  readonly minGuests?: number;
  readonly maxGuests?: number | null;
  readonly languages?: readonly string[];
  readonly basePriceMinor?: number | null;
  readonly currency?: string;
  readonly pricingUnit?: PricingUnit;
  readonly inclusions?: readonly string[];
  readonly exclusions?: readonly string[];
  readonly guestNotes?: string | null;
}

export interface ExperienceListItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly status: ExperienceStatus;
  readonly city: string | null;
  readonly basePriceMinor: number | null;
  readonly currency: string;
  readonly updatedAt: Date;
  /** Cover image only — a dashboard list must not fetch every gallery. */
  readonly coverUrl: string | null;
  readonly mediaCount: number;
}

export interface CategoryRecord {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
}

export interface ExperienceRepository {
  /**
   * Fetch by id **scoped to a host**.
   *
   * The host ID is a required argument rather than an optional filter, so a
   * caller cannot forget it and read another host's listing. An unowned or
   * missing row is the same answer — null — which is also what keeps the
   * endpoint from confirming that an id exists.
   */
  findByIdForHost(id: string, hostId: string): Promise<ExperienceRecord | null>;
  listForHost(
    hostId: string,
    options?: { readonly status?: ExperienceStatus },
  ): Promise<readonly ExperienceListItem[]>;
  countForHost(hostId: string): Promise<number>;
  isSlugTaken(slug: string): Promise<boolean>;
  create(input: {
    readonly hostId: string;
    readonly slug: string;
    readonly title: string;
  }): Promise<ExperienceRecord>;
  updateContent(id: string, input: ExperienceContentInput): Promise<ExperienceRecord>;
  updateStatus(
    id: string,
    input: {
      readonly status: ExperienceStatus;
      readonly submittedAt?: Date | null;
      readonly publishedAt?: Date | null;
    },
  ): Promise<ExperienceRecord>;

  addMedia(input: {
    readonly experienceId: string;
    readonly storageKey: string;
    readonly url: string;
    readonly contentType: string;
    readonly byteSize: number;
    readonly position: number;
  }): Promise<MediaRecord>;
  updateMedia(
    id: string,
    experienceId: string,
    input: { readonly altText?: string | null; readonly position?: number },
  ): Promise<MediaRecord | null>;
  /** Returns the removed storage key so the caller can delete the bytes. */
  removeMedia(id: string, experienceId: string): Promise<string | null>;
  nextMediaPosition(experienceId: string): Promise<number>;
}

export interface CategoryRepository {
  listActive(): Promise<readonly CategoryRecord[]>;
  exists(id: string): Promise<boolean>;
}
