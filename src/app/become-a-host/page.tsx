import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/auth/AuthScreen";
import { getPrincipal } from "@/lib/auth-context";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Become a host",
  description: "Turn your unique space or experience into unforgettable journeys.",
};

/**
 * Host registration (FR-05), in the approved treatment.
 *
 * The four benefit tiles are from the reference. They are marketing copy rather
 * than data — nothing is claimed that the product does not do, and there is no
 * control among them that leads anywhere — so they carry no functional debt.
 *
 * The account is created here; the profile and first experience come next, and
 * nothing is published until an operator has reviewed it.
 */

const benefits = [
  {
    title: "Reach Meaningful Travellers",
    body: "Connect with people who value authentic experiences.",
    icon: <path d="M4 11.5 12 5l8 6.5M6 10.6V19h12v-8.4M10 19v-4.6h4V19" />,
  },
  {
    title: "Share Your Story",
    body: "Showcase what makes your place or experience truly special.",
    icon: <path d="M12 20c0-5 3-8 8-8-1 5-4 8-8 8Zm0 0c0-4-2.5-6.5-6.5-6.5C6.3 17 8.8 20 12 20Z" />,
  },
  {
    title: "Grow Together",
    body: "Be part of a trusted community of hosts and creators.",
    icon: (
      <>
        <circle cx="9" cy="9.5" r="2.6" />
        <circle cx="16.5" cy="10.5" r="2" />
        <path d="M4 19c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6M15 19c0-2 .8-3.4 2.4-3.9" />
      </>
    ),
  },
  {
    title: "Flexible & Rewarding",
    body: "You set the terms, we help you grow.",
    icon: <path d="M5 19V12m5 7V6.5M15 19v-4.5M20 19V9" />,
  },
];

export default async function BecomeAHostPage() {
  if (await getPrincipal()) redirect("/host");

  return (
    <AuthScreen
      eyebrow="Share your world"
      title="Become a Host"
      description="Turn your unique space or experience into unforgettable journeys. Join a community that values authenticity, culture and a more meaningful way to travel."
      image={{
        src: "/images/amalfi-villa.jpg",
        alt: "A shaded stone terrace set for a meal, looking out over a bay.",
      }}
    >
      <div className="flex flex-col gap-7">
        <ul className="grid grid-cols-2 gap-3">
          {benefits.map((benefit) => (
            <li
              key={benefit.title}
              className="border-line bg-surface shadow-card rounded-card flex flex-col gap-2 border p-4"
            >
              <span className="bg-surface-2 text-primary dark:text-accent grid h-10 w-10 place-items-center rounded-full">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-5 w-5"
                >
                  {benefit.icon}
                </svg>
              </span>

              <span className="font-display text-heading text-[14.5px] leading-tight">
                {benefit.title}
              </span>
              <span className="text-fg-muted text-[12.5px] leading-[1.5] font-light">
                {benefit.body}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-line flex flex-col gap-5 border-t pt-7">
          <h2 className="font-display text-heading text-[19px]">Start hosting</h2>
          <JoinForm />
        </div>

        <p className="text-fg-muted text-center text-[13.5px]">
          Already hosting with us?{" "}
          <Link
            href="/sign-in"
            className="text-heading font-medium underline underline-offset-4 hover:opacity-75"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthScreen>
  );
}
