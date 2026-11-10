import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageBody, PageHeader } from "@/components/PageHeader";
import { ProfileView } from "@/components/profile/ProfileView";
import { getPrincipal } from "@/lib/auth-context";
import { getUserProfileService } from "@/lib/container";

export const metadata: Metadata = {
  title: "Patron Profile & Settings | La Vivenzia",
  description:
    "Manage your personal identity, bespoke culinary and aesthetic preferences, security credentials, and active devices.",
};

/**
 * Patron Profile & Settings (FR-04).
 *
 * Hosted inside the traveller site shell. Anonymous visitors are redirected to
 * sign in with a return-to parameter so they return straight here.
 */
export default async function ProfilePage() {
  const principal = await getPrincipal();
  if (!principal) {
    redirect("/sign-in?next=/profile");
  }

  const profileService = getUserProfileService();
  const [profile, sessions] = await Promise.all([
    profileService.getProfile(principal),
    profileService.listSessions(principal),
  ]);

  return (
    <PageBody>
      <div className="flex flex-col gap-10">
        <PageHeader
          eyebrow="Account & Preferences"
          title="Patron Profile"
          description="Manage your personal identity, bespoke culinary and aesthetic preferences, credentials, and active devices."
        />

        <ProfileView initialProfile={profile} initialSessions={sessions} />
      </div>
    </PageBody>
  );
}
