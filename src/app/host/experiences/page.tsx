import type { Metadata } from "next";
import { HostPage } from "@/components/host/shell";
import { ExperienceRow } from "@/components/host/experience-row";
import { EmptyState, SectionHeading } from "@/components/ui/feedback";
import { requireHostProfile } from "@/lib/host-page";
import { getExperienceService } from "@/lib/container";
import { NewExperienceButton } from "./new-experience-button";

export const metadata: Metadata = { title: "Experiences" };

/**
 * The host's inventory (FR-06, FR-13).
 *
 * Ordered by most recently edited rather than by status: a host coming back to
 * the console is almost always returning to the thing they were last working
 * on, and making them find it in a status-grouped list is friction for no gain.
 */
export default async function ExperiencesPage() {
  const { principal, host } = await requireHostProfile();
  const experiences = await getExperienceService().listOwn(principal, host);

  return (
    <HostPage>
      <div className="flex flex-col gap-8">
        <SectionHeading
          eyebrow="Inventory"
          title="Experiences"
          description="Everything you have created, most recently edited first. Drafts are private until our team approves them."
          action={<NewExperienceButton />}
        />

        {experiences.length === 0 ? (
          <EmptyState
            eyebrow="Nothing here yet"
            title="Your first experience starts with a name"
            description="A working title is enough to begin. Photographs, price, location and the story can follow over as many sittings as you need — everything saves as a draft."
            action={<NewExperienceButton variant="primary" size="lg" />}
          />
        ) : (
          <div className="border-line bg-line flex flex-col gap-px border">
            {experiences.map((experience) => (
              <ExperienceRow key={experience.id} experience={experience} />
            ))}
          </div>
        )}
      </div>
    </HostPage>
  );
}
