import type { ReactNode } from "react";
import { OpsShell } from "@/components/ops/shell";
import { requireOperator } from "@/lib/ops-page";
import { getOperationsService } from "@/lib/container";
import { getRoleDefinition } from "@/modules/auth/permissions";

/**
 * The operations console frame.
 *
 * Resolves the operator once, here, and loads the queue counts the rail shows.
 * Those counts are the point of the rail: an operator should know there is work
 * waiting without navigating to find out.
 */
export default async function OpsLayout({ children }: { readonly children: ReactNode }) {
  const principal = await requireOperator();

  // The summary is one pair of grouped aggregates, cheap enough to run per
  // navigation and the reason the rail can carry live counts at all.
  const { summary } = await getOperationsService().overview(principal, 0);

  const primaryRole = principal.roles[0];

  return (
    <OpsShell
      operatorEmail={principal.email}
      roleLabel={primaryRole ? getRoleDefinition(primaryRole).name : "Operations"}
      pendingHosts={summary.hostsPending}
      pendingExperiences={summary.experiencesInReview}
    >
      {children}
    </OpsShell>
  );
}
