"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, SectionHeading } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api-client";
import { MAX_SLOTS_PER_REQUEST } from "@/modules/availability/rules";

/**
 * Availability manager (FR-08).
 *
 * Hosts think in "this runs at 10am on these days", not in individual rows, so
 * the form generates a date range in one submission rather than making them
 * repeat a single-slot form. The server validates the batch as a batch, which
 * is the only way two slots submitted together that overlap each other get
 * caught.
 *
 * Capacity, cut-off and open/closed are editable; **times are not**. Moving a
 * slot that travellers hold seats in is a cancellation and a rebooking, and
 * that belongs with the phase where a refund policy exists.
 */

export interface SlotView {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly reservedCount: number;
  readonly seatsRemaining: number;
  readonly bookingCutoffMinutes: number;
  readonly bookingClosesAt: string;
  readonly status: "OPEN" | "CLOSED";
  readonly isBookable: boolean;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const timeOnly = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Local wall-clock values from the form, as an absolute instant. */
function toInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}`);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function SlotManager({
  experienceId,
  initial,
}: {
  readonly experienceId: string;
  readonly initial: readonly SlotView[];
}) {
  const [slots, setSlots] = useState<readonly SlotView[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fromDay, setFromDay] = useState("");
  const [untilDay, setUntilDay] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [capacity, setCapacity] = useState("8");
  const [cutoff, setCutoff] = useState("0");

  async function reload(): Promise<void> {
    const data = await api.get<{ slots: readonly SlotView[] }>(
      `/api/v1/host/experiences/${experienceId}/slots`,
    );
    setSlots(data.slots);
  }

  function report(caught: unknown): void {
    setNotice(null);
    setError(
      caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.",
    );
  }

  async function addSlots(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!fromDay) {
      setError("Choose the first date.");
      return;
    }

    const last = untilDay || fromDay;
    if (last < fromDay) {
      setError("The last date cannot be before the first.");
      return;
    }

    // Built here rather than on the server so the host sees exactly how many
    // occurrences they are about to create before committing to them.
    const payload: {
      startsAt: string;
      endsAt: string;
      capacity: number;
      bookingCutoffMinutes: number;
    }[] = [];
    for (let day = fromDay; day <= last; day = addDays(day, 1)) {
      const startsAt = toInstant(day, startTime);
      const endsAt = toInstant(day, endTime);
      // An end before the start means the host meant "finishes after midnight".
      if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);

      payload.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: Number(capacity),
        bookingCutoffMinutes: Number(cutoff),
      });
    }

    if (payload.length > MAX_SLOTS_PER_REQUEST) {
      setError(`That is ${payload.length} slots. Add at most ${MAX_SLOTS_PER_REQUEST} at a time.`);
      return;
    }

    setBusy(true);
    try {
      await api.post(`/api/v1/host/experiences/${experienceId}/slots`, { slots: payload });
      await reload();
      setNotice(`${payload.length} slot${payload.length === 1 ? "" : "s"} added.`);
      setUntilDay("");
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }

  async function patch(slotId: string, body: Record<string, unknown>): Promise<void> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.patch(`/api/v1/host/experiences/${experienceId}/slots/${slotId}`, body);
      await reload();
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }

  async function remove(slotId: string): Promise<void> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.delete(`/api/v1/host/experiences/${experienceId}/slots/${slotId}`);
      await reload();
      setNotice("Slot removed.");
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }

  const upcoming = slots.filter((slot) => new Date(slot.startsAt) > new Date());
  const past = slots.filter((slot) => new Date(slot.startsAt) <= new Date());

  return (
    <div className="flex flex-col gap-10">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <section>
        <SectionHeading
          title="Add availability"
          description="Set a time, then repeat it across a range of dates. One slot is created per day."
        />

        <form onSubmit={addSlots} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="First date"
            type="date"
            required
            value={fromDay}
            onChange={(event) => setFromDay(event.target.value)}
          />
          <TextField
            label="Last date"
            type="date"
            hint="Leave blank for a single day"
            value={untilDay}
            onChange={(event) => setUntilDay(event.target.value)}
          />
          <TextField
            label="Capacity"
            type="number"
            min={1}
            required
            hint="Total seats for each occurrence"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
          <TextField
            label="Starts"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <TextField
            label="Ends"
            type="time"
            required
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
          <TextField
            label="Booking closes"
            type="number"
            min={0}
            hint="Minutes before the start. 0 means right up to it."
            value={cutoff}
            onChange={(event) => setCutoff(event.target.value)}
          />

          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add slots"}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <SectionHeading title="Upcoming" description={`${upcoming.length} scheduled`} />

        {upcoming.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No availability yet"
              description="Travellers cannot book an experience with no slots. Add dates above."
            />
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {upcoming.map((slot) => (
              <li
                key={slot.id}
                className="border-line bg-surface rounded-card flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-heading text-[14.5px] font-medium">
                    {dateTime.format(new Date(slot.startsAt))} –{" "}
                    {timeOnly.format(new Date(slot.endsAt))}
                  </p>
                  <p className="text-fg-muted mt-1 text-[12.5px]">
                    {slot.seatsRemaining} of {slot.capacity} seats left
                    {slot.reservedCount > 0 ? ` · ${slot.reservedCount} reserved` : ""}
                    {slot.bookingCutoffMinutes > 0
                      ? ` · closes ${dateTime.format(new Date(slot.bookingClosesAt))}`
                      : ""}
                  </p>
                  {!slot.isBookable && slot.status === "OPEN" ? (
                    <p className="text-fg-subtle mt-1 text-[12px]">
                      Not currently bookable — past the cut-off or full.
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span
                    className={`rounded-pill px-3 py-1 text-[11px] font-medium ${
                      slot.status === "OPEN"
                        ? "bg-surface-2 text-heading"
                        : "bg-surface-3 text-fg-muted"
                    }`}
                  >
                    {slot.status === "OPEN" ? "Open" : "Closed"}
                  </span>

                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void patch(slot.id, {
                        status: slot.status === "OPEN" ? "CLOSED" : "OPEN",
                      })
                    }
                  >
                    {slot.status === "OPEN" ? "Close" : "Reopen"}
                  </Button>

                  <Button
                    variant="ghost"
                    disabled={busy || slot.reservedCount > 0}
                    title={
                      slot.reservedCount > 0
                        ? "This slot has reservations. Close it instead."
                        : undefined
                    }
                    onClick={() => void remove(slot.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <SectionHeading title="Past" description={`${past.length} already run`} />
          <ul className="mt-5 flex flex-col gap-2">
            {past.slice(0, 10).map((slot) => (
              <li key={slot.id} className="text-fg-subtle text-[13px]">
                {dateTime.format(new Date(slot.startsAt))} · {slot.reservedCount} reserved
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
