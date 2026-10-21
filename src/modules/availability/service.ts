import { NotFoundError } from "@/lib/errors";
import { authorize, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";
import type { HostRecord } from "@/modules/hosts/ports";
import type { ExperienceRepository } from "@/modules/experiences/ports";
import type { CreateSlotInput, SlotRecord, SlotRepository, SlotStatus } from "./ports";
import {
  assertCapacityChangeAllowed,
  assertSlotMutable,
  bookingClosesAt,
  isBookable,
  seatsRemaining,
  validateBatch,
  type SlotInput,
} from "./rules";

/**
 * Availability service (FR-08).
 *
 * Hosts manage when an experience runs and how many seats exist; travellers
 * read what is still bookable. Both go through here so one definition of
 * "bookable" serves both.
 *
 * **Ownership is derived, never supplied.** Every host method takes the
 * authenticated `HostRecord` and resolves the experience through
 * `findByIdForHost`, so a host cannot reach another host's slots by guessing an
 * id — the lookup simply returns nothing. A missing row is reported as
 * `NotFoundError` rather than a permission failure, so the API does not
 * confirm that someone else's experience exists.
 *
 * **No reservation happens here.** `isBookable` answers "should this be
 * offered", not "is this seat mine". Taking a seat is Phase 6's job and must
 * happen inside a transaction that increments `reservedCount`, with the CHECK
 * constraint as the backstop.
 */

export interface AvailabilityDependencies {
  readonly slots: SlotRepository;
  readonly experiences: ExperienceRepository;
  /** Injected so time is explicit and testable rather than ambient. */
  readonly now?: () => Date;
}

export interface SlotView {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly reservedCount: number;
  readonly seatsRemaining: number;
  readonly bookingCutoffMinutes: number;
  readonly bookingClosesAt: Date;
  readonly status: SlotStatus;
  readonly isBookable: boolean;
}

export class AvailabilityService {
  readonly #deps: AvailabilityDependencies;
  readonly #now: () => Date;

  constructor(deps: AvailabilityDependencies) {
    this.#deps = deps;
    this.#now = deps.now ?? (() => new Date());
  }

  async #requireOwnExperience(host: HostRecord, experienceId: string): Promise<string> {
    const experience = await this.#deps.experiences.findByIdForHost(experienceId, host.id);
    if (!experience) throw new NotFoundError("Experience not found.");
    return experience.id;
  }

  async #requireOwnSlot(host: HostRecord, slotId: string): Promise<SlotRecord> {
    const slot = await this.#deps.slots.findById(slotId);
    if (!slot) throw new NotFoundError("Slot not found.");
    // Resolving the parent through the host is what makes this an ownership
    // check rather than a lookup: a slot on someone else's experience is
    // indistinguishable from one that does not exist.
    await this.#requireOwnExperience(host, slot.experienceId);
    return slot;
  }

  #view(slot: SlotRecord): SlotView {
    return {
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: slot.capacity,
      reservedCount: slot.reservedCount,
      seatsRemaining: seatsRemaining(slot),
      bookingCutoffMinutes: slot.bookingCutoffMinutes,
      bookingClosesAt: bookingClosesAt(slot),
      status: slot.status,
      isBookable: isBookable(slot, this.#now()),
    };
  }

  // ── Host ─────────────────────────────────────────────────────────────────

  async listOwn(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
  ): Promise<readonly SlotView[]> {
    authorize(principal, PERMISSIONS.EXPERIENCE_READ_OWN);
    const id = await this.#requireOwnExperience(host, experienceId);
    return (await this.#deps.slots.listForExperience(id)).map((slot) => this.#view(slot));
  }

  /**
   * Add slots.
   *
   * Validated as a batch against itself and against what already exists, then
   * written in one transaction. Partial success would leave a host unable to
   * tell which of their slots were accepted.
   */
  async addSlots(
    principal: Principal,
    host: HostRecord,
    experienceId: string,
    inputs: readonly SlotInput[],
  ): Promise<readonly SlotView[]> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);
    const id = await this.#requireOwnExperience(host, experienceId);

    const now = this.#now();
    const existing = await this.#deps.slots.listForExperience(id);
    validateBatch(inputs, existing, now);

    const records: readonly CreateSlotInput[] = inputs.map((input) => ({
      experienceId: id,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      bookingCutoffMinutes: input.bookingCutoffMinutes,
    }));

    return (await this.#deps.slots.createMany(records)).map((slot) => this.#view(slot));
  }

  /**
   * Change capacity, cut-off or open/closed state.
   *
   * Capacity may not drop below what is reserved — refused here with a
   * readable message, and refused again by the database if anything ever
   * reaches it another way.
   */
  async updateSlot(
    principal: Principal,
    host: HostRecord,
    slotId: string,
    input: {
      readonly capacity?: number;
      readonly bookingCutoffMinutes?: number;
      readonly status?: SlotStatus;
    },
  ): Promise<SlotView> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);
    const slot = await this.#requireOwnSlot(host, slotId);

    if (input.capacity !== undefined) {
      assertCapacityChangeAllowed(input.capacity, slot.reservedCount);
    }

    return this.#view(await this.#deps.slots.update(slot.id, input));
  }

  /**
   * Remove a slot.
   *
   * Refused once it has started or has reservations — closing is the correct
   * action there, and it keeps the record for the travellers holding a seat.
   */
  async removeSlot(principal: Principal, host: HostRecord, slotId: string): Promise<void> {
    authorize(principal, PERMISSIONS.EXPERIENCE_UPDATE_OWN);
    const slot = await this.#requireOwnSlot(host, slotId);

    assertSlotMutable(slot, this.#now());
    await this.#deps.slots.remove(slot.id);
  }

  // ── Public ───────────────────────────────────────────────────────────────

  /**
   * What a traveller may book.
   *
   * Takes no principal: this is the public surface, and like
   * `modules/discovery` it has no parameter that could widen what is visible.
   * Only bookable slots are returned, so a closed or sold-out occurrence
   * cannot leak into a listing page.
   */
  async listBookable(experienceId: string): Promise<readonly SlotView[]> {
    const now = this.#now();
    const slots = await this.#deps.slots.listUpcoming(experienceId, now);
    return slots.filter((slot) => isBookable(slot, now)).map((slot) => this.#view(slot));
  }
}
