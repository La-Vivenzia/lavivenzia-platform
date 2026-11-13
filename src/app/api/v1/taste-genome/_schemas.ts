import { z } from "zod";

import { CURATION_TRACKS } from "@/modules/discovery/curation";
import {
  ACOUSTIC_COMFORTS,
  BEVERAGE_PALATES,
  DIETARY_PHILOSOPHIES,
  SEATING_PREFERENCES,
  TELEMETRY_EVENT_TYPES,
} from "@/modules/taste-genome/types";
import { PROFILE_LIMITS } from "@/modules/user-profile/profile";
import { emailSchema, otpCodeSchema } from "../auth/_schemas";

/** One batch is a few seconds of browsing; anything larger is not a browser. */
export const MAX_TELEMETRY_BATCH = 50;

export const calibrationSchema = z
  .object({
    dietary: z.enum(DIETARY_PHILOSOPHIES),
    beverages: z.array(z.enum(BEVERAGE_PALATES)).min(1).max(BEVERAGE_PALATES.length),
    seating: z.enum(SEATING_PREFERENCES),
    acoustic: z.enum(ACOUSTIC_COMFORTS),
  })
  .strict();

const nameSchema = z
  .string()
  .trim()
  .min(1, "Tell us what to call you.")
  .max(PROFILE_LIMITS.fullName, `Name must be at most ${PROFILE_LIMITS.fullName} characters.`);

/**
 * Step one of anchoring. The name is validated here so a typo fails before an
 * email is sent, but it is not stored until the code is verified.
 */
export const anchorRequestSchema = z.object({ name: nameSchema, email: emailSchema }).strict();

/** Step two. The answers travel again so anchoring survives a lost guest session. */
export const anchorVerifySchema = z
  .object({ name: nameSchema, email: emailSchema, code: otpCodeSchema, answers: calibrationSchema })
  .strict();

export const telemetryEventSchema = z
  .object({
    type: z.enum(TELEMETRY_EVENT_TYPES),
    experienceId: z.string().trim().min(1).max(120).optional(),
    track: z.enum(CURATION_TRACKS).optional(),
    query: z.string().trim().max(120).optional(),
    dwellSeconds: z.number().finite().min(0).max(3600).optional(),
    timestamp: z.iso.datetime(),
  })
  .strict();

export const telemetryBatchSchema = z
  .object({ events: z.array(telemetryEventSchema).min(1).max(MAX_TELEMETRY_BATCH) })
  .strict();
