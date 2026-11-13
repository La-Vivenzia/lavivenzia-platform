/**
 * Rate limit policy.
 *
 * Backed by PostgreSQL counters rather than Redis (ADR-0001). These endpoints
 * are low-volume and high-value, so precision matters more than throughput;
 * volumetric and bot protection belongs at the edge (WAF), not here.
 *
 * Every limit is applied on **two** keys — the identifier and the client IP.
 * Either alone is insufficient: limiting only by email lets one host spray
 * thousands of accounts, and limiting only by IP lets a distributed attacker
 * target a single account from many addresses.
 */

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  /** OTP issuance per address. Deliberately tight — each request sends an email. */
  otpRequestPerEmail: { limit: 5, windowMs: HOUR },
  /** OTP issuance per client, so one host cannot spray many addresses. */
  otpRequestPerIp: { limit: 20, windowMs: HOUR },

  /** OTP verification per address, on top of the per-challenge attempt cap. */
  otpVerifyPerEmail: { limit: 10, windowMs: HOUR },

  /** Password login per address. */
  loginPerEmail: { limit: 10, windowMs: 15 * MINUTE },
  /** Password login per client. Higher, since offices share an address. */
  loginPerIp: { limit: 50, windowMs: 15 * MINUTE },

  /** Registration per client — the main defence against scripted signups. */
  registerPerIp: { limit: 10, windowMs: HOUR },

  /** TOTP verification. Tight: 6 digits with no per-challenge counter. */
  mfaVerifyPerUser: { limit: 10, windowMs: 15 * MINUTE },

  /**
   * Password change per user.
   *
   * The endpoint verifies the current password, so without a ceiling a stolen
   * session becomes an unthrottled oracle for it — and the login limit does
   * not apply, because the caller is already signed in.
   */
  passwordChangePerUser: { limit: 5, windowMs: 15 * MINUTE },

  /**
   * Draft creation per host.
   *
   * The service also caps how many unarchived listings a host may hold, but
   * that cap alone is not a bound on rows: archiving frees a slot, so a script
   * could create and archive indefinitely. This is what makes it finite.
   */
  experienceCreatePerHost: { limit: 40, windowMs: HOUR },

  /**
   * Location autocomplete per client.
   *
   * The one public endpoint that costs money per call: each request can reach
   * Google Places, which is billed per keystroke-driven lookup. The limit is a
   * budget control first and an abuse control second.
   *
   * Sized for a person typing, not for a script: a traveller refining a
   * destination two or three times in a session issues perhaps thirty debounced
   * requests, so this leaves generous headroom while making a scraper expensive.
   */
  placesAutocompletePerIp: { limit: 120, windowMs: 15 * MINUTE },

  /**
   * Public discovery search per client.
   *
   * Browsing is deliberately unauthenticated and should stay cheap, so this is
   * loose enough that no real traveller meets it. What it bounds is the
   * keyword path specifically: a trigram similarity scan is far more expensive
   * than an indexed equality filter, and an unauthenticated endpoint that will
   * run one on any string is worth a ceiling.
   */
  discoverySearchPerIp: { limit: 300, windowMs: 15 * MINUTE },

  /**
   * Travel copilot per client.
   *
   * Every request is a proximity query plus a detail read per suggestion, and
   * may be a billed model call. Generous for a traveller re-asking with a new
   * mood; a ceiling on a script.
   */
  copilotPerIp: { limit: 60, windowMs: 15 * MINUTE },

  /**
   * VivenIQ conversational search per client.
   *
   * Each turn fans out to up to four keyword scans plus a category read, so it
   * is several times the cost of one discovery search. Generous for a
   * traveller refining a moment; a ceiling on a script.
   */
  viveniqPerIp: { limit: 60, windowMs: 15 * MINUTE },

  /**
   * In-journey butler emails per client.
   *
   * Every accepted request sends a real email from our verified domain, so
   * this is a reputation control as much as a cost one. A traveller asks a
   * handful of times in an evening; a script is stopped well before it can
   * make the sending domain look like a spammer's.
   */
  companionDispatchPerIp: { limit: 10, windowMs: HOUR },

  /**
   * Itinerary generation and swap per client.
   *
   * No model and no database read, but each request is an exhaustive search
   * over tens of thousands of sequences. Generous for a traveller tuning a plan
   * and swapping stops; a ceiling on a script using it as free compute.
   */
  itineraryPerIp: { limit: 90, windowMs: 15 * MINUTE },

  /**
   * Booking checkout per client (prepare and confirm share it).
   *
   * In Razorpay test mode each prepare creates a provider order, so this is
   * the ceiling on how many orders a script can open. A traveller changing
   * their mind a dozen times never meets it.
   */
  checkoutPerIp: { limit: 30, windowMs: 15 * MINUTE },

  /**
   * Taste Genome calibration and telemetry per client.
   *
   * Unauthenticated writes into a capped in-memory store. The client batches
   * telemetry every few seconds while a tab is visible, so a long browsing
   * session sends perhaps a hundred batches; a script is stopped well before
   * it can churn the session cap.
   */
  tasteGenomePerIp: { limit: 300, windowMs: 15 * MINUTE },

  /**
   * Media upload per host.
   *
   * Each accepted upload is up to 8 MB of stored bytes, so this is a storage
   * bound as much as a request bound. Generous enough that a host filling three
   * galleries in one sitting never meets it.
   */
  mediaUploadPerHost: { limit: 120, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Build a counter key.
 *
 * The subject is lower-cased so `User@x.com` and `user@x.com` share a bucket —
 * otherwise case variation trivially multiplies the allowance.
 */
export function rateLimitKey(name: RateLimitName, subject: string): string {
  return `${name}:${subject.toLowerCase()}`;
}
