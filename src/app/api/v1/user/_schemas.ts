import { z } from "zod";
import { MAX_PASSWORD_LENGTH } from "@/modules/auth/password-policy";
import {
  CLUSTER_OPTIONS,
  DIETARY_OPTIONS,
  PROFILE_LIMITS,
  VIBE_OPTIONS,
} from "@/modules/user-profile/profile";
import { passwordSchema } from "../auth/_schemas";

/**
 * Request schemas for account settings.
 *
 * Shape and length only. Trimming, blank-to-null, the phone and https rules
 * and the dietary "None" rule live in `normalizeProfileChanges`, which the
 * service applies whoever its caller is.
 */

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const keys = <T extends string>(options: readonly { value: T }[]) =>
  z.array(z.enum(options.map((option) => option.value) as [T, ...T[]])).max(options.length * 2);

/** A taste profile on the wire. Shared by every route that accepts one. */
export const travelPreferencesSchema = z
  .object({
    dietary: keys(DIETARY_OPTIONS),
    vibes: keys(VIBE_OPTIONS),
    clusters: keys(CLUSTER_OPTIONS),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    fullName: optionalText(PROFILE_LIMITS.fullName),
    // Slack over the stored limit for spacing; the domain counts digits.
    phone: optionalText(PROFILE_LIMITS.phone * 2),
    avatarUrl: optionalText(PROFILE_LIMITS.avatarUrl),
    bio: optionalText(PROFILE_LIMITS.bio),
    preferences: travelPreferencesSchema.optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(MAX_PASSWORD_LENGTH),
    // The same rule as sign-up: one policy, one number.
    newPassword: passwordSchema,
  })
  .strict();
