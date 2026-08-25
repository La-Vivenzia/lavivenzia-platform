"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ProgressRule, VerificationStatusBadge } from "@/components/ui/status";
import { ApiError, api } from "@/lib/api-client";
import { HOST_LIMITS } from "@/modules/hosts/profile";
import type { HostProfileView } from "@/modules/hosts/service";

/**
 * The full host profile (FR-05).
 *
 * One form, saved on demand. Section-by-section autosave was considered and
 * rejected: a host writing an About paragraph should not have half-sentences
 * committed as they think, and an explicit save is what makes "I have finished
 * this" a decision rather than a guess.
 *
 * The completeness checklist below the form is the same assessment the server
 * enforces at submission, so what the host is told and what the API requires
 * cannot diverge.
 */

interface ProfileState {
  displayName: string;
  legalName: string;
  hostType: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  headline: string;
  about: string;
  city: string;
  region: string;
  country: string;
}

function toState(profile: HostProfileView): ProfileState {
  return {
    displayName: profile.host.displayName,
    legalName: profile.host.legalName ?? "",
    hostType: profile.host.hostType,
    contactEmail: profile.host.contactEmail ?? "",
    contactPhone: profile.host.contactPhone ?? "",
    websiteUrl: profile.host.websiteUrl ?? "",
    headline: profile.host.headline ?? "",
    about: profile.host.about ?? "",
    city: profile.host.city ?? "",
    region: profile.host.region ?? "",
    country: profile.host.country,
  };
}

/** An empty field means "cleared", which the API expresses as null. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function Fieldset({
  legend,
  note,
  children,
}: {
  legend: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-line flex flex-col gap-7 border-t pt-8">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-col gap-1">
        <span className="eyebrow">{legend}</span>
        {note ? <p className="text-text-subtle text-[12px]">{note}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

export function HostProfileEditor({ initial }: { readonly initial: HostProfileView }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [form, setForm] = useState<ProfileState>(() => toState(initial));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const readOnly = !profile.canEdit;

  function update<K extends keyof ProfileState>(key: K, value: ProfileState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const { profile: updated } = await api.patch<{ profile: HostProfileView }>(
        "/api/v1/host/profile",
        {
          displayName: form.displayName.trim(),
          legalName: blankToNull(form.legalName),
          hostType: form.hostType,
          contactEmail: blankToNull(form.contactEmail),
          contactPhone: blankToNull(form.contactPhone),
          websiteUrl: blankToNull(form.websiteUrl),
          headline: blankToNull(form.headline),
          about: blankToNull(form.about),
          city: blankToNull(form.city),
          region: blankToNull(form.region),
          country: form.country.trim().toUpperCase(),
        },
      );

      setProfile(updated);
      setForm(toState(updated));
      setSaved(true);
      // Keeps the rail and the overview in step with the new display name.
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForVerification(): Promise<void> {
    setError(null);
    setSubmitting(true);

    try {
      const { profile: updated } = await api.post<{ profile: HostProfileView }>(
        "/api/v1/host/profile/submit",
      );
      setProfile(updated);
      setForm(toState(updated));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not submit your profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="border-line bg-surface flex flex-wrap items-center justify-between gap-4 border p-5">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Status</span>
          <VerificationStatusBadge status={profile.host.verificationStatus} />
        </div>
        <div className="min-w-[220px] flex-1">
          <ProgressRule
            completed={profile.assessment.completed}
            total={profile.assessment.total}
            label="Completeness"
          />
        </div>
      </div>

      {profile.host.verificationStatus === "PENDING" ? (
        <Alert tone="info" title="Your profile is with our team">
          You cannot edit it while it is being reviewed. We will be in touch shortly.
        </Alert>
      ) : null}

      {profile.host.verificationStatus === "REJECTED" && profile.host.reviewNote ? (
        <Alert tone="warning" title="Changes requested">
          {profile.host.reviewNote}
        </Alert>
      ) : null}

      {profile.host.verificationStatus === "VERIFIED" ? (
        <Alert tone="success" title="Verified">
          Your profile is verified. Contact us if anything needs changing.
        </Alert>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">Your profile has been saved.</Alert> : null}

      <form onSubmit={handleSave} noValidate className="flex flex-col gap-10">
        {/* The whole form is disabled in one place rather than field by field,
            so a locked state cannot be partially applied. */}
        <fieldset disabled={readOnly} className="flex flex-col gap-10">
          <Fieldset legend="Identity">
            <TextField
              label="Display name"
              required
              value={form.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              maxLength={HOST_LIMITS.displayName.max}
            />

            <SelectField
              label="You are"
              required
              value={form.hostType}
              onChange={(event) => update("hostType", event.target.value)}
              options={[
                { value: "INDIVIDUAL", label: "An individual" },
                { value: "COMPANY", label: "A registered business" },
              ]}
            />

            {form.hostType === "COMPANY" ? (
              <TextField
                label="Registered legal name"
                required
                value={form.legalName}
                onChange={(event) => update("legalName", event.target.value)}
                maxLength={HOST_LIMITS.legalName.max}
                help="The entity as registered. Never shown publicly — it is what our team verifies against."
              />
            ) : null}
          </Fieldset>

          <Fieldset
            legend="Contact"
            note="How we and our guest team reach you. Not shown publicly."
          >
            <TextField
              label="Contact email"
              type="email"
              required
              value={form.contactEmail}
              onChange={(event) => update("contactEmail", event.target.value)}
            />

            <TextField
              label="Contact phone"
              type="tel"
              required
              value={form.contactPhone}
              onChange={(event) => update("contactPhone", event.target.value)}
              placeholder="+91 98765 43210"
            />

            <TextField
              label="Website"
              type="url"
              value={form.websiteUrl}
              onChange={(event) => update("websiteUrl", event.target.value)}
              placeholder="https://"
              help="Optional. Helps our team verify you faster."
            />
          </Fieldset>

          <Fieldset legend="Your story" note="This appears on your public host page.">
            <TextField
              label="Headline"
              required
              value={form.headline}
              onChange={(event) => update("headline", event.target.value)}
              maxLength={HOST_LIMITS.headline.max}
              placeholder="Third-generation textile printers in Bagru"
              hint={`${form.headline.length}/${HOST_LIMITS.headline.max}`}
              help="One line. What you do, and where."
            />

            <TextAreaField
              label="About"
              required
              rows={8}
              value={form.about}
              onChange={(event) => update("about", event.target.value)}
              maxLength={HOST_LIMITS.about.max}
              hint={`${form.about.length}/${HOST_LIMITS.about.max}`}
              help={`At least ${HOST_LIMITS.about.min} characters. Travellers read this before they book — write it the way you would tell a guest.`}
            />
          </Fieldset>

          <Fieldset
            legend="Based in"
            note="Where you operate from, not where each experience happens."
          >
            <div className="grid gap-7 sm:grid-cols-2">
              <TextField
                label="City"
                required
                value={form.city}
                onChange={(event) => update("city", event.target.value)}
                maxLength={HOST_LIMITS.city.max}
              />
              <TextField
                label="State or region"
                value={form.region}
                onChange={(event) => update("region", event.target.value)}
                maxLength={HOST_LIMITS.region.max}
              />
            </div>

            <TextField
              label="Country"
              required
              value={form.country}
              onChange={(event) => update("country", event.target.value.toUpperCase())}
              maxLength={2}
              help="Two-letter country code, for example IN."
            />
          </Fieldset>
        </fieldset>

        {!readOnly ? (
          <div className="border-line flex flex-wrap items-center gap-4 border-t pt-8">
            <Button type="submit" variant="primary" size="lg" loading={saving}>
              Save profile
            </Button>

            <Button
              type="button"
              size="lg"
              loading={submitting}
              // Submission needs a complete profile *as stored*, so a host must
              // save before submitting. Disabling until then is clearer than
              // letting the server refuse.
              disabled={!profile.canSubmit || saving}
              onClick={() => void handleSubmitForVerification()}
            >
              Submit for verification
            </Button>

            {!profile.assessment.isComplete ? (
              <p className="text-text-subtle text-[12px]">
                {profile.assessment.missing.length} field
                {profile.assessment.missing.length === 1 ? "" : "s"} remaining
              </p>
            ) : null}
          </div>
        ) : null}
      </form>

      {profile.assessment.missing.length > 0 ? (
        <section className="border-line bg-surface-sunken border p-6">
          <span className="eyebrow">Before you can submit</span>
          <ul className="mt-4 flex flex-col gap-2">
            {profile.assessment.missing.map((entry) => (
              <li
                key={entry.field}
                className="text-text-muted flex items-baseline gap-3 text-[13px]"
              >
                <span aria-hidden="true" className="bg-gold mt-2 h-1 w-1 shrink-0 rounded-full" />
                {entry.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
