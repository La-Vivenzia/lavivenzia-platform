import { ValidationError } from "@/lib/errors";
import { OPERATION_PROVIDER, type ApiOperation, type ApiProvider } from "@/modules/metering/types";

/**
 * Provider price list and the one function that turns usage into cost.
 *
 * Every rate is an exact rational — an integer amount per an integer number of
 * units — so a rate like Haiku's $0.80 per million tokens is held as
 * 800,000 µ$ / 1,000,000 tokens rather than as the float 0.8. Arithmetic runs in
 * BigInt and rounds once, half-up, at the end. The INR figure is derived from
 * the exact rational, not from the already-rounded micro-dollar figure, so
 * there is never a second rounding.
 *
 * These are list prices for estimation and budgeting. The provider's invoice is
 * the authority on what was actually charged.
 */

export const MICRO_USD_PER_USD = 1_000_000;
export const PAISE_PER_INR = 100;

/** 86.00 INR per USD, as integer paise. A baseline for budgeting, not a live rate. */
export const PAISE_PER_USD = 8_600;

/** ₹5,000 a month. */
export const DEFAULT_MONTHLY_BUDGET_CAP_INR = 5_000;

type Rate =
  /** Billed in dollars: `microUsd` per `perUnits` units. */
  | { readonly currency: "USD"; readonly microUsd: number; readonly perUnits: number }
  /** Billed in rupees: `paise` per `perUnits` units. */
  | { readonly currency: "INR"; readonly paise: number; readonly perUnits: number };

const PER_CALL = 1;
const PER_MILLION = 1_000_000;

/**
 * Razorpay's standard rate: 2% gateway fee plus 18% GST on that fee, which is
 * 2.36% of the gross amount. `units` is the transaction amount in paise, so
 * this is 236 paise per 10,000 paise.
 */
const RAZORPAY_FEE: Rate = { currency: "INR", paise: 236, perUnits: 10_000 };

export const API_RATES: Readonly<Record<ApiOperation, Rate>> = {
  // Google Places API (New), per request.
  "places.autocomplete": { currency: "USD", microUsd: 2_830, perUnits: PER_CALL },
  "places.searchText": { currency: "USD", microUsd: 32_000, perUnits: PER_CALL },
  "places.details": { currency: "USD", microUsd: 17_000, perUnits: PER_CALL },
  "places.photos": { currency: "USD", microUsd: 7_000, perUnits: PER_CALL },

  // Gemini 1.5 / 2.0 Flash, per token. `flash_total` is a token count with no
  // input/output split, so it is priced at the output rate: an estimate that
  // can only over-state spend, never hide it from the budget alert.
  "gemini.flash_input": { currency: "USD", microUsd: 75_000, perUnits: PER_MILLION },
  "gemini.flash_output": { currency: "USD", microUsd: 300_000, perUnits: PER_MILLION },
  "gemini.flash_total": { currency: "USD", microUsd: 300_000, perUnits: PER_MILLION },

  // Anthropic, per token.
  "anthropic.sonnet_input": { currency: "USD", microUsd: 3_000_000, perUnits: PER_MILLION },
  "anthropic.sonnet_output": { currency: "USD", microUsd: 15_000_000, perUnits: PER_MILLION },
  "anthropic.haiku_input": { currency: "USD", microUsd: 800_000, perUnits: PER_MILLION },
  "anthropic.haiku_output": { currency: "USD", microUsd: 4_000_000, perUnits: PER_MILLION },

  // Meta WhatsApp Cloud API, India, per conversation or message.
  "whatsapp.utility_conv": { currency: "INR", paise: 11, perUnits: PER_CALL },
  "whatsapp.marketing_conv": { currency: "INR", paise: 78, perUnits: PER_CALL },
  "whatsapp.service_conv": { currency: "INR", paise: 29, perUnits: PER_CALL },
  "whatsapp.outbound_message": { currency: "INR", paise: 11, perUnits: PER_CALL },

  // Resend, per send.
  "email.transactional_send": { currency: "USD", microUsd: 280, perUnits: PER_CALL },

  "razorpay.payment_fee": RAZORPAY_FEE,
};

export interface ApiCost {
  readonly costMinorInr: number;
  readonly costMicroUsd: number;
}

export interface CostOptions {
  /**
   * A service conversation inside an open customer-service window is free.
   * Ignored for every other operation.
   */
  readonly inSession?: boolean;
}

/** `numerator / denominator`, rounded half-up. Both non-negative. */
function divideRounded(numerator: bigint, denominator: bigint): number {
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

/**
 * Cost of `units` of `operation`, in integer paise and integer micro-dollars.
 *
 * Pure and strict: it throws `ValidationError` on a provider/operation mismatch
 * or on units that are not a non-negative safe integer. Callers that must never
 * fail — the metering service — catch it themselves.
 */
export function calculateApiCost(
  provider: ApiProvider,
  operation: ApiOperation,
  units: number,
  options: CostOptions = {},
): ApiCost {
  const rate = (API_RATES as Partial<Record<string, Rate>>)[operation];
  if (!rate) {
    throw new ValidationError("Unknown metered operation.", { operation });
  }
  if (OPERATION_PROVIDER[operation] !== provider) {
    throw new ValidationError("Operation does not belong to that provider.", {
      provider,
      operation,
    });
  }
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new ValidationError("Units must be a non-negative integer.", { units });
  }

  if (operation === "whatsapp.service_conv" && options.inSession === true) {
    return { costMinorInr: 0, costMicroUsd: 0 };
  }

  const quantity = BigInt(units);
  const perUnits = BigInt(rate.perUnits);
  const paisePerUsd = BigInt(PAISE_PER_USD);
  const microPerUsd = BigInt(MICRO_USD_PER_USD);

  if (rate.currency === "USD") {
    const microUsd = quantity * BigInt(rate.microUsd);
    return {
      costMicroUsd: divideRounded(microUsd, perUnits),
      costMinorInr: divideRounded(microUsd * paisePerUsd, perUnits * microPerUsd),
    };
  }

  const paise = quantity * BigInt(rate.paise);
  return {
    costMinorInr: divideRounded(paise, perUnits),
    costMicroUsd: divideRounded(paise * microPerUsd, perUnits * paisePerUsd),
  };
}

/** Integer paise as "₹1,234.50". The only place paise become a decimal. */
export function formatInrPaise(paise: number): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / PAISE_PER_INR);
  return `₹${formatted}`;
}
