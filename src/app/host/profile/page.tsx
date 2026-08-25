import type { Metadata } from "next";
import { HostPage } from "@/components/host/shell";
import { SectionHeading } from "@/components/ui/feedback";
import { loadHostSession } from "@/lib/host-page";
import { HostProfileEditor } from "./profile-editor";
import { StartProfileForm } from "./start-profile-form";

export const metadata: Metadata = { title: "Host profile" };

/**
 * Host onboarding and profile (FR-05).
 *
 * Two states, not two pages. Before a profile exists the page asks for the
 * three things needed to create one; afterwards it becomes the full editor.
 * Splitting them across routes would mean a redirect in the middle of what a
 * host experiences as one task.
 */
export default async function HostProfilePage() {
  const { profile } = await loadHostSession();

  return (
    <HostPage>
      <div className="flex max-w-3xl flex-col gap-10">
        <SectionHeading
          eyebrow={profile ? "Your profile" : "Getting started"}
          title={profile ? "Host profile" : "Tell us who you are"}
          description={
            profile
              ? "This is what our team reviews, and what travellers read on your host page. Changes save when you choose — nothing is submitted until you say so."
              : "We need three things to begin. Everything else can be filled in over as many sittings as you like."
          }
        />

        {profile ? <HostProfileEditor initial={profile} /> : <StartProfileForm />}
      </div>
    </HostPage>
  );
}
