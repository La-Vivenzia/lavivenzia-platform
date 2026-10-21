"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthSubmit } from "@/components/auth/AuthScreen";
import { CodeInput } from "@/components/auth/CodeInput";
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

interface EnrolmentResponse {
  readonly provisioningUri: string;
  /** Inline SVG as a data URI. Rendered by this process, never by a QR service. */
  readonly qrCode: string;
  readonly manualKey: string | null;
}

export function MfaChallenge({ destination }: { readonly destination: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolment, setEnrolment] = useState<EnrolmentResponse | null>(null);
  const [enrolled, setEnrolled] = useState(false);

  async function beginEnrolment(): Promise<void> {
    setError(null);
    setEnrolling(true);
    setSetupOpen(true);

    try {
      setEnrolment(await api.post<EnrolmentResponse>("/api/v1/auth/mfa/enroll"));
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
        <CodeInput value={code} onChange={setCode} autoFocus />

        <AuthSubmit pending={submitting} disabled={code.length !== 6}>
          Verify Code
        </AuthSubmit>
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

            {enrolment ? (
              <div className="flex flex-col gap-5">
                <p className="text-text-muted text-[13px] leading-relaxed">
                  Scan this with your authenticator app, then type the six-digit code it produces
                  above.
                </p>

                <div className="flex justify-center">
                  {/*
                   * A data URI produced on the server. No request leaves the
                   * browser for it — a public QR service would be handed the
                   * shared secret of a privileged account.
                   *
                   * Plain <img>, not next/image: the optimiser has nothing to do
                   * with an inline SVG, and routing a secret through it would be
                   * an odd place to put one.
                   */}
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      next/image optimises remote and local files; there is
                      nothing to optimise in an inline SVG data URI, and it
                      would route the shared secret through the image
                      optimiser for no benefit. */}
                  <img
                    src={enrolment.qrCode}
                    alt="QR code for setting up your authenticator app"
                    width={200}
                    height={200}
                    className="border-line bg-surface rounded-sm border p-3"
                  />
                </div>

                {enrolment.manualKey ? (
                  <details className="border-line border-t pt-4">
                    <summary className="text-text-muted hover:text-text cursor-pointer text-[13px]">
                      Cannot scan? Enter the key by hand
                    </summary>
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-text-subtle text-[12px] leading-relaxed">
                        In your authenticator app choose &ldquo;enter a setup key&rdquo;, paste
                        this, and set the type to time-based.
                      </p>
                      <code className="border-line bg-surface-sunken block border px-4 py-3 font-mono text-[15px] tracking-[0.16em] break-all">
                        {enrolment.manualKey}
                      </code>
                    </div>
                  </details>
                ) : null}

                {/*
                 * Shown once and never logged: this is the second factor.
                 * Anyone who reads it can generate codes for this account.
                 */}
                <p className="text-text-subtle text-[12px] leading-relaxed">
                  Shown once. It is not stored anywhere you can read it again — if you lose access
                  to your authenticator, an administrator has to reset your second factor.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
