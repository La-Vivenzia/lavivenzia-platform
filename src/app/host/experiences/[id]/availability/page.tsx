import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireHostProfile } from "@/lib/host-page";
import { getAvailabilityService } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { SlotManager, type SlotView } from "./slot-manager";

export const metadata: Metadata = { title: "Availability" };

/**
 * Availability management (FR-08).
 *
 * Loaded on the server so the calendar renders complete rather than flashing
 * empty while it fetches itself. Dates cross the boundary as ISO strings —
 * a `Date` does not survive serialisation to a client component, and sending
 * one would arrive as a string with a `Date` type on it.
 */
export default async function AvailabilityPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const { principal, host } = await requireHostProfile();

  // The try wraps only the fetch: JSX constructed inside it would render later,
  // so a render-time error would escape the catch entirely.
  let slots: readonly SlotView[];
  try {
    const records = await getAvailabilityService().listOwn(principal, host, id);
    slots = records.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      capacity: slot.capacity,
      reservedCount: slot.reservedCount,
      seatsRemaining: slot.seatsRemaining,
      bookingCutoffMinutes: slot.bookingCutoffMinutes,
      bookingClosesAt: slot.bookingClosesAt.toISOString(),
      status: slot.status,
      isBookable: slot.isBookable,
    }));
  } catch (error) {
    // A listing belonging to another host resolves to not-found, exactly as it
    // does through the API.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <SlotManager experienceId={id} initial={slots} />;
}
