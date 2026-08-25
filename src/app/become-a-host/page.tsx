import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EditorialSplit } from "@/components/layout/editorial-split";
import { getPrincipal } from "@/lib/auth-context";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Apply to host",
  description: "Create a La Vivenzia host account.",
};

/** Host registration (FR-05). Creates the account; the profile comes next. */
export default async function BecomeAHostPage() {
  if (await getPrincipal()) redirect("/host");

  return (
    <EditorialSplit
      eyebrow="Become a Host"
      statement="We work with a small number of hosts who make a place worth travelling for."
      attribution="Applications are reviewed by our team before listings go live."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[26px] leading-tight">Create your account</h1>
          <p className="text-[14px] leading-relaxed text-text-muted">
            You will build your profile and first experience next. Nothing is published until it has
            been reviewed.
          </p>
        </div>

        <JoinForm />

        <p className="border-line border-t pt-6 text-[13px] text-text-muted">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-gold-deep font-medium underline underline-offset-4 hover:text-gold"
          >
            Sign in
          </Link>
        </p>
      </div>
    </EditorialSplit>
  );
}
