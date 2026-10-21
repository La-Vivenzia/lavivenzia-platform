"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthField, AuthSubmit, LockGlyph, MailGlyph } from "@/components/auth/AuthScreen";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { startTravellerJoin } from "@/lib/traveller-join";

/**
 * Traveller account creation (FR-04), in the approved treatment.
 *
 * **One field, because travellers are passwordless.** The account is proved by
 * control of the mailbox, every time, so there is nothing to choose, confirm or
 * forget.
 *
 * The reference draws four fields — full name, email, phone, password — and a
 * terms checkbox. Three of those are not built: `users` has no name or phone
 * column, a traveller has no password by design, and there are no Terms or
 * Privacy pages to link to. Drawing them would mean either discarding what
 * someone typed or linking to a 404.
 *
 * Adding name and phone is a schema change and a product decision about what is
 * required at signup; it is not a styling one. The shape here is the approved
 * one, at the length the data model actually supports.
 *
 * An address that already has an account continues to the code step rather than
 * stopping — `startTravellerJoin` owns that rule and is tested.
 */
export function TravellerJoinForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await startTravellerJoin(api, email);
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not create your account. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await api.post("/api/v1/auth/otp/verify", { email, code });
      router.refresh();
      // A brand-new traveller holds only the traveller role, and travellers have
      // no console yet, so the honest destination is where they were going.
      router.push("/experiences");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not verify that code.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <form onSubmit={verify} noValidate className="flex flex-col gap-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <p className="text-fg-muted text-[14px] leading-[1.6] font-light">
          A six-digit code is on its way to{" "}
          <span className="text-heading font-medium">{email}</span>. It expires in ten minutes.
        </p>

        {/*
         * A host or operator who lands here reaches this step too and will never
         * receive a code: `requestLoginOtp` ignores any account holding a
         * password, so a privileged account cannot be reduced to mailbox
         * possession. That rule is right, which makes this the one screen that
         * must say where to go instead.
         */}
        <p className="text-fg-subtle text-[13px] leading-relaxed">
          Already host or operate with us? Your account uses a password —{" "}
          <Link href="/sign-in" className="text-heading underline underline-offset-4">
            sign in with it instead
          </Link>
          .
        </p>

        <AuthField
          icon={<LockGlyph />}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Six-digit code"
          aria-label="Six-digit code"
        />

        <AuthSubmit pending={pending} disabled={code.length === 0}>
          Confirm
        </AuthSubmit>
      </form>
    );
  }

  return (
    <form onSubmit={createAccount} noValidate className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <AuthField
        icon={<MailGlyph />}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email address"
        aria-label="Email address"
      />

      <p className="text-fg-subtle -mt-1 text-[12px] leading-relaxed">
        No password to remember. We email you a code each time you sign in.
      </p>

      <AuthSubmit pending={pending} disabled={email.length === 0}>
        Create Account
      </AuthSubmit>

      <p className="text-fg-muted mt-1 text-center text-[13.5px]">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="text-heading font-medium underline underline-offset-4 hover:opacity-75"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
