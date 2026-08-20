import { z } from "zod";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { OTP_LENGTH } from "@/modules/auth/otp";

/**
 * Request schemas for the auth endpoints.
 *
 * Shared so the same address normalisation applies everywhere: trimmed and
 * lower-cased. The column is citext so the database would match either way, but
 * normalising here keeps rate-limit keys and audit records consistent.
 */

export const emailSchema = z
  .email("Enter a valid email address.")
  .max(254, "Email address is too long.")
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

/**
 * Length is asserted separately from the character class rather than building a
 * regex from `OTP_LENGTH`. A template literal silently mangles the escape — a
 * lone `\d` inside one is an invalid escape that collapses to a literal "d",
 * yielding /^d{6}$/, which rejects every valid code. Keeping the pattern a
 * literal removes that trap while staying tied to the constant.
 */
export const otpCodeSchema = z
  .string()
  .length(OTP_LENGTH, "Enter the code from your email.")
  .regex(/^\d+$/, "Enter the code from your email.");

export const totpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app.");

export const registerSchema = z
  .object({
    email: emailSchema,
    role: z.enum(["traveller", "host"]),
    password: passwordSchema.optional(),
  })
  .strict();

export const loginSchema = z.object({ email: emailSchema, password: z.string() }).strict();

export const otpRequestSchema = z.object({ email: emailSchema }).strict();

export const otpVerifySchema = z.object({ email: emailSchema, code: otpCodeSchema }).strict();

export const mfaVerifySchema = z.object({ code: totpCodeSchema }).strict();
