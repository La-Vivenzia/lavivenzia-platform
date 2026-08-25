"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Alert, SectionHeading } from "@/components/ui/feedback";
import { ExperienceStatusBadge, ProgressRule } from "@/components/ui/status";
import { GoldRule } from "@/components/ui/wordmark";
import { ApiError, api } from "@/lib/api-client";
import { formatMinorForInput, parseMoneyToMinor } from "@/lib/format";
import { EXPERIENCE_LIMITS } from "@/modules/experiences/readiness";
import type { HostAction } from "@/modules/experiences/lifecycle";
import type { CategoryRecord, MediaRecord } from "@/modules/experiences/ports";
import type { ExperienceView } from "@/modules/experiences/service";
import { MediaManager } from "./media-manager";

/**
 * The experience editor (FR-06, FR-07).
 *
 * One long editorial form rather than a wizard. A wizard is right when steps
 * depend on each other; here they do not, and a host who wants to add two
 * photographs and leave should not have to walk through pricing to do it.
 *
 * The readiness checklist beside the form is the same assessment the server
 * enforces on submission, returned with every save — so it can never tell the
 * host something the API will then contradict.
 */

interface FormState {
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  addressLine: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  durationMinutes: string;
  minGuests: string;
  maxGuests: string;
  price: string;
  pricingUnit: string;
  inclusions: string;
  exclusions: string;
  guestNotes: string;
}

function toForm(view: ExperienceView): FormState {
  const e = view.experience;
  return {
    title: e.title,
    summary: e.summary ?? "",
    description: e.description ?? "",
    categoryId: e.categoryId ?? "",
    addressLine: e.addressLine ?? "",
    city: e.city ?? "",
    region: e.region ?? "",
    country: e.country,
    postalCode: e.postalCode ?? "",
    durationMinutes: e.durationMinutes === null ? "" : String(e.durationMinutes),
    minGuests: String(e.minGuests),
    maxGuests: e.maxGuests === null ? "" : String(e.maxGuests),
    price: formatMinorForInput(e.basePriceMinor, e.currency),
    pricingUnit: e.pricingUnit,
    // One item per line. A repeating row editor for a list of short strings is
    // more chrome than content, and a textarea is what people paste into anyway.
    inclusions: e.inclusions.join("\n"),
    exclusions: e.exclusions.join("\n"),
    guestNotes: e.guestNotes ?? "",
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function Section({
  legend,
  note,
  children,
}: {
  readonly legend: string;
  readonly note?: string;
  readonly children: ReactNode;
}) {
  return (
    <fieldset className="border-line flex flex-col gap-7 border-t pt-8">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-col gap-1">
        <span className="eyebrow">{legend}</span>
        {note ? <p className="text-text-subtle max-w-xl text-[12px]">{note}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

const ACTION_LABELS: Record<HostAction, string> = {
  submit: "Submit for review",
  withdraw: "Withdraw from review",
  archive: "Archive",
  restore: "Restore to draft",
};

export function ExperienceEditor({
  initial,
  categories,
}: {
  readonly initial: ExperienceView;
  readonly categories: readonly CategoryRecord[];
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [media, setMedia] = useState<readonly MediaRecord[]>(initial.experience.media);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<HostAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const experience = view.experience;
  const readOnly = !view.canEdit;
  const base = `/api/v1/host/experiences/${experience.id}`;

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function applyView(next: ExperienceView): void {
    setView(next);
    setForm(toForm(next));
    setMedia(next.experience.media);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const { experience: next } = await api.patch<{ experience: ExperienceView }>(base, {
        title: form.title.trim(),
        summary: blankToNull(form.summary),
        description: blankToNull(form.description),
        categoryId: form.categoryId === "" ? null : form.categoryId,
        addressLine: blankToNull(form.addressLine),
        city: blankToNull(form.city),
        region: blankToNull(form.region),
        country: form.country.trim().toUpperCase(),
        postalCode: blankToNull(form.postalCode),
        durationMinutes: toIntOrNull(form.durationMinutes),
        minGuests: toIntOrNull(form.minGuests) ?? 1,
        maxGuests: toIntOrNull(form.maxGuests),
        // Converted to integer minor units here; the API accepts nothing else.
        basePriceMinor: parseMoneyToMinor(form.price, experience.currency),
        pricingUnit: form.pricingUnit,
        inclusions: toLines(form.inclusions),
        exclusions: toLines(form.exclusions),
        guestNotes: blankToNull(form.guestNotes),
      });

      applyView(next);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function performAction(action: HostAction): Promise<void> {
    setError(null);
    setActing(action);

    try {
      const { experience: next } = await api.post<{ experience: ExperienceView }>(
        `${base}/actions`,
        { action },
      );
      applyView(next);
      setSaved(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : `We could not ${action} this experience.`,
      );
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <section className="bg-ink text-text-inverse">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
          <Link
            href="/host/experiences"
            className="text-text-inverse-muted hover:text-gold-light text-[11px] tracking-[0.16em] uppercase transition-colors"
          >
            ← All experiences
          </Link>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-4">
              <ExperienceStatusBadge status={experience.status} />
              <h1 className="font-display max-w-2xl text-[26px] leading-tight sm:text-[30px]">
                {experience.title}
              </h1>
              <GoldRule />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink
                href={`/host/experiences/${experience.id}/preview`}
                size="sm"
                className="border-line-inverse text-text-inverse hover:border-gold-light hover:text-gold-light hover:bg-transparent"
              >
                Preview
              </ButtonLink>

              {view.actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "submit" ? "primary" : "secondary"}
                  loading={acting === action}
                  disabled={acting !== null || (action === "submit" && !view.readiness.isReady)}
                  onClick={() => void performAction(action)}
                  className={
                    action === "submit"
                      ? "border-gold-light bg-gold-light text-ink hover:bg-gold-light/90 hover:border-gold-light"
                      : "border-line-inverse text-text-inverse hover:border-gold-light hover:text-gold-light hover:bg-transparent"
                  }
                >
                  {ACTION_LABELS[action]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1120px] px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-16">
          {/* ── Form ────────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-8">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {saved ? <Alert tone="success">Your changes have been saved.</Alert> : null}

            {experience.status === "IN_REVIEW" ? (
              <Alert tone="info" title="With our team">
                This experience is in the review queue. Withdraw it if you need to make changes.
              </Alert>
            ) : null}

            {experience.status === "REJECTED" && experience.reviewNote ? (
              <Alert tone="warning" title="Changes requested">
                {experience.reviewNote}
              </Alert>
            ) : null}

            {experience.status === "PUBLISHED" ? (
              <Alert tone="success" title="Published">
                This experience is live. Editing a published listing is not available yet — it would
                bypass the review it was approved through.
              </Alert>
            ) : null}

            <form onSubmit={handleSave} noValidate className="flex flex-col gap-10">
              <fieldset disabled={readOnly} className="flex flex-col gap-10">
                <Section
                  legend="The experience"
                  note="What a traveller reads first. Write it the way you would describe it to a guest at your table."
                >
                  <TextField
                    label="Title"
                    required
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                    maxLength={EXPERIENCE_LIMITS.title.max}
                    hint={`${form.title.length}/${EXPERIENCE_LIMITS.title.max}`}
                  />

                  <TextAreaField
                    label="Summary"
                    required
                    rows={2}
                    value={form.summary}
                    onChange={(event) => update("summary", event.target.value)}
                    maxLength={EXPERIENCE_LIMITS.summary.max}
                    hint={`${form.summary.length}/${EXPERIENCE_LIMITS.summary.max}`}
                    help="One line, shown on cards and in search results."
                  />

                  <TextAreaField
                    label="Description"
                    required
                    rows={10}
                    value={form.description}
                    onChange={(event) => update("description", event.target.value)}
                    maxLength={EXPERIENCE_LIMITS.description.max}
                    hint={`${form.description.length}/${EXPERIENCE_LIMITS.description.max}`}
                    help={`At least ${EXPERIENCE_LIMITS.description.min} characters. What happens, in what order, and what makes it yours.`}
                  />

                  <SelectField
                    label="Category"
                    required
                    value={form.categoryId}
                    onChange={(event) => update("categoryId", event.target.value)}
                    placeholder="Choose a category"
                    options={categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                    }))}
                  />
                </Section>

                <Section
                  legend="Photographs"
                  note="The first image is the cover. Nothing else on the listing works as hard."
                >
                  <MediaManager
                    experienceId={experience.id}
                    media={media}
                    disabled={readOnly}
                    onChange={setMedia}
                  />
                </Section>

                <Section legend="Where it happens">
                  <TextField
                    label="Address"
                    value={form.addressLine}
                    onChange={(event) => update("addressLine", event.target.value)}
                    maxLength={EXPERIENCE_LIMITS.addressLine.max}
                    help="Shown to guests after booking. Search only uses the city."
                  />

                  <div className="grid gap-7 sm:grid-cols-2">
                    <TextField
                      label="City"
                      required
                      value={form.city}
                      onChange={(event) => update("city", event.target.value)}
                      maxLength={EXPERIENCE_LIMITS.city.max}
                    />
                    <TextField
                      label="State or region"
                      value={form.region}
                      onChange={(event) => update("region", event.target.value)}
                      maxLength={EXPERIENCE_LIMITS.region.max}
                    />
                  </div>

                  <div className="grid gap-7 sm:grid-cols-2">
                    <TextField
                      label="Postal code"
                      value={form.postalCode}
                      onChange={(event) => update("postalCode", event.target.value)}
                      maxLength={EXPERIENCE_LIMITS.postalCode.max}
                    />
                    <TextField
                      label="Country"
                      required
                      value={form.country}
                      onChange={(event) => update("country", event.target.value.toUpperCase())}
                      maxLength={2}
                      help="Two-letter code, for example IN."
                    />
                  </div>
                </Section>

                <Section legend="Practicalities">
                  <div className="grid gap-7 sm:grid-cols-3">
                    <TextField
                      label="Duration"
                      required
                      inputMode="numeric"
                      value={form.durationMinutes}
                      onChange={(event) => update("durationMinutes", event.target.value)}
                      help="In minutes."
                    />
                    <TextField
                      label="Minimum guests"
                      inputMode="numeric"
                      value={form.minGuests}
                      onChange={(event) => update("minGuests", event.target.value)}
                    />
                    <TextField
                      label="Maximum guests"
                      required
                      inputMode="numeric"
                      value={form.maxGuests}
                      onChange={(event) => update("maxGuests", event.target.value)}
                    />
                  </div>
                </Section>

                <Section
                  legend="Price"
                  note="Your price, as a traveller will see it. Commission, taxes and payouts are handled separately and are not set here."
                >
                  <div className="grid gap-7 sm:grid-cols-2">
                    <TextField
                      label={`Price (${experience.currency})`}
                      required
                      inputMode="decimal"
                      value={form.price}
                      onChange={(event) => update("price", event.target.value)}
                      placeholder="0"
                    />
                    <SelectField
                      label="Charged"
                      value={form.pricingUnit}
                      onChange={(event) => update("pricingUnit", event.target.value)}
                      options={[
                        { value: "PER_PERSON", label: "Per person" },
                        { value: "PER_GROUP", label: "Per group" },
                      ]}
                    />
                  </div>
                </Section>

                <Section legend="What is included" note="One per line.">
                  <TextAreaField
                    label="Included"
                    rows={5}
                    value={form.inclusions}
                    onChange={(event) => update("inclusions", event.target.value)}
                    placeholder={
                      "All ingredients and equipment\nDinner with the family\nRecipe notes to take home"
                    }
                  />
                  <TextAreaField
                    label="Not included"
                    rows={4}
                    value={form.exclusions}
                    onChange={(event) => update("exclusions", event.target.value)}
                    placeholder={"Travel to the venue\nAlcoholic drinks"}
                  />
                  <TextAreaField
                    label="Guest notes"
                    rows={4}
                    value={form.guestNotes}
                    onChange={(event) => update("guestNotes", event.target.value)}
                    maxLength={EXPERIENCE_LIMITS.guestNotes.max}
                    help="What to wear, what to bring, accessibility, anything a guest should know beforehand."
                  />
                </Section>
              </fieldset>

              {!readOnly ? (
                <div className="border-line flex flex-wrap items-center gap-4 border-t pt-8">
                  <Button type="submit" variant="primary" size="lg" loading={saving}>
                    Save draft
                  </Button>
                  <p className="text-text-subtle text-[12px]">
                    Saved drafts stay private until our team approves them.
                  </p>
                </div>
              ) : null}
            </form>
          </div>

          {/* ── Readiness ───────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-10">
            <div className="border-line bg-surface flex flex-col gap-6 border p-6">
              <SectionHeading eyebrow="Before review" title="Readiness" />

              <ProgressRule
                completed={view.readiness.completed}
                total={view.readiness.total}
                label="Checklist"
              />

              {view.readiness.isReady ? (
                <Alert tone="success">
                  Everything we need is here. Submit when you are ready — our team reviews listings
                  before they go live.
                </Alert>
              ) : (
                <ul className="flex flex-col gap-3">
                  {view.readiness.issues.map((issue) => (
                    <li
                      key={issue.field}
                      className="text-text-muted flex items-baseline gap-3 text-[13px] leading-relaxed"
                    >
                      <span
                        aria-hidden="true"
                        className="bg-gold mt-2 h-1 w-1 shrink-0 rounded-full"
                      />
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-text-subtle border-line border-t pt-4 text-[12px] leading-relaxed">
                The checklist updates when you save. It is the same list our review queue applies.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
