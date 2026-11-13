import { z } from "zod";

import { CURATION_TRACKS } from "@/modules/discovery/curation";
import {
  COMPANION_OPTIONS,
  HUB_OPTIONS,
  PALATE_OPTIONS,
  TELEMETRY_EVENT_TYPES,
} from "@/modules/taste-genome/types";

/** One batch is a few seconds of browsing; anything larger is not a browser. */
export const MAX_TELEMETRY_BATCH = 50;

export const calibrationSchema = z
  .object({
    mood: z.enum(CURATION_TRACKS),
    palate: z.array(z.enum(PALATE_OPTIONS)).max(PALATE_OPTIONS.length),
    companion: z.enum(COMPANION_OPTIONS),
    hub: z.enum(HUB_OPTIONS),
  })
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
