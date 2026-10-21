"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthField, AuthSubmit, LockGlyph, MailGlyph } from "@/components/auth/AuthScreen";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { destinationForRoles } from "@/lib/destinations";
import type { RoleKey } from "@/modules/auth/permissions";

/**
 * Sign in, in the approved treatment.
 *
 * **Two credential models behind one form.** The platform has both, and which
 * one applies is a property of the account, not a choice the visitor should have
 * to understand: travellers hold no password and prove the mailbox each time;
 * hosts and operators hold a password, and privileged roles add a second factor.
 *
 * So the password field is optional. Leave it empty and the form emails a code;
 * fill it and the form signs in with it. That is one door, which is what the
 * reference draws — it shows a password field and no mention of codes, because
 * its user is a host.
 *
 * **What the reference has that this does not:** a Google button and a "forgot
 * password" link. Neither has a backend — no OAuth strategy is configured, and
 * there is no reset flow — so neither is drawn. A control that does nothing is
 * worse than an absent one.
 */

interface LoginResponse {
  readonly mfaRequired: boolean;
}

interface MeResponse {
  readonly roles: readonly RoleKey[];
}

type Step = "credentials" | "code";

export function SignInScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function landAfterSignIn(): Promise<void> {
    router.refresh();
    const me = await api.get<MeResponse>("/api/v1/auth/me");
    router.push(destinationForRoles(me.roles));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      // No password given: this is the traveller path, so ask for a code.
      if (password.length === 0) {
        await api.post("/api/v1/auth/otp/request", { email });
        setStep("code");
        return;
      }

      const result = await api.post<LoginResponse>("/api/v1/auth/login", { email, password });

      if (result.mfaRequired) {
        // A privileged account lands on an MFA-unsatisfied session, where every
        // privileged permission is refused. The second factor comes before the
        // console, not after it.
        router.refresh();
        router.push("/mfa");
        return;
      }

      await landAfterSignIn();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not sign you in. Please check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await api.post("/api/v1/auth/otp/verify", { email, code });
      await landAfterSignIn();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not verify that code.");
    } finally {
      setPending(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} noValidate className="flex flex-col gap-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <p className="text-fg-muted text-[14px] leading-[1.6] font-light">
          If <span className="text-heading font-medium">{email}</span> has an account, a six-digit
          code is on its way. It expires in ten minutes.
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
          Verify Code
        </AuthSubmit>

        <button
          type="button"
          onClick={() => {
            setStep("credentials");
            setCode("");
            setError(null);
          }}
          className="text-fg-muted hover:text-heading text-[13px] transition-colors"
        >
          ← Use a different address
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
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

      <AuthField
        icon={<LockGlyph />}
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        aria-label="Password"
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="text-fg-subtle hover:text-heading transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
              className="h-[19px] w-[19px]"
            >
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword ? <path d="m4 20 16-16" /> : null}
            </svg>
          </button>
        }
      />

      {/*
       * The one instruction that keeps a single form honest for two credential
       * models. Without it a traveller stares at a password field they have
       * never had.
       */}
      <p className="text-fg-subtle -mt-1 text-[12px] leading-relaxed">
        Travelling with us? Leave the password empty and we will email you a code.
      </p>

      <AuthSubmit pending={pending} disabled={email.length === 0}>
        Sign In
      </AuthSubmit>

      <p className="text-fg-muted mt-1 text-center text-[13.5px]">
        Don&apos;t have an account?{" "}
        <Link
          href="/join"
          className="text-heading font-medium underline underline-offset-4 hover:opacity-75"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
