import {
  DEFAULT_MONTHLY_BUDGET_CAP_INR,
  PAISE_PER_INR,
  calculateApiCost,
  formatInrPaise,
} from "@/modules/metering/rates";
import {
  API_PROVIDERS,
  USAGE_STATUSES,
  type ApiProvider,
  type ApiUsageEvent,
  type FinOpsCostSummary,
  type ProviderCostBreakdown,
  type RecordUsageInput,
  type SummaryPeriod,
} from "@/modules/metering/types";

/**
 * Metering service.
 *
 * Holds the most recent usage events in a fixed-size ring buffer and answers
 * cost questions over them. Storage is process memory by design (FinOps spec
 * §1.5): it is an operational gauge, not a ledger. It does not survive a
 * restart and each instance sees only its own traffic — the provider invoices
 * remain the record of what was spent.
 *
 * The one hard rule is that metering can never hurt the request it observes.
 * `record` does not throw and does no I/O; a malformed event is dropped with a
 * warning. Adapters call it through `recordUsageSafely`, which also survives an
 * injected recorder that does throw.
 */

export const DEFAULT_METERING_CAPACITY = 10_000;

/**
 * Period boundaries are India Standard Time.
 *
 * The budget is in rupees and the team reading it is in India, so "today" is
 * an IST day. IST has no daylight saving, which is what makes a fixed offset
 * correct rather than approximate.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MeteringWarn = (context: Record<string, unknown>, message: string) => void;

export interface MeteringServiceOptions {
  readonly capacity?: number;
  readonly monthlyBudgetCapInr?: number;
  /** Injected in tests to move time. */
  readonly now?: () => Date;
  readonly generateId?: () => string;
  readonly warn?: MeteringWarn;
}

/** The slice of the service an adapter depends on. */
export interface UsageRecorder {
  record(input: RecordUsageInput): ApiUsageEvent | null;
}

/** Start of the IST day, week (Monday) or month containing `now`, in epoch ms. */
export function periodStart(period: SummaryPeriod, now: Date): number {
  if (period === "all_time") return Number.NEGATIVE_INFINITY;

  // Shift into IST, read the calendar fields in UTC, shift back.
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  if (period === "this_month") return Date.UTC(year, month, 1) - IST_OFFSET_MS;

  const startOfDay = Date.UTC(year, month, day) - IST_OFFSET_MS;
  if (period === "today") return startOfDay;

  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return startOfDay - daysSinceMonday * DAY_MS;
}

function emptyBreakdown(): Record<ApiProvider, { requestCount: number; costInrPaise: number }> {
  return Object.fromEntries(
    API_PROVIDERS.map((provider) => [provider, { requestCount: 0, costInrPaise: 0 }]),
  ) as Record<ApiProvider, { requestCount: number; costInrPaise: number }>;
}

export class MeteringService implements UsageRecorder {
  readonly #capacity: number;
  readonly #budgetCapInr: number;
  readonly #now: () => Date;
  readonly #generateId: () => string;
  readonly #warn: MeteringWarn;

  /** Ring buffer. `#next` is the slot the next event is written to. */
  readonly #slots: (ApiUsageEvent | undefined)[];
  /** Epoch ms of each slot, kept alongside so filtering does not re-parse ISO strings. */
  readonly #times: number[];
  #next = 0;
  #size = 0;

  constructor(options: MeteringServiceOptions = {}) {
    const capacity = options.capacity ?? DEFAULT_METERING_CAPACITY;
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("Metering capacity must be a positive integer.");
    }

    this.#capacity = capacity;
    this.#budgetCapInr = options.monthlyBudgetCapInr ?? DEFAULT_MONTHLY_BUDGET_CAP_INR;
    this.#now = options.now ?? (() => new Date());
    this.#generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
    this.#warn = options.warn ?? ((context, message) => console.warn(message, context));
    this.#slots = new Array<ApiUsageEvent | undefined>(capacity);
    this.#times = new Array<number>(capacity).fill(0);
  }

  get capacity(): number {
    return this.#capacity;
  }

  get size(): number {
    return this.#size;
  }

  /**
   * Price and store one event. Returns the stored event, or `null` when the
   * input was unusable — never throws.
   *
   * A failed call is stored with zero cost: providers do not bill a request
   * they rejected, and it still counts toward `errorCount`.
   */
  record(input: RecordUsageInput): ApiUsageEvent | null {
    try {
      if (!USAGE_STATUSES.includes(input.status)) {
        throw new TypeError("Unknown usage status.");
      }

      const latencyMs =
        Number.isFinite(input.latencyMs) && input.latencyMs > 0 ? Math.round(input.latencyMs) : 0;

      // Priced even on failure, so a bad provider/operation pair or bad units
      // are rejected the same way whatever the status.
      const cost = calculateApiCost(input.provider, input.operation, input.units, {
        inSession: input.metadata?.["inSession"] === true,
      });

      const now = this.#now();
      const event: ApiUsageEvent = Object.freeze({
        id: this.#generateId(),
        provider: input.provider,
        operation: input.operation,
        units: input.units,
        costMinorInr: input.status === "SUCCESS" ? cost.costMinorInr : 0,
        costMicroUsd: input.status === "SUCCESS" ? cost.costMicroUsd : 0,
        latencyMs,
        status: input.status,
        timestamp: now.toISOString(),
        ...(input.metadata ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
      });

      this.#slots[this.#next] = event;
      this.#times[this.#next] = now.getTime();
      this.#next = (this.#next + 1) % this.#capacity;
      this.#size = Math.min(this.#size + 1, this.#capacity);

      return event;
    } catch (caught) {
      try {
        this.#warn(
          {
            provider: input?.provider,
            operation: input?.operation,
            reason: caught instanceof Error ? caught.message : String(caught),
          },
          "metering event dropped",
        );
      } catch {
        // A failing logger is not allowed to become a failing request either.
      }
      return null;
    }
  }

  /** Events in the window, oldest first. */
  #eventsSince(start: number): ApiUsageEvent[] {
    const events: ApiUsageEvent[] = [];
    const first = (this.#next - this.#size + this.#capacity) % this.#capacity;

    for (let offset = 0; offset < this.#size; offset += 1) {
      const index = (first + offset) % this.#capacity;
      const event = this.#slots[index];
      if (event && this.#times[index]! >= start) events.push(event);
    }

    return events;
  }

  getSummary(period: SummaryPeriod = "this_month"): FinOpsCostSummary {
    const now = this.#now();
    const events = this.#eventsSince(periodStart(period, now));

    const breakdown = emptyBreakdown();
    let totalPaise = 0;
    let totalMicroUsd = 0;
    let errorCount = 0;

    for (const event of events) {
      totalPaise += event.costMinorInr;
      totalMicroUsd += event.costMicroUsd;
      if (event.status === "ERROR") errorCount += 1;

      const entry = breakdown[event.provider];
      entry.requestCount += 1;
      entry.costInrPaise += event.costMinorInr;
    }

    const monthPaise =
      period === "this_month"
        ? totalPaise
        : this.#eventsSince(periodStart("this_month", now)).reduce(
            (sum, event) => sum + event.costMinorInr,
            0,
          );
    const capPaise = this.#budgetCapInr * PAISE_PER_INR;

    return {
      period,
      totalCostInrPaise: totalPaise,
      totalCostInrFormatted: formatInrPaise(totalPaise),
      totalCostMicroUsd: totalMicroUsd,
      totalRequests: events.length,
      errorCount,
      providerBreakdown: Object.fromEntries(
        API_PROVIDERS.map((provider): [ApiProvider, ProviderCostBreakdown] => [
          provider,
          {
            ...breakdown[provider],
            costFormatted: formatInrPaise(breakdown[provider].costInrPaise),
          },
        ]),
      ) as Record<ApiProvider, ProviderCostBreakdown>,
      budgetAlert: {
        triggered: capPaise > 0 && monthPaise >= capPaise,
        monthlyBudgetCapInr: this.#budgetCapInr,
        currentSpendInr: monthPaise / PAISE_PER_INR,
        percentageUsed: capPaise > 0 ? Math.round((monthPaise * 10_000) / capPaise) / 100 : 0,
      },
    };
  }

  /** Newest first. */
  getRecentEvents(limit = 50): ApiUsageEvent[] {
    const count = Math.max(0, Math.min(Math.floor(limit) || 0, this.#size));
    const events: ApiUsageEvent[] = [];

    for (let offset = 1; offset <= count; offset += 1) {
      const event = this.#slots[(this.#next - offset + this.#capacity) % this.#capacity];
      if (event) events.push(event);
    }

    return events;
  }

  clear(): void {
    this.#slots.fill(undefined);
    this.#times.fill(0);
    this.#next = 0;
    this.#size = 0;
  }
}

/**
 * Record without any possibility of throwing, whatever recorder was injected.
 * This is what adapters call: the customer's request outranks the gauge.
 */
export function recordUsageSafely(
  recorder: UsageRecorder | undefined,
  input: RecordUsageInput,
): void {
  try {
    recorder?.record(input);
  } catch (caught) {
    try {
      console.warn("metering recorder threw; event dropped", {
        provider: input.provider,
        operation: input.operation,
        reason: caught instanceof Error ? caught.message : String(caught),
      });
    } catch {
      // Nothing further to do.
    }
  }
}

/**
 * Process-wide instance.
 *
 * Held on `globalThis` so development hot reload does not start a fresh, empty
 * buffer on every edit — the same guard the Prisma client uses.
 */
const globalForMetering = globalThis as unknown as { meteringService?: MeteringService };

export function getMeteringService(): MeteringService {
  globalForMetering.meteringService ??= new MeteringService();
  return globalForMetering.meteringService;
}
