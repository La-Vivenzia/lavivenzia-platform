"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
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

      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        help="We will use this to reach you about your listings."
      />

      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••••••"
        // Guidance, not a composition rule. Length is what adds entropy; forced
        // symbol classes push people toward predictable substitutions.
        help={`At least ${MIN_PASSWORD_LENGTH} characters. A phrase you will remember beats a short, complicated word.`}
        error={passwordTooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={submitting}
        disabled={passwordTooShort}
        className="w-full"
      >
        Create account
      </Button>
    </form>
  );
}
