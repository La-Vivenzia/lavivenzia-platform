import { ApiError } from "@/lib/api-client";

/**
 * Starting a traveller session from the join screen.
 *
 * Extracted from the form so the decision it encodes is testable without a DOM.
 * The project's unit suite runs in Node with no jsdom, and the rule below is
 * worth a test far more than the markup around it is.
 *
 * **The rule: an address that already has an account is not a failure here.**
 *
 * Registration reports a duplicate rather than hiding it — the project's
 * standing trade-off, because silently succeeding would email the existing
 * owner and turn enumeration into a spam vector
 * (docs/AUTHENTICATION.md → Enumeration). That is correct for the *endpoint*,
 * and it was being treated as fatal by the *screen*, which is a different
 * question. Someone who already has an account and lands on "create an account"
 * has not made an error; they have arrived at the wrong door of a building they
 * already have a key to. Stopping them there is a dead end with no way forward.
 *
 * So a 409 is swallowed and the flow continues to the code request, which is
 * where it was always going. Nothing is disclosed by continuing: the 409 has
 * already told the caller the address exists, so falling through leaks nothing
 * the previous response did not.
 *
 * **What this deliberately does not do** is make a password account reachable by
 * emailed code. `AuthService.requestLoginOtp` silently ignores any account that
 * holds a password — a host or operator must not be reducible to single-factor
 * mailbox possession — and that rule is untouched. A password holder who comes
 * through here gets a 202 and no code, exactly as they would through the
 * sign-in screen. The screen's copy has to be honest about that, which is why
 * the confirmation says "if" rather than promising delivery.
 */

/** The minimal slice of the API client this needs. Injected so tests need no network. */
export interface JoinApiClient {
  post(path: string, body?: unknown): Promise<unknown>;
}

export const REGISTER_PATH = "/api/v1/auth/register";
export const OTP_REQUEST_PATH = "/api/v1/auth/otp/request";

/**
 * Whether a failed registration means "this address is already taken".
 *
 * Keyed on the HTTP status rather than the message, because the message is
 * user-facing copy that will be reworded. 409 is the contract, and duplicate
 * email is the only conflict the registration endpoint raises.
 */
export function isAlreadyRegistered(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/**
 * Create the account if it does not exist, then ask for a login code.
 *
 * Any other failure — validation, rate limiting, a provider outage — propagates
 * unchanged. Only the "already exists" case is absorbed, and only because the
 * next step is what the caller wanted either way.
 */
export async function startTravellerJoin(client: JoinApiClient, email: string): Promise<void> {
  try {
    await client.post(REGISTER_PATH, { email, role: "traveller" });
  } catch (caught) {
    if (!isAlreadyRegistered(caught)) throw caught;
  }

  await client.post(OTP_REQUEST_PATH, { email });
}
