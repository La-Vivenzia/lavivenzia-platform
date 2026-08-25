/**
 * Display formatting.
 *
 * Pure and framework-free, so the same rendering is used by server components,
 * client components and tests. Nothing here computes anything — a formatter
 * that also does arithmetic is how a rounding rule ends up living in the view.
 */

/**
 * How many minor units make one major unit.
 *
 * INR, USD, EUR and GBP are all 100. Zero-decimal currencies (JPY, KRW) and the
 * three-decimal ones (KWD, BHD) are the reason this is a lookup rather than a
 * hard-coded division by 100 — the platform is India-first today and that will
 * not stay true.
 */
const MINOR_UNITS_PER_MAJOR: Readonly<Record<string, number>> = {
  JPY: 1,
  KRW: 1,
  VND: 1,
  BHD: 1000,
  KWD: 1000,
  OMR: 1000,
};

export function minorUnitsPerMajor(currency: string): number {
  return MINOR_UNITS_PER_MAJOR[currency.toUpperCase()] ?? 100;
}

/**
 * Format an integer amount of minor units as money.
 *
 * The value is always an integer of minor units — never a float — so the
 * division happens once, here, at the point of display.
 */
export function formatMoneyMinor(
  minor: number | null,
  currency: string,
  locale = "en-IN",
): string | null {
  if (minor === null) return null;

  const divisor = minorUnitsPerMajor(currency);
  const fractionDigits = divisor === 1 ? 0 : String(divisor).length - 1;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(minor / divisor);
}

/** Parse what a host typed into integer minor units, or null. */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;

  // Rounded, not truncated: 1234.565 entered by a human means the nearest
  // paisa, and truncation would quietly lose money on every conversion.
  return Math.round(value * minorUnitsPerMajor(currency));
}

/** Minor units back into an editable major-unit string. */
export function formatMinorForInput(minor: number | null, currency: string): string {
  if (minor === null) return "";
  const divisor = minorUnitsPerMajor(currency);
  return divisor === 1 ? String(minor) : String(minor / divisor);
}

/**
 * A duration in words: "2 hours 30 minutes", "45 minutes", "3 days".
 *
 * Written out rather than shown as "150m" because this is guest-facing copy on
 * a premium listing, not a log line.
 */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null;

  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder} minutes`;

  const hourPart = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return remainder === 0 ? hourPart : `${hourPart} ${remainder} minutes`;
}

/**
 * A short relative time: "just now", "4 hours ago", "12 Aug".
 *
 * Relative only inside a week. Beyond that a date is more useful than "43 days
 * ago", which nobody converts in their head.
 */
export function formatRelativeTime(value: Date, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - value.getTime();
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(value);
}

/** Guest range as a phrase: "2–8 guests", "up to 8 guests", "from 2 guests". */
export function formatGuestRange(minGuests: number, maxGuests: number | null): string {
  if (maxGuests === null) return `From ${minGuests} ${minGuests === 1 ? "guest" : "guests"}`;
  if (minGuests === maxGuests) return `${maxGuests} ${maxGuests === 1 ? "guest" : "guests"}`;
  // En dash, not a hyphen: it is a range, and the typography matters here.
  return `${minGuests}–${maxGuests} guests`;
}
