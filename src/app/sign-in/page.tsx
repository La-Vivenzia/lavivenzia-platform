import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EditorialSplit } from "@/components/layout/editorial-split";
import { getPrincipal } from "@/lib/auth-context";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the La Vivenzia host console.",
};

/**
 * Host and administrator sign-in.
 *
 * Travellers sign in with an emailed code and have no password, so this page is
 * deliberately the password door. Sending a traveller here would only ever fail
 * — their account has no password to enter.
 */
export default async function SignInPage() {
  // Already signed in: skip the form rather than presenting a login to someone
  // who has one.
  if (await getPrincipal()) redirect("/host");

  return (
    <EditorialSplit
      eyebrow="Host Console"
      statement="Every experience on La Vivenzia begins with someone who knows a place better than a guidebook ever could."
      attribution="Manage your listings, availability and guests in one place."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[26px] leading-tight">Welcome back</h1>
          <p className="text-[14px] leading-relaxed text-text-muted">
            Sign in to your host account.
          </p>
        </div>

        <SignInForm />

        <p className="border-line border-t pt-6 text-[13px] text-text-muted">
          Not hosting with us yet?{" "}
          <Link
            href="/become-a-host"
            className="text-gold-deep font-medium underline underline-offset-4 hover:text-gold"
          >
            Apply to host
          </Link>
        </p>
      </div>
    </EditorialSplit>
  );
}
