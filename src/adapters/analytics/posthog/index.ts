import type { AnalyticsEvent, AnalyticsPort } from "@/ports/analytics";
import { NotImplementedError } from "@/lib/errors";

/** PostHog adapter — integration boundary only. */
export class PostHogAnalyticsAdapter implements AnalyticsPort {
  capture(_event: AnalyticsEvent): Promise<void> {
    throw new NotImplementedError(
      "Analytics capture is not implemented: instrumentation is a later phase (FR-19).",
    );
  }
}
