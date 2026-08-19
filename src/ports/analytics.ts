/** Product analytics port (FR-19). Emission is fire-and-forget via the worker. */

export interface AnalyticsEvent {
  readonly name: string;
  /** Anonymous or authenticated distinct ID. */
  readonly distinctId: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly occurredAt: Date;
}

export interface AnalyticsPort {
  capture(event: AnalyticsEvent): Promise<void>;
}
