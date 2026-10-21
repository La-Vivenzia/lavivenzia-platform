"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthField, AuthSubmit, LockGlyph, MailGlyph } from "@/components/auth/AuthScreen";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password-policy";

export function JoinForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Registration deliberately issues no session (a host must demonstrate
      // they can sign in), so the account is created and then signed into. Two
      // calls, and the second failing is recoverable — the account exists and
      // the sign-in page will work.
      await api.post("/api/v1/auth/register", { email, password, role: "host" });
      await api.post("/api/v1/auth/login", { email, password });

      router.refresh();
      router.push("/host");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not create your account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
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
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={`Password — at least ${MIN_PASSWORD_LENGTH} characters`}
        aria-label="Password"
      />

      <AuthSubmit pending={submitting} disabled={passwordTooShort || email.length === 0}>
        Start Hosting
      </AuthSubmit>
    </form>
  );
}
