import { AppError } from "@/lib/errors";
import { formatClock } from "@/lib/format";
import type { EmailTemplatePayloads } from "@/modules/notifications/email-templates";
import type { EmailPort, SendEmailResult } from "@/ports/email";

import { chapterNumeral } from "./journey-chapters";
import type { JourneyPass } from "./journey-pass-contract";

/**
 * The patron's confirmation email for an issued journey pass: the route,
 * act by act, and the keyword they will say at each door.
 *
 * Built from the pass the server just issued and nothing else, so the email
 * can never disagree with the pass on screen (CLAUDE.md §7).
 */

type PassEmailVariables = EmailTemplatePayloads["traveler.journey-pass-confirmation"];

/** A place search on the act's stored pin — no route guessed for the patron. */
export function actDirectionsUrl(coordinates: { readonly lat: number; readonly lng: number }) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${coordinates.lat},${coordinates.lng}`);
  return url.toString();
}

export function journeyPassEmailVariables(pass: JourneyPass, appUrl: string): PassEmailVariables {
  return {
    holderName: pass.holderName,
    journeyTitle: pass.journey.title,
    reference: pass.reference,
    secretKeyword: pass.secretKeyword,
    partySize: pass.partySize,
    simulated: pass.simulated,
    notice: pass.notice,
    acts: pass.acts.map((act, index) => ({
      heading: `Chapter ${chapterNumeral(index)} · ${act.label}`,
      title: act.title,
      startsAt: formatClock(act.startMinute),
      addressLine: act.addressLine,
      privilege: act.privilege.title,
      privilegeConfirmed: act.privilege.confirmed,
      directionsUrl: actDirectionsUrl(act.coordinates),
    })),
    journeyUrl: new URL(`/journeys/${encodeURIComponent(pass.journey.id)}`, appUrl).toString(),
  };
}

/**
 * Send the confirmation, retrying once when the provider says a retry could
 * succeed. A rejection that repeating cannot fix is thrown as is.
 */
export async function sendJourneyPassConfirmation(
  email: EmailPort,
  input: { readonly to: string; readonly pass: JourneyPass; readonly appUrl: string },
): Promise<SendEmailResult> {
  const message = {
    to: input.to,
    template: "traveler.journey-pass-confirmation",
    variables: journeyPassEmailVariables(input.pass, input.appUrl),
  } as const;

  try {
    return await email.send(message);
  } catch (error) {
    if (error instanceof AppError && error.isRetryable) return email.send(message);
    throw error;
  }
}
