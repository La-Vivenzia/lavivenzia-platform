import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/auth/AuthScreen";
import { getPrincipal } from "@/lib/auth-context";
import { destinationForRoles } from "@/lib/destinations";
import { SignInScreen } from "./sign-in-screen";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to La Vivenzia.",
};

/**
 * One door for everybody (FR-04).
 *
 * The platform has two credential models — travellers hold no password and prove
 * the mailbox each time; hosts and operators hold a password and, for privileged
 * roles, a second factor. Both are served by the one form, because nobody
 * arriving at a marketplace knows which kind of account they have; they know
 * their email address.
 *
 * An already-signed-in visitor is sent where their roles allow, not to `/host`
 * unconditionally — that older behaviour put travellers in front of a console
 * they cannot enter.
 */
export default async function SignInPage() {
  const principal = await getPrincipal();
  if (principal) redirect(destinationForRoles(principal.roles));

  return (
    <AuthScreen
      eyebrow="Welcome back"
      title={
        <>
          Continue
          <br />
          Your Journey
        </>
      }
      description="Sign in to access your account and explore more extraordinary experiences."
      image={{
        src: "/images/amalfi-coast.jpg",
        alt: "A cliffside town above a calm sea at golden hour.",
      }}
    >
      <SignInScreen />
    </AuthScreen>
  );
}
