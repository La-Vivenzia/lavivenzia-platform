import type { ReviewEvent } from "@/modules/operations/ports";
import { formatRelativeTime } from "@/lib/format";

/**
 * Review history, read from the existing audit log (FR-15).
 *
 * There is no separate review-history table and there should not be: every
 * decision already writes an audit row with actor, before and after. A second
 * store would be a second thing to keep true.
 */

const ACTION_LABELS: Readonly<Record<string, string>> = {
  "experience.review.approve": "Approved",
  "experience.review.reject": "Changes requested",
  "experience.review.suspend": "Suspended",
  "experience.review.reinstate": "Reinstated",
  "host.review.verify": "Verified",
  "host.review.reject": "Changes requested",
  "experience.submit": "Submitted for review",
  "experience.withdraw": "Withdrawn by host",
  "experience.created": "Created",
  "experience.archive": "Archived by host",
  "experience.restore": "Restored by host",
  "host.profile.created": "Profile created",
  "host.verification.submitted": "Submitted for verification",
};

function label(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function ReviewTimeline({
  events,
  emptyMessage = "Nothing recorded yet.",
}: {
  readonly events: readonly ReviewEvent[];
  readonly emptyMessage?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="border-line bg-surface text-text-subtle border px-6 py-8 text-[13px]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className="border-line bg-line flex flex-col gap-px border">
      {events.map((event) => (
        <li key={event.id} className="bg-surface flex flex-col gap-2 px-6 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-text text-[13px] font-medium">{label(event.action)}</span>
            <time
              className="text-text-subtle text-[12px]"
              dateTime={event.occurredAt.toISOString()}
            >
              {formatRelativeTime(event.occurredAt)}
            </time>
          </div>

          <p className="text-text-muted text-[12px]">
            {/* A system-initiated action has no actor, which is a fact worth
                stating rather than rendering as a blank. */}
            {event.actorEmail ?? "System"}
            {event.fromStatus && event.toStatus ? (
              <span className="text-text-subtle">
                {" · "}
                {event.fromStatus.toLowerCase().replace("_", " ")} →{" "}
                {event.toStatus.toLowerCase().replace("_", " ")}
              </span>
            ) : null}
          </p>

          {event.note ? (
            <p className="border-line-strong text-text-muted border-l-2 pl-3 text-[13px] leading-relaxed">
              {event.note}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
