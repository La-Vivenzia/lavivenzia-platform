"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { HOST_LIMITS } from "@/modules/hosts/profile";

/**
 * The first three questions.
 *
 * Kept short on purpose: a long form at the very start is where onboarding is
 * abandoned. The profile is created from this and everything else is edited
 * afterwards, saved whenever the host chooses.
 */
export function StartProfileForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [hostType, setHostType] = useState("INDIVIDUAL");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.post("/api/v1/host/profile", {
        displayName,
        hostType,
        contactEmail: contactEmail.trim() === "" ? null : contactEmail.trim(),
      });

      // The page is a server component reading the profile, so refreshing is
      // what turns this form into the editor.
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not save your profile. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <TextField
        label="Display name"
        required
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        maxLength={HOST_LIMITS.displayName.max}
        placeholder="The name travellers will see"
        help="Your public name — a studio, an atelier, a family name. It can be changed later."
      />

      <SelectField
        label="You are"
        required
        value={hostType}
        onChange={(event) => setHostType(event.target.value)}
        options={[
          { value: "INDIVIDUAL", label: "An individual" },
          { value: "COMPANY", label: "A registered business" },
        ]}
        help="A registered business will also be asked for its legal name before verification."
      />

      <TextField
        label="Contact email"
        type="email"
        value={contactEmail}
        onChange={(event) => setContactEmail(event.target.value)}
        placeholder="bookings@example.com"
        help="Where we reach you about listings and guests. Leave blank to use your sign-in address."
      />

      <div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          disabled={displayName.trim().length < HOST_LIMITS.displayName.min}
        >
          Create profile
        </Button>
      </div>
    </form>
  );
}
