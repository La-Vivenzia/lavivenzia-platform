import { z } from "zod";
import { HOST_LIMITS, HOST_TYPES } from "@/modules/hosts/profile";
import { EXPERIENCE_LIMITS, PRICING_UNITS } from "@/modules/experiences/readiness";
import { HOST_ACTIONS } from "@/modules/experiences/lifecycle";

/**
 * Request schemas for the host surface.
 *
 * Bounds come from the domain constants rather than being repeated here, so a
 * limit cannot be tightened in one place and left stale in the other.
 *
 * Every object is `.strict()`. An unexpected key is rejected rather than
 * ignored: silently dropping `status` from a request body is how a client comes
 * to believe it can set one.
 */

/** Trim, then treat an emptied field as explicitly cleared. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer.`)
    .transform((value) => value.trim())
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= min, `${label} must be at least ${min} characters.`)
    .refine((value) => value.length <= max, `${label} must be ${max} characters or fewer.`);

/**
 * A phone number, kept deliberately permissive.
 *
 * Digits, spaces and the punctuation people actually type. Strict E.164 would
 * reject a correctly written Indian landline, and this value is for a human to
 * call, not for a machine to dial.
 */
const phoneSchema = z
  .string()
  .max(HOST_LIMITS.phone.max)
  .regex(/^[0-9+()\-\s]{6,}$/, "Enter a valid phone number.")
  .transform((value) => value.trim())
  .nullable();

/** Only http(s). A `javascript:` or `data:` URL rendered as a link is stored XSS. */
const urlSchema = z
  .url("Enter a valid URL.")
  .max(HOST_LIMITS.websiteUrl.max)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    "Links must start with http:// or https://.",
  )
  .nullable();

/** ISO 3166-1 alpha-2, upper-cased so storage is consistent. */
const countrySchema = z
  .string()
  .length(2, "Use a two-letter country code.")
  .regex(/^[A-Za-z]{2}$/, "Use a two-letter country code.")
  .transform((value) => value.toUpperCase());

// ── Host profile ───────────────────────────────────────────────────────────

export const createHostProfileSchema = z
  .object({
    displayName: requiredText(
      HOST_LIMITS.displayName.min,
      HOST_LIMITS.displayName.max,
      "Display name",
    ),
    hostType: z.enum(HOST_TYPES),
    contactEmail: z.email("Enter a valid email address.").max(254).nullable().optional(),
  })
  .strict();

export const updateHostProfileSchema = z
  .object({
    displayName: requiredText(
      HOST_LIMITS.displayName.min,
      HOST_LIMITS.displayName.max,
      "Display name",
    ).optional(),
    legalName: optionalText(HOST_LIMITS.legalName.max).optional(),
    hostType: z.enum(HOST_TYPES).optional(),
    contactEmail: z.email("Enter a valid email address.").max(254).nullable().optional(),
    contactPhone: phoneSchema.optional(),
    websiteUrl: urlSchema.optional(),
    headline: optionalText(HOST_LIMITS.headline.max).optional(),
    about: optionalText(HOST_LIMITS.about.max).optional(),
    city: optionalText(HOST_LIMITS.city.max).optional(),
    region: optionalText(HOST_LIMITS.region.max).optional(),
    country: countrySchema.optional(),
  })
  .strict();

// ── Experiences ────────────────────────────────────────────────────────────

export const createExperienceSchema = z
  .object({
    title: requiredText(EXPERIENCE_LIMITS.title.min, EXPERIENCE_LIMITS.title.max, "Title"),
  })
  .strict();

const listSchema = (maxItems: number, maxLength: number) =>
  z
    .array(
      z
        .string()
        .max(maxLength)
        .transform((value) => value.trim()),
    )
    .max(maxItems, `Add at most ${maxItems} items.`)
    // Blank rows are an artefact of the editor, not content the host meant.
    .transform((items) => items.filter((item) => item.length > 0));

export const updateExperienceSchema = z
  .object({
    title: requiredText(
      EXPERIENCE_LIMITS.title.min,
      EXPERIENCE_LIMITS.title.max,
      "Title",
    ).optional(),
    summary: optionalText(EXPERIENCE_LIMITS.summary.max).optional(),
    description: optionalText(EXPERIENCE_LIMITS.description.max).optional(),
    categoryId: z.uuid("Choose a category from the list.").nullable().optional(),

    addressLine: optionalText(EXPERIENCE_LIMITS.addressLine.max).optional(),
    city: optionalText(EXPERIENCE_LIMITS.city.max).optional(),
    region: optionalText(EXPERIENCE_LIMITS.region.max).optional(),
    country: countrySchema.optional(),
    postalCode: optionalText(EXPERIENCE_LIMITS.postalCode.max).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),

    durationMinutes: z
      .number()
      .int()
      .min(EXPERIENCE_LIMITS.durationMinutes.min)
      .max(EXPERIENCE_LIMITS.durationMinutes.max)
      .nullable()
      .optional(),
    minGuests: z
      .number()
      .int()
      .min(EXPERIENCE_LIMITS.guests.min)
      .max(EXPERIENCE_LIMITS.guests.max)
      .optional(),
    maxGuests: z
      .number()
      .int()
      .min(EXPERIENCE_LIMITS.guests.min)
      .max(EXPERIENCE_LIMITS.guests.max)
      .nullable()
      .optional(),
    languages: z.array(z.string().length(2)).max(EXPERIENCE_LIMITS.languages.max).optional(),

    /**
     * Minor units, integer. The client converts from what the host typed.
     *
     * This is the host's list price and nothing more — no fee, tax or
     * commission is accepted, derived or returned anywhere on this surface.
     */
    basePriceMinor: z
      .number()
      .int("Enter a price without fractions of a paisa.")
      .min(0)
      .max(EXPERIENCE_LIMITS.basePriceMinor.max)
      .nullable()
      .optional(),
    pricingUnit: z.enum(PRICING_UNITS).optional(),

    inclusions: listSchema(
      EXPERIENCE_LIMITS.listCount.max,
      EXPERIENCE_LIMITS.listItem.max,
    ).optional(),
    exclusions: listSchema(
      EXPERIENCE_LIMITS.listCount.max,
      EXPERIENCE_LIMITS.listItem.max,
    ).optional(),
    guestNotes: optionalText(EXPERIENCE_LIMITS.guestNotes.max).optional(),
  })
  .strict();

export const experienceActionSchema = z.object({ action: z.enum(HOST_ACTIONS) }).strict();

export const updateMediaSchema = z
  .object({
    altText: optionalText(200).optional(),
    position: z.number().int().min(0).max(EXPERIENCE_LIMITS.media.max).optional(),
  })
  .strict();

export const experienceQuerySchema = z
  .object({
    status: z
      .enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "REJECTED", "SUSPENDED", "ARCHIVED"])
      .optional(),
  })
  .strict();
