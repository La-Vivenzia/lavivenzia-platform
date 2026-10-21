import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/auth/AuthScreen";
import { getPrincipal } from "@/lib/auth-context";
import { destinationForRoles } from "@/lib/destinations";
import { TravellerJoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a La Vivenzia account to save and book experiences.",
};

/**
 * Traveller account creation (FR-04).
 *
 * Separate from `/become-a-host`, which creates a host with a password and a
 * different onboarding path entirely. Merging them into one page with a role
 * toggle would put a decision in front of someone who only wants to look at
 * experiences.
 */
export default async function JoinPage() {
  const principal = await getPrincipal();
  if (principal) redirect(destinationForRoles(principal.roles));

  return (
    <AuthScreen
      eyebrow="Begin something extraordinary"
      title="Join La Vivenzia"
      description="Create your account and unlock a world of unique stays, authentic experiences and meaningful connections."
      image={{
        src: "/images/santorini.jpg",
        alt: "A terrace above the sea at dusk.",
      }}
    >
      <TravellerJoinForm />
    </AuthScreen>
  );
}
