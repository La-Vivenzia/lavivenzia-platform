import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EditorialSplit } from "@/components/layout/editorial-split";
import { getPrincipal } from "@/lib/auth-context";
import { destinationForRoles } from "@/lib/destinations";
import { requiresMfa } from "@/modules/auth/authorization";
import { MfaChallenge } from "./mfa-challenge";

export const metadata: Metadata = { title: "Two-factor authentication" };

/**
 * The second factor (ADR-0005).
 *
 * Privileged roles hold an MFA-unsatisfied session until a TOTP code is
 * accepted, and `authorize()` refuses every privileged permission until then.
 * Without this screen an operations account could sign in and do nothing — the
 * requirement was unreachable rather than enforced.
 */
export default async function MfaPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/sign-in");

  const destination = destinationForRoles(principal.roles);

  // Nothing to do here for an account whose roles do not require a second
  // factor, or a session that has already satisfied one.
  if (!requiresMfa(principal.roles) || principal.mfaSatisfied) redirect(destination);

  return (
    <EditorialSplit
      eyebrow="Operations"
      statement="Privileged access is protected by a second factor. It is asked for once per session."
      attribution="Your authenticator app generates a new code every thirty seconds."
    >
      <MfaChallenge destination={destination} />
    </EditorialSplit>
  );
}
