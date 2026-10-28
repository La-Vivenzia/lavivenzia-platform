/**
 * Slots as a traveller picks them (FR-08, FR-09).
 *
 * A slot is an instant (timestamptz). A traveller picks a *day* and then a
 * *time*, and both have to be read in the zone the experience happens in, not
 * the zone the browser is in — someone in London planning a Pune evening walk
 * must see 18:00, not 12:30. The catalogue is India-only today, so that zone is
 * a constant; it becomes a column when a second country is listed.
 */

export const EXPERIENCE_TIME_ZONE = "Asia/Kolkata";
export const EXPERIENCE_TIME_ZONE_LABEL = "IST";

/** A bookable slot as the public slots endpoint serialises it. */
export interface PublicSlot {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly seatsRemaining: number;
  readonly bookingClosesAt: string;
}

export interface SlotDay {
  /** `YYYY-MM-DD` in the experience's zone. Stable, sortable, a React key. */
  readonly key: string;
  readonly slots: readonly PublicSlot[];
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: EXPERIENCE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dayKeyOf(instant: string | Date, timeZone = EXPERIENCE_TIME_ZONE): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const format =
    timeZone === EXPERIENCE_TIME_ZONE
      ? dayKeyFormat
      : new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
  // en-CA renders an ISO-style date, which is the whole reason for choosing it.
  return format.format(date);
}

/**
 * Keep the slots a party of the minimum size could actually book.
 *
 * The endpoint already drops closed, full and past-cut-off slots; this also
 * drops the ones with fewer seats left than the smallest party the host
 * accepts, which would otherwise be offered and then fail at the guest step.
 */
export function slotsForParty(slots: readonly PublicSlot[], minGuests: number): PublicSlot[] {
  return slots.filter((slot) => slot.seatsRemaining >= Math.max(1, minGuests));
}

/** Group by day in the experience's zone, soonest first, times ascending within a day. */
export function groupSlotsByDay(
  slots: readonly PublicSlot[],
  timeZone = EXPERIENCE_TIME_ZONE,
): SlotDay[] {
  const sorted = [...slots].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  const days = new Map<string, PublicSlot[]>();
  for (const slot of sorted) {
    const key = dayKeyOf(slot.startsAt, timeZone);
    const day = days.get(key);
    if (day) day.push(slot);
    else days.set(key, [slot]);
  }

  return [...days.entries()].map(([key, daySlots]) => ({ key, slots: daySlots }));
}
