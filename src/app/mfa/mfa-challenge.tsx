"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";

/**
 * Enrol an authenticator, then satisfy the challenge.
 *
 * Both use the endpoints that already existed; what was missing was a screen.
 *
 * The code field is shown first, because most visits are a returning operator
 * entering a code. Enrolment is behind a disclosure — needed once, then never
 * again, and `beginMfaEnrolment` refuses a second attempt anyway, which is what
 * stops a hijacked session swapping the second factor.
 */

/** Pull the shared secret out of the provisioning URI for manual entry. */
function secretFrom(uri: string): string | null {
  try {
    return new URL(uri.replace("otpauth://", "https://")).searchParams.get("secret");
  } catch {
    return null;
  }
}

/** Grouped into fours — a 32-character string is otherwise unreadable to type. */
function grouped(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}

export function MfaChallenge({ destination }: { readonly destination: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);

  async function beginEnrolment(): Promise<void> {
    setError(null);
    setEnrolling(true);
    setSetupOpen(true);

    try {
      const result = await api.post<{ provisioningUri: string }>("/api/v1/auth/mfa/enroll");
      setProvisioningUri(result.provisioningUri);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        // Already enrolled. Not an error to recover from — just tell them to
        // use the app they already have.
        setEnrolled(true);
      } else {
        setError(caught instanceof ApiError ? caught.message : "We could not start enrolment.");
      }
    } finally {
      setEnrolling(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.post("/api/v1/auth/mfa/verify", { code });

      // The session is now MFA-satisfied server-side. `refresh` rebuilds the
      // server components with that, then the console is reachable.
      router.refresh();
      router.push(destination);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not verify that code.");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  const secret = provisioningUri ? secretFrom(provisioningUri) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[26px] leading-tight">Two-factor authentication</h1>
        <p className="text-text-muted text-[14px] leading-relaxed">
          Enter the six-digit code from your authenticator app.
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
        <TextField
          label="Authentication code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="000000"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          disabled={code.length !== 6}
          className="w-full"
        >
          Verify
        </Button>
      </form>

      <div className="border-line border-t pt-6">
        {!setupOpen ? (
          <button
            type="button"
            onClick={() => void beginEnrolment()}
            className="text-gold-deep hover:text-gold text-[13px] font-medium underline underline-offset-4"
          >
            Setting up a new authenticator?
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            {enrolling ? (
              <p className="text-text-muted text-[13px]">Preparing your secret…</p>
            ) : null}

            {enrolled ? (
              <Alert tone="info" title="Already enrolled">
                This account has an authenticator set up. Enter a code from it above. If you have
                lost access to it, an administrator must reset your second factor.
              </Alert>
            ) : null}

            {secret ? (
              <div className="flex flex-col gap-3">
                <p className="text-text-muted text-[13px] leading-relaxed">
                  Add a new account in your authenticator app and enter this key by hand, then type
                  the code it produces above.
                </p>

                <code className="border-line bg-surface-sunken block border px-4 py-3 font-mono text-[15px] tracking-[0.16em] break-all">
                  {grouped(secret)}
                </code>

                {/*
                 * Shown once and never logged: this string is the second factor.
                 * Anyone who reads it can generate codes for this account.
                 */}
                <p className="text-text-subtle text-[12px] leading-relaxed">
                  Shown once. It is not stored anywhere you can read it again — if you lose it, an
                  administrator has to reset your second factor.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
