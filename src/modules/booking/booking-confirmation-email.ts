import { AppError } from "@/lib/errors";
import { formatMoneyMinor } from "@/lib/format";
import type { EmailTemplatePayloads } from "@/modules/notifications/email-templates";
import type { EmailPort, SendEmailResult } from "@/ports/email";
import type { BookingConfirmation } from "./contract";

/**
 * The patron's confirmation email for a confirmed experience reservation.
 *
 * Built directly from the verified BookingConfirmation returned by checkout,
 * ensuring complete accuracy and zero divergence between screen and inbox.
 */

type BookingEmailVariables = EmailTemplatePayloads["traveler.booking-confirmation"];

function formatScheduleDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return isoString;
  }
}

export function bookingConfirmationEmailVariables(
  confirmation: BookingConfirmation,
  appUrl: string,
  patronName?: string,
): BookingEmailVariables {
  const quote = confirmation.quote;
  const totalFormatted =
    formatMoneyMinor(quote.totalMinor, quote.currency) ??
    `${quote.currency} ${(quote.totalMinor / 100).toFixed(2)}`;

  const experienceUrl = new URL(
    `/experiences/${encodeURIComponent(confirmation.experience.slug)}`,
    appUrl,
  ).toString();

  return {
    patronName: patronName?.trim() || "Dear Patron",
    experienceTitle: confirmation.experience.title,
    hostName: confirmation.experience.hostName,
    reference: confirmation.reference,
    startsAtFormatted: formatScheduleDateTime(confirmation.slot.startsAt),
    endsAtFormatted: formatScheduleDateTime(confirmation.slot.endsAt),
    guests: confirmation.guests,
    totalFormatted,
    venueLines: confirmation.venue.lines,
    directionsUrl: confirmation.venue.mapUrl,
    experienceUrl,
    confirmedAt: confirmation.confirmedAt,
  };
}

/**
 * Send the booking confirmation email, retrying once on retryable provider error.
 */
export async function sendBookingConfirmation(
  email: EmailPort,
  input: {
    readonly to: string;
    readonly confirmation: BookingConfirmation;
    readonly appUrl: string;
    readonly patronName?: string;
  },
): Promise<SendEmailResult> {
  const message = {
    to: input.to,
    template: "traveler.booking-confirmation",
    variables: bookingConfirmationEmailVariables(input.confirmation, input.appUrl, input.patronName),
  } as const;

  try {
    return await email.send(message);
  } catch (error) {
    if (error instanceof AppError && error.isRetryable) {
      return email.send(message);
    }
    throw error;
  }
}
