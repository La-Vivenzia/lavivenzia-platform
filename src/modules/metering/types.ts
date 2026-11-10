/**
 * FinOps metering — the vocabulary.
 *
 * Every outbound call that costs money is described by one `ApiUsageEvent`.
 * Costs are carried twice, both as integers: paise (1 INR = 100) because the
 * budget is set in rupees, and micro-dollars (1 USD = 1,000,000) because most
 * providers invoice in dollars at sub-cent precision. No float is ever stored,
 * so summing a month of events cannot drift.
 */

export const API_PROVIDERS = [
  "GOOGLE_PLACES",
  "GOOGLE_GEMINI",
  "ANTHROPIC",
  "META_WHATSAPP",
  "RESEND",
  "RAZORPAY",
] as const;

export type ApiProvider = (typeof API_PROVIDERS)[number];

/**
 * Which provider each operation belongs to.
 *
 * The single table that both the type and the runtime pairing check derive
 * from, so an operation cannot be recorded against the wrong provider.
 */
export const OPERATION_PROVIDER = {
  "places.autocomplete": "GOOGLE_PLACES",
  "places.searchText": "GOOGLE_PLACES",
  "places.details": "GOOGLE_PLACES",
  "places.photos": "GOOGLE_PLACES",

  "gemini.flash_input": "GOOGLE_GEMINI",
  "gemini.flash_output": "GOOGLE_GEMINI",
  "gemini.flash_total": "GOOGLE_GEMINI",

  "anthropic.sonnet_input": "ANTHROPIC",
  "anthropic.sonnet_output": "ANTHROPIC",
  "anthropic.haiku_input": "ANTHROPIC",
  "anthropic.haiku_output": "ANTHROPIC",

  "whatsapp.utility_conv": "META_WHATSAPP",
  "whatsapp.marketing_conv": "META_WHATSAPP",
  "whatsapp.service_conv": "META_WHATSAPP",
  "whatsapp.outbound_message": "META_WHATSAPP",

  "email.transactional_send": "RESEND",

  "razorpay.payment_fee": "RAZORPAY",
} as const satisfies Record<string, ApiProvider>;

export type ApiOperation = keyof typeof OPERATION_PROVIDER;

export const API_OPERATIONS = Object.keys(OPERATION_PROVIDER) as [ApiOperation, ...ApiOperation[]];

export const USAGE_STATUSES = ["SUCCESS", "ERROR"] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

export interface ApiUsageEvent {
  readonly id: string;
  readonly provider: ApiProvider;
  readonly operation: ApiOperation;
  /** Calls, tokens, conversations, or — for payment fees — transaction paise. */
  readonly units: number;
  /** Integer paise. */
  readonly costMinorInr: number;
  /** Integer micro-dollars. */
  readonly costMicroUsd: number;
  readonly latencyMs: number;
  readonly status: UsageStatus;
  /** ISO 8601. */
  readonly timestamp: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** What a caller supplies; cost, identity and time are the service's. */
export type RecordUsageInput = Omit<
  ApiUsageEvent,
  "id" | "costMinorInr" | "costMicroUsd" | "timestamp"
>;

export const SUMMARY_PERIODS = ["today", "this_week", "this_month", "all_time"] as const;
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number];

export interface ProviderCostBreakdown {
  readonly requestCount: number;
  readonly costInrPaise: number;
  readonly costFormatted: string;
}

export interface BudgetAlert {
  /** True once this month's spend reaches the cap. */
  readonly triggered: boolean;
  readonly monthlyBudgetCapInr: number;
  /** Rupees, for display. Derived from integer paise. */
  readonly currentSpendInr: number;
  /** Two decimal places. */
  readonly percentageUsed: number;
}

export interface FinOpsCostSummary {
  readonly period: SummaryPeriod;
  readonly totalCostInrPaise: number;
  /** e.g. "₹42.50". */
  readonly totalCostInrFormatted: string;
  readonly totalCostMicroUsd: number;
  readonly totalRequests: number;
  readonly errorCount: number;
  readonly providerBreakdown: Record<ApiProvider, ProviderCostBreakdown>;
  /** Always measured against the current month, whatever `period` is. */
  readonly budgetAlert: BudgetAlert;
}
