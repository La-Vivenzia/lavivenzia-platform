"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { destinationForRoles } from "@/lib/destinations";
import type { RoleKey } from "@/modules/auth/permissions";

interface LoginResponse {
  readonly mfaRequired: boolean;
}

interface MeResponse {
  readonly roles: readonly RoleKey[];
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.post<LoginResponse>("/api/v1/auth/login", { email, password });

      // `refresh` before navigating, so the server components on the next page
      // are rendered with the new session rather than from a cached tree that
      // still believes the user is anonymous.
      router.refresh();

      if (result.mfaRequired) {
        // Privileged accounts land on an MFA-unsatisfied session, where
        // `authorize()` refuses every privileged permission. The second factor
        // comes before the console, not after it.
        router.push("/mfa");
        return;
      }

      // Where someone belongs depends on what they hold, and a person may hold
      // several roles. Asking the server rather than guessing from the form.
      const me = await api.get<MeResponse>("/api/v1/auth/me");
      router.push(destinationForRoles(me.roles));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not sign you in. Please check your connection and try again.",
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
      />

      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••••••"
      />

      <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
