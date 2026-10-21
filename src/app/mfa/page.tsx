import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen, LockGlyph } from "@/components/auth/AuthScreen";
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
    <AuthScreen
      eyebrow="Additional security"
      title={<>Verify It&apos;s You</>}
      description="Enter the six-digit code from your authenticator app. It changes every thirty seconds."
    >
      <div className="flex flex-col gap-7">
        {/*
         * The lock medallion the reference opens this screen with. Decorative:
         * the heading above already says what the screen is for.
         */}
        <div
          aria-hidden="true"
          className="bg-surface-2 text-primary dark:text-accent mx-auto grid h-[72px] w-[72px] place-items-center rounded-full"
        >
          <LockGlyph className="h-7 w-7" />
        </div>

        <MfaChallenge destination={destination} />
      </div>
    </AuthScreen>
  );
}
