import { ValidationError } from "@/lib/errors";

/**
 * Transactional email templates (FR-12, LA-22).
 *
 * Bodies are assembled here, not by callers, for two reasons: Callers pass
 * structured variables, so a template change never becomes a change at every
 * call site; and the content stays provider-neutral, so swapping SES for
 * another sender touches the adapter and nothing else.
 *
 * Framework-free by design: this module renders strings and knows nothing about
 * how they are delivered.
 */

/** Display name on the From header. A product constant, not configuration. */
export const EMAIL_SENDER_NAME = "La Vivenzia";

/**
 * La Vivenzia official luxury brand palette and typography tokens.
 *
 * Specified by LA-22 / DESIGN.md §A:
 * - Deep Pine: #0D1611
 * - Warm Ivory: #FBF9F5
 * - Champagne Gold: #C5A880
 * - Border: #E6E1D8
 */
export const LUXURY_BRAND = {
  deepPine: "#0D1611",
  warmIvory: "#FBF9F5",
  champagneGold: "#C5A880",
  border: "#E6E1D8",
  cardBg: "#FFFFFF",
  cardAlt: "#F4EFEA",
  textMuted: "#606A63",
  textBody: "#16261E",
  pineCardBg: "#13211A",
  pineBorder: "#22382F",
  pineMuted: "#9DAAA2",
  tagline: "Experience Every Journey Through Its Soul",
  serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
  sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', Menlo, Monaco, Consolas, 'Courier New', monospace",
} as const;

/**
 * Variables each template expects.
 *
 * Adding a template means adding an entry here and one to `TEMPLATES` below;
 * the compiler then requires every caller to pass the right shape.
 */
export interface EmailTemplatePayloads {
  /** Passwordless login code for travellers (ADR-0005). */
  "auth.login-code": {
    readonly code: string;
    readonly expiresInMinutes: number;
  };
  /** Automatic booking confirmation sent immediately upon reservation. */
  "traveler.booking-confirmation": {
    readonly patronName: string;
    readonly experienceTitle: string;
    readonly hostName: string;
    readonly reference: string;
    readonly startsAtFormatted: string;
    readonly endsAtFormatted: string;
    readonly guests: number;
    readonly totalFormatted: string;
    readonly venueLines: readonly string[];
    readonly directionsUrl: string | null;
    readonly experienceUrl: string;
    readonly confirmedAt: string;
  };
  /** The in-journey live butler: curated gems near where the traveller is now. */
  "traveler.in-journey-companion": {
    readonly patronName: string;
    readonly activeVenueTitle: string;
    readonly activeZone: string;
    readonly butlerNote: string;
    readonly recommendations: readonly {
      readonly title: string;
      readonly categoryName: string;
      readonly distanceOrTime: string;
      readonly curatorSecret: string;
      readonly vipPerk: string;
      readonly experienceUrl: string;
    }[];
  };
  /** The journey pass, sent when it is issued: the route and the door keyword. */
  "traveler.journey-pass-confirmation": {
    readonly holderName: string;
    readonly journeyTitle: string;
    readonly reference: string;
    readonly secretKeyword: string;
    readonly partySize: number;
    /** True for a pilot pass: nothing charged, nothing reserved. */
    readonly simulated: boolean;
    /** The pass's own notice, printed verbatim when simulated. */
    readonly notice: string;
    readonly acts: readonly JourneyActPayload[];
    readonly journeyUrl: string;
  };
  /**
   * A journey the traveller saved to "My Curations": the running order, sent
   * so they have it to hand. Nothing is booked, held or charged.
   */
  "traveler.curated-itinerary": {
    readonly journeyTitle: string;
    readonly mood: string;
    readonly tagline: string;
    /** "2 hr 45 min". */
    readonly duration: string;
    /** Absent when the traveller did not say how many are going. */
    readonly partySize: number | null;
    readonly acts: readonly JourneyActPayload[];
    /** Opens the journey with the companion map. */
    readonly journeyUrl: string;
  };
}

/** One act as both journey emails print it. */
export interface JourneyActPayload {
  /** "Chapter I · Prelude". */
  readonly heading: string;
  readonly title: string;
  /** "19:30". */
  readonly startsAt: string;
  readonly addressLine: string;
  readonly privilege: string;
  readonly privilegeConfirmed: boolean;
  readonly directionsUrl: string;
}

export type EmailTemplateId = keyof EmailTemplatePayloads;

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

interface EmailTemplate<K extends EmailTemplateId> {
  readonly subject: (variables: EmailTemplatePayloads[K]) => string;
  readonly text: (variables: EmailTemplatePayloads[K]) => string;
  readonly html: (variables: EmailTemplatePayloads[K]) => string;
}

/**
 * Escape text before it reaches the HTML body.
 *
 * Every variable is escaped, including ones that "cannot" contain markup today.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * An href that can only ever be a web link. Anything else becomes an inert anchor.
 */
function safeHref(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? escapeHtml(parsed.toString())
      : "#";
  } catch {
    return "#";
  }
}

function guestsLabel(partySize: number): string {
  return `${partySize} ${partySize === 1 ? "guest" : "guests"}`;
}

/**
 * Shared luxury container shell ensuring Gmail, Apple Mail, and Outlook compatibility.
 * Employs inline CSS, fluid table layout, and the official La Vivenzia luxury palette.
 */
function renderLuxuryEmailShell({
  previewText,
  badgeText,
  heading,
  subheading,
  bodyContentHtml,
  footerNoteHtml,
  theme = "ivory",
}: {
  readonly previewText?: string;
  readonly badgeText?: string;
  readonly heading: string;
  readonly subheading?: string;
  readonly bodyContentHtml: string;
  readonly footerNoteHtml?: string;
  readonly theme?: "ivory" | "pine";
}): string {
  const b = LUXURY_BRAND;
  const isDark = theme === "pine";

  const outerBg = isDark ? b.deepPine : b.warmIvory;
  const containerBg = isDark ? b.deepPine : b.cardBg;
  const borderCol = isDark ? b.pineBorder : b.border;
  const headingCol = isDark ? b.warmIvory : b.deepPine;
  const subCol = isDark ? b.pineMuted : b.textMuted;
  const footerTextCol = isDark ? b.pineMuted : b.textMuted;

  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="${isDark ? "dark" : "light"}">`,
    `<title>${escapeHtml(EMAIL_SENDER_NAME)}</title>`,
    `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->`,
    `</head>`,
    `<body style="margin:0;padding:0;background-color:${outerBg};-webkit-font-smoothing:antialiased">`,
    previewText
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(previewText)}</div>`
      : "",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${outerBg}">`,
    `<tr><td align="center" style="padding:32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:${containerBg};border:1px solid ${borderCol};border-radius:12px;overflow:hidden">`,

    // Header bar with official La Vivenzia luxury branding
    `<tr><td style="background-color:${b.deepPine};padding:28px 24px 24px;text-align:center;border-bottom:1px solid ${b.champagneGold}">`,
    `<p style="margin:0 0 6px;font-family:${b.serif};font-size:18px;letter-spacing:5px;font-weight:600;text-transform:uppercase;color:${b.champagneGold}">`,
    `${escapeHtml(EMAIL_SENDER_NAME)}</p>`,
    `<p style="margin:0;font-family:${b.sans};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${b.warmIvory}">`,
    `${escapeHtml(b.tagline)}</p>`,
    badgeText
      ? `<div style="margin-top:14px"><span style="display:inline-block;padding:5px 14px;border:1px solid ${b.champagneGold};border-radius:999px;font-family:${b.sans};font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:${b.champagneGold}">${escapeHtml(badgeText)}</span></div>`
      : "",
    `</td></tr>`,

    // Headline & Lead
    `<tr><td style="padding:28px 24px 12px">`,
    `<h1 style="margin:0 0 10px;font-family:${b.serif};font-size:24px;line-height:1.3;font-weight:normal;color:${headingCol}">${escapeHtml(heading)}</h1>`,
    subheading
      ? `<p style="margin:0;font-family:${b.sans};font-size:14px;line-height:1.6;color:${subCol}">${escapeHtml(subheading)}</p>`
      : "",
    `</td></tr>`,

    // Main Body
    `<tr><td style="padding:0 24px 28px">`,
    bodyContentHtml,
    `</td></tr>`,

    // Footer
    `<tr><td style="background-color:${isDark ? b.deepPine : b.warmIvory};padding:20px 24px;border-top:1px solid ${borderCol};text-align:center">`,
    footerNoteHtml
      ? `<div style="margin:0 0 10px;font-family:${b.sans};font-size:11px;line-height:1.5;color:${footerTextCol}">${footerNoteHtml}</div>`
      : "",
    `<p style="margin:0;font-family:${b.sans};font-size:11px;color:${footerTextCol}">`,
    `&copy; ${escapeHtml(EMAIL_SENDER_NAME)} &middot; All privileges and reservations subject to patron terms.</p>`,
    `</td></tr>`,

    `</table></td></tr></table></body></html>`,
  ].join("");
}

/* ------------------------------------------------------------- 1. Login Code */

function loginCodeHtml(variables: EmailTemplatePayloads["auth.login-code"]): string {
  const b = LUXURY_BRAND;
  const content = [
    `<p style="margin:0 0 18px;font-family:${b.sans};font-size:14.5px;line-height:1.6;color:${b.textBody}">`,
    `Use this confidential verification code to sign in to your La Vivenzia account:</p>`,
    `<div style="background-color:${b.deepPine};border:1px solid ${b.champagneGold};border-radius:10px;padding:20px;text-align:center;margin:0 0 20px">`,
    `<p style="margin:0;font-family:${b.mono};font-size:32px;font-weight:700;letter-spacing:8px;color:${b.champagneGold}">`,
    `${escapeHtml(variables.code)}</p>`,
    `</div>`,
    `<p style="margin:0 0 12px;font-family:${b.sans};font-size:13px;line-height:1.5;color:${b.textMuted}">`,
    `This single-use code expires in ${escapeHtml(String(variables.expiresInMinutes))} minutes.</p>`,
    `<p style="margin:0;font-family:${b.sans};font-size:12px;line-height:1.5;color:${b.textMuted}">`,
    `If you did not request this login code, you can safely disregard this email. Nobody can access your account with this code alone.</p>`,
  ].join("");

  return renderLuxuryEmailShell({
    previewText: `Your ${EMAIL_SENDER_NAME} single-use code is ${variables.code}`,
    badgeText: "Secure Access",
    heading: "Single-Use Verification Code",
    subheading: "Your Patron Circle access code is ready.",
    bodyContentHtml: content,
    theme: "ivory",
  });
}

/* ------------------------------------------------ 2. Booking Confirmation */

function bookingConfirmationHtml(
  variables: EmailTemplatePayloads["traveler.booking-confirmation"],
): string {
  const b = LUXURY_BRAND;

  const content = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background-color:${b.warmIvory};border:1px solid ${b.border};border-radius:10px;margin-bottom:20px">`,
    `<tr><td style="padding:18px 20px">`,
    `<p style="margin:0 0 6px;font-family:${b.sans};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${b.champagneGold}">`,
    `Reservation Reference</p>`,
    `<p style="margin:0;font-family:${b.mono};font-size:20px;font-weight:700;color:${b.deepPine}">`,
    `#${escapeHtml(variables.reference)}</p>`,
    `</td></tr></table>`,

    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="border:1px solid ${b.border};border-radius:10px;margin-bottom:22px;border-collapse:collapse">`,
    `<tr><td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:12px;color:${b.textMuted};width:32%">Experience</td>`,
    `<td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.serif};font-size:15px;font-weight:600;color:${b.deepPine}">${escapeHtml(variables.experienceTitle)}</td></tr>`,
    `<tr><td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:12px;color:${b.textMuted}">Host</td>`,
    `<td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:13.5px;color:${b.textBody}">${escapeHtml(variables.hostName)}</td></tr>`,
    `<tr><td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:12px;color:${b.textMuted}">Party Size</td>`,
    `<td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:13.5px;color:${b.textBody}">${escapeHtml(guestsLabel(variables.guests))}</td></tr>`,
    `<tr><td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:12px;color:${b.textMuted}">Schedule</td>`,
    `<td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:13.5px;color:${b.textBody}">${escapeHtml(variables.startsAtFormatted)} &ndash; ${escapeHtml(variables.endsAtFormatted)}</td></tr>`,
    `<tr><td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.sans};font-size:12px;color:${b.textMuted}">Total Amount</td>`,
    `<td style="padding:14px 18px;border-bottom:1px solid ${b.border};font-family:${b.mono};font-size:14px;font-weight:600;color:${b.deepPine}">${escapeHtml(variables.totalFormatted)}</td></tr>`,
    `<tr><td style="padding:14px 18px;font-family:${b.sans};font-size:12px;color:${b.textMuted};vertical-align:top">Venue Address</td>`,
    `<td style="padding:14px 18px;font-family:${b.sans};font-size:13px;line-height:1.5;color:${b.textBody}">`,
    variables.venueLines.map((l) => escapeHtml(l)).join("<br>"),
    variables.directionsUrl
      ? `<br><a href="${safeHref(variables.directionsUrl)}" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:600;color:${b.champagneGold};text-decoration:none">View on Map &rarr;</a>`
      : "",
    `</td></tr></table>`,

    `<div style="text-align:center;padding:8px 0 0">`,
    `<a href="${safeHref(variables.experienceUrl)}" `,
    `style="display:inline-block;padding:13px 26px;border-radius:999px;background-color:${b.champagneGold};`,
    `color:${b.deepPine};font-family:${b.sans};font-size:13px;font-weight:600;letter-spacing:0.5px;text-decoration:none">`,
    `View Experience &amp; Pass &rarr;</a>`,
    `</div>`,
  ].join("");

  return renderLuxuryEmailShell({
    previewText: `Reservation Confirmed: ${variables.experienceTitle} · #${variables.reference}`,
    badgeText: "Booking Confirmed",
    heading: `${variables.patronName}, your reservation is set.`,
    subheading: `Your host ${variables.hostName} has confirmed your reservation. Present your pass upon arrival.`,
    bodyContentHtml: content,
    theme: "ivory",
  });
}

/* ----------------------------------------- 3. In-Journey Live Butler */

type CompanionPayload = EmailTemplatePayloads["traveler.in-journey-companion"];

function companionRecommendationHtml(
  recommendation: CompanionPayload["recommendations"][number],
): string {
  const b = LUXURY_BRAND;
  return [
    `<tr><td style="padding:0 0 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background:${b.pineCardBg};border:1px solid ${b.pineBorder};border-radius:12px">`,
    `<tr><td style="padding:20px 22px">`,
    `<p style="margin:0 0 8px;font-family:${b.sans};font-size:10px;letter-spacing:2px;color:${b.champagneGold}">`,
    `<span style="text-transform:uppercase">${escapeHtml(recommendation.categoryName)}</span>`,
    `<span style="letter-spacing:1px"> &nbsp;&middot;&nbsp; ${escapeHtml(recommendation.distanceOrTime)}</span></p>`,
    `<h2 style="margin:0 0 10px;font-family:${b.serif};font-size:19px;line-height:1.3;`,
    `font-weight:normal;color:${b.warmIvory}">${escapeHtml(recommendation.title)}</h2>`,
    `<p style="margin:0 0 10px;font-family:${b.sans};font-size:13.5px;line-height:1.55;color:${b.warmIvory}">`,
    `<span style="color:${b.champagneGold}">&#10022;</span>&nbsp; ${escapeHtml(recommendation.vipPerk)}</p>`,
    `<p style="margin:0 0 16px;padding-left:12px;border-left:2px solid ${b.champagneGold};`,
    `font-family:${b.serif};font-style:italic;font-size:13.5px;line-height:1.55;color:${b.pineMuted}">`,
    `${escapeHtml(recommendation.curatorSecret)}</p>`,
    `<a href="${safeHref(recommendation.experienceUrl)}" `,
    `style="display:inline-block;padding:10px 20px;border-radius:999px;background:${b.champagneGold};`,
    `color:${b.deepPine};font-family:${b.sans};font-size:12.5px;font-weight:600;letter-spacing:0.5px;`,
    `text-decoration:none">Reserve my pass &rarr;</a>`,
    `</td></tr></table>`,
    `</td></tr>`,
  ].join("");
}

function companionHtml(variables: CompanionPayload): string {
  const b = LUXURY_BRAND;
  const content = [
    `<p style="margin:0 0 14px;font-family:${b.sans};font-size:14.5px;line-height:1.65;color:${b.warmIvory}">`,
    `${escapeHtml(variables.butlerNote)}</p>`,
    `<p style="margin:0 0 20px;font-family:${b.sans};font-size:12px;letter-spacing:1px;color:${b.pineMuted}">`,
    `Curated around ${escapeHtml(variables.activeVenueTitle)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    variables.recommendations.map(companionRecommendationHtml).join(""),
    `</table>`,
  ].join("");

  return renderLuxuryEmailShell({
    previewText: variables.butlerNote,
    badgeText: `Live in ${variables.activeZone}`,
    heading: `${variables.patronName}, a note from your butler.`,
    subheading: `Personalized additions within easy reach of your active experience.`,
    bodyContentHtml: content,
    footerNoteHtml: `Times and tables are confirmed live on each experience page. You received this because you requested in-journey companion recommendations.`,
    theme: "pine",
  });
}

/* ------------------------------------- 4. Journey Pass Confirmation */

type PassPayload = EmailTemplatePayloads["traveler.journey-pass-confirmation"];

function passActHtml(act: JourneyActPayload): string {
  const b = LUXURY_BRAND;
  return [
    `<tr><td style="padding:0 0 14px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background:${b.pineCardBg};border:1px solid ${b.pineBorder};border-radius:12px">`,
    `<tr><td style="padding:18px 20px">`,
    `<p style="margin:0 0 6px;font-family:${b.sans};font-size:10px;letter-spacing:2px;`,
    `text-transform:uppercase;color:${b.champagneGold}">${escapeHtml(act.heading)} &nbsp;&middot;&nbsp; `,
    `${escapeHtml(act.startsAt)}</p>`,
    `<h2 style="margin:0 0 8px;font-family:${b.serif};font-size:18px;line-height:1.3;`,
    `font-weight:normal;color:${b.warmIvory}">${escapeHtml(act.title)}</h2>`,
    `<p style="margin:0 0 8px;font-family:${b.sans};font-size:13px;line-height:1.5;color:${b.pineMuted}">`,
    `${escapeHtml(act.addressLine)}</p>`,
    `<p style="margin:0 0 12px;font-family:${b.sans};font-size:13px;line-height:1.5;color:${b.warmIvory}">`,
    `<span style="color:${b.champagneGold}">&#10022;</span>&nbsp; ${escapeHtml(act.privilege)}`,
    `<span style="color:${b.pineMuted}"> &middot; ${act.privilegeConfirmed ? "confirmed" : "requested"}</span></p>`,
    `<a href="${safeHref(act.directionsUrl)}" style="font-family:${b.sans};font-size:12px;`,
    `letter-spacing:0.5px;color:${b.champagneGold};text-decoration:none">Directions &rarr;</a>`,
    `</td></tr></table>`,
    `</td></tr>`,
  ].join("");
}

function passHtml(variables: PassPayload): string {
  const b = LUXURY_BRAND;
  const guests = guestsLabel(variables.partySize);

  const content = [
    `<div style="background-color:${b.pineCardBg};border:1px solid ${b.champagneGold};border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">`,
    `<p style="margin:0 0 6px;font-family:${b.sans};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${b.pineMuted}">Secret host keyword</p>`,
    `<p style="margin:0;font-family:${b.serif};font-size:24px;letter-spacing:3px;color:${b.champagneGold}">`,
    `${escapeHtml(variables.secretKeyword)}</p>`,
    `</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    variables.acts.map(passActHtml).join(""),
    `</table>`,
    `<div style="padding:12px 0 0;text-align:center">`,
    `<a href="${safeHref(variables.journeyUrl)}" `,
    `style="display:inline-block;padding:12px 24px;border-radius:999px;background:${b.champagneGold};`,
    `color:${b.deepPine};font-family:${b.sans};font-size:13px;font-weight:600;letter-spacing:0.5px;text-decoration:none">`,
    `Open my journey &rarr;</a>`,
    `</div>`,
  ].join("");

  return renderLuxuryEmailShell({
    previewText: `Your pass for ${variables.journeyTitle} · #${variables.reference}`,
    badgeText: variables.simulated ? "Simulated Pass" : "VIP Journey Pass",
    heading: `${variables.holderName}, your evening is set.`,
    subheading: `${variables.journeyTitle} · ${guests} · #${variables.reference}`,
    bodyContentHtml: content,
    footerNoteHtml: variables.simulated ? escapeHtml(variables.notice) : undefined,
    theme: "pine",
  });
}

/* ----------------------------------------- 5. Curated Itinerary */

type ItineraryPayload = EmailTemplatePayloads["traveler.curated-itinerary"];

function itineraryHtml(variables: ItineraryPayload): string {
  const b = LUXURY_BRAND;
  const meta = [
    variables.mood,
    variables.duration,
    ...(variables.partySize ? [guestsLabel(variables.partySize)] : []),
  ].join(" · ");

  const content = [
    `<p style="margin:0 0 8px;font-family:${b.sans};font-size:14.5px;line-height:1.6;color:${b.warmIvory}">`,
    `${escapeHtml(variables.tagline)}</p>`,
    `<p style="margin:0 0 20px;font-family:${b.sans};font-size:12px;letter-spacing:1px;color:${b.pineMuted}">`,
    `${escapeHtml(meta)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    variables.acts.map(passActHtml).join(""),
    `</table>`,
    `<div style="padding:12px 0 0;text-align:center">`,
    `<a href="${safeHref(variables.journeyUrl)}" `,
    `style="display:inline-block;padding:12px 24px;border-radius:999px;background:${b.champagneGold};`,
    `color:${b.deepPine};font-family:${b.sans};font-size:13px;font-weight:600;letter-spacing:0.5px;text-decoration:none">`,
    `Start my journey &rarr;</a>`,
    `</div>`,
  ].join("");

  return renderLuxuryEmailShell({
    previewText: `${variables.journeyTitle} — ${variables.tagline}`,
    badgeText: "Saved to your curations",
    heading: variables.journeyTitle,
    subheading: `Your personalized running order has been preserved.`,
    bodyContentHtml: content,
    footerNoteHtml: `Start times are a suggested running order. Nothing has been booked or held with any venue; each experience page confirms times and tables live.`,
    theme: "pine",
  });
}

/* ----------------------------------------------------------- Template Map */

const TEMPLATES: { [K in EmailTemplateId]: EmailTemplate<K> } = {
  "auth.login-code": {
    subject: ({ code }) => `${code} is your ${EMAIL_SENDER_NAME} login code`,

    text: ({ code, expiresInMinutes }) =>
      [
        `Your ${EMAIL_SENDER_NAME} login code is ${code}.`,
        "",
        `It expires in ${expiresInMinutes} minutes and can be used once.`,
        "",
        "If you did not try to sign in, you can ignore this email. Nobody can",
        "access your account with this code alone.",
        "",
        `${EMAIL_SENDER_NAME} · ${LUXURY_BRAND.tagline}`,
      ].join("\n"),

    html: loginCodeHtml,
  },

  "traveler.booking-confirmation": {
    subject: ({ experienceTitle, reference }) =>
      `Booking Confirmed: ${experienceTitle} · #${reference}`,

    text: ({
      patronName,
      experienceTitle,
      hostName,
      reference,
      startsAtFormatted,
      endsAtFormatted,
      guests,
      totalFormatted,
      venueLines,
      directionsUrl,
      experienceUrl,
    }) =>
      [
        `${patronName}, your reservation is confirmed.`,
        "",
        `Experience: ${experienceTitle}`,
        `Host: ${hostName}`,
        `Reference: #${reference}`,
        `Schedule: ${startsAtFormatted} – ${endsAtFormatted}`,
        `Party: ${guestsLabel(guests)}`,
        `Total: ${totalFormatted}`,
        "",
        "Venue Address:",
        ...venueLines.map((line) => `  ${line}`),
        ...(directionsUrl ? [`Directions: ${directionsUrl}`] : []),
        "",
        `View your booking: ${experienceUrl}`,
        "",
        `${EMAIL_SENDER_NAME} · ${LUXURY_BRAND.tagline}`,
      ].join("\n"),

    html: bookingConfirmationHtml,
  },

  "traveler.in-journey-companion": {
    subject: ({ activeZone, recommendations }) =>
      `Your live butler in ${activeZone} — ${
        recommendations.length === 1 ? "one curated gem" : `${recommendations.length} curated gems`
      } nearby`,

    text: ({ patronName, activeVenueTitle, activeZone, butlerNote, recommendations }) =>
      [
        `${patronName}, a note from your butler.`,
        "",
        butlerNote,
        "",
        `Live in ${activeZone} · curated around ${activeVenueTitle}`,
        "",
        ...recommendations.flatMap((recommendation) => [
          `— ${recommendation.title}`,
          `  ${recommendation.categoryName} · ${recommendation.distanceOrTime}`,
          `  Perk: ${recommendation.vipPerk}`,
          `  Curator's secret: ${recommendation.curatorSecret}`,
          `  Reserve: ${recommendation.experienceUrl}`,
          "",
        ]),
        "Times and tables are confirmed live on each experience page.",
        "",
        `${EMAIL_SENDER_NAME} · ${LUXURY_BRAND.tagline}`,
      ].join("\n"),

    html: companionHtml,
  },

  "traveler.journey-pass-confirmation": {
    subject: ({ journeyTitle, reference, simulated }) =>
      `${simulated ? "Simulated pass" : "Your pass"}: ${journeyTitle} · #${reference}`,

    text: (variables) =>
      [
        `${variables.holderName}, your evening is set.`,
        "",
        `${variables.journeyTitle} · ${variables.partySize} ${
          variables.partySize === 1 ? "guest" : "guests"
        } · #${variables.reference}`,
        "",
        `Secret host keyword: ${variables.secretKeyword}`,
        "",
        ...variables.acts.flatMap((act) => [
          `— ${act.heading} · ${act.startsAt}`,
          `  ${act.title}`,
          `  ${act.addressLine}`,
          `  ${act.privilege} · ${act.privilegeConfirmed ? "confirmed" : "requested"}`,
          `  Directions: ${act.directionsUrl}`,
          "",
        ]),
        `Open your journey: ${variables.journeyUrl}`,
        ...(variables.simulated ? ["", variables.notice] : []),
        "",
        `${EMAIL_SENDER_NAME} · ${LUXURY_BRAND.tagline}`,
      ].join("\n"),

    html: passHtml,
  },

  "traveler.curated-itinerary": {
    subject: ({ journeyTitle }) => `Your curated itinerary: ${journeyTitle}`,

    text: (variables) =>
      [
        variables.journeyTitle,
        variables.tagline,
        "",
        [
          variables.mood,
          variables.duration,
          ...(variables.partySize ? [guestsLabel(variables.partySize)] : []),
        ].join(" · "),
        "",
        ...variables.acts.flatMap((act) => [
          `— ${act.heading} · ${act.startsAt}`,
          `  ${act.title}`,
          `  ${act.addressLine}`,
          `  ${act.privilege} · ${act.privilegeConfirmed ? "confirmed" : "requested"}`,
          `  Directions: ${act.directionsUrl}`,
          "",
        ]),
        `Start your journey: ${variables.journeyUrl}`,
        "",
        "Start times are a suggested running order. Nothing has been booked or held with any",
        "venue; each experience page confirms times and tables live.",
        "",
        `${EMAIL_SENDER_NAME} · ${LUXURY_BRAND.tagline}`,
      ].join("\n"),

    html: itineraryHtml,
  },
};

export function isEmailTemplateId(value: string): value is EmailTemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, value);
}

export const EMAIL_TEMPLATE_IDS = Object.keys(TEMPLATES) as readonly EmailTemplateId[];

/**
 * Render a template to subject, plain text and HTML.
 */
export function renderEmailTemplate<K extends EmailTemplateId>(
  template: K,
  variables: EmailTemplatePayloads[K],
): RenderedEmail {
  if (!isEmailTemplateId(template)) {
    throw new ValidationError("Unknown email template.", { template });
  }

  const definition = TEMPLATES[template];

  return {
    subject: definition.subject(variables),
    text: definition.text(variables),
    html: definition.html(variables),
  };
}
