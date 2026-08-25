import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth-context";
import { destinationForRoles } from "@/lib/destinations";
import { hasPermission, requiresMfa, type Principal } from "@/modules/auth/authorization";
import { PERMISSIONS } from "@/modules/auth/permissions";

/**
 * Page-level guard for the operations console.
 *
 * For *navigation* — sending someone to the right screen. It is not the
 * security boundary: every service method authorizes independently, so a page
 * that forgot to call this would render an empty shell rather than leak.
 *
 * The order of the checks is the order the problems need solving. An operator
 * who has not satisfied MFA is not unauthorized, they are unfinished — sending
 * them to the challenge is the useful answer, and sending them away would be a
 * dead end since `authorize()` refuses everything until they pass it.
 */
export async function requireOperator(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) redirect("/sign-in");

  if (requiresMfa(principal.roles) && !principal.mfaSatisfied) redirect("/mfa");

  // Either permission is enough to be *in* the console: operations holds both,
  // content_admin holds only the listing side. Each screen still authorizes what
  // it actually does.
  const canSeeAnything =
    hasPermission(principal, PERMISSIONS.EXPERIENCE_READ_ALL) ||
    hasPermission(principal, PERMISSIONS.HOST_READ);

  // Not an error page: a host or traveller who lands here is not doing anything
  // wrong, they are simply in the wrong console.
  if (!canSeeAnything) redirect(destinationForRoles(principal.roles));

  return principal;
}
