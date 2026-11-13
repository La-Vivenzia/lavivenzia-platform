import { ValidationError } from "@/lib/errors";

/**
 * Transactional email templates (FR-12).
 *
 * Bodies are assembled here, not by callers, for two reasons. Callers pass
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
 * Variables each template expects.
 *
 * Adding a template means adding an entry here and one to `TEMPLATES` below;
 * the compiler then requires every caller to pass the right shape. That is the
 * point of keying the message type off this map rather than accepting a loose
 * record.
 */
export interface EmailTemplatePayloads {
  /** Passwordless login code for travellers (ADR-0005). */
  "auth.login-code": {
    readonly code: string;
    readonly expiresInMinutes: number;
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
    readonly acts: readonly {
      /** "Chapter I · Prelude". */
      readonly heading: string;
      readonly title: string;
      /** "19:30". */
      readonly startsAt: string;
      readonly addressLine: string;
      readonly privilege: string;
      readonly privilegeConfirmed: boolean;
      readonly directionsUrl: string;
    }[];
    readonly journeyUrl: string;
  };
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
 * A template variable is untrusted input the moment someone reuses a template
 * with a user-supplied value, and that reuse never comes with a review of this
 * file.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared shell so every email looks like the same product without a build step. */
function layout(heading: string, bodyHtml: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;',
    'max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.6">',
    `<h1 style="font-size:20px;margin:0 0 20px">${escapeHtml(heading)}</h1>`,
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px">',
    `<p style="font-size:12px;color:#767676;margin:0">${escapeHtml(EMAIL_SENDER_NAME)}</p>`,
    "</div>",
  ].join("");
}

/**
 * An href that can only ever be a web link. Anything else — `javascript:`,
 * `data:`, a relative path that resolves against the mail client — becomes an
 * inert anchor rather than a live one.
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

/**
 * The live butler's palette.
 *
 * Literal values, unlike the product UI: mail clients cannot read the CSS
 * custom properties in `globals.css`, so the brand's dark luxury register is
 * spelled out here, once, for every email that uses it.
 */
const BUTLER = {
  night: "#080806",
  pine: "#0e2a22",
  gold: "#cda851",
  ivory: "#FAF8F5",
  muted: "#b9b4a8",
  rule: "#22382f",
  serif: "Georgia,'Times New Roman',Times,serif",
  sans: "system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif",
} as const;

type CompanionPayload = EmailTemplatePayloads["traveler.in-journey-companion"];

function companionRecommendationHtml(
  recommendation: CompanionPayload["recommendations"][number],
): string {
  const b = BUTLER;
  return [
    `<tr><td style="padding:0 0 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background:${b.pine};border:1px solid ${b.rule};border-radius:14px">`,
    `<tr><td style="padding:22px 22px 24px">`,
    `<p style="margin:0 0 8px;font-family:${b.sans};font-size:10px;letter-spacing:2.5px;color:${b.gold}">`,
    `<span style="text-transform:uppercase">${escapeHtml(recommendation.categoryName)}</span>`,
    // Units stay lower-case: an upper-cased "930 M" reads as millions.
    `<span style="letter-spacing:1px"> &nbsp;·&nbsp; ${escapeHtml(recommendation.distanceOrTime)}</span></p>`,
    `<h2 style="margin:0 0 14px;font-family:${b.serif};font-size:21px;line-height:1.3;`,
    `font-weight:normal;color:${b.ivory}">${escapeHtml(recommendation.title)}</h2>`,
    `<p style="margin:0 0 10px;font-family:${b.sans};font-size:14px;line-height:1.55;color:${b.ivory}">`,
    `<span style="color:${b.gold}">&#10022;</span>&nbsp; ${escapeHtml(recommendation.vipPerk)}</p>`,
    `<p style="margin:0 0 20px;padding-left:12px;border-left:2px solid ${b.gold};`,
    `font-family:${b.serif};font-style:italic;font-size:14px;line-height:1.6;color:${b.muted}">`,
    `${escapeHtml(recommendation.curatorSecret)}</p>`,
    `<a href="${safeHref(recommendation.experienceUrl)}" `,
    `style="display:inline-block;padding:12px 22px;border-radius:999px;background:${b.gold};`,
    `color:${b.night};font-family:${b.sans};font-size:13px;font-weight:600;letter-spacing:0.5px;`,
    `text-decoration:none">Reserve my pass &rarr;</a>`,
    `</td></tr></table>`,
    `</td></tr>`,
  ].join("");
}

function companionHtml(variables: CompanionPayload): string {
  const b = BUTLER;
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">`,
    `<title>${escapeHtml(EMAIL_SENDER_NAME)}</title></head>`,
    `<body style="margin:0;padding:0;background:${b.night}">`,
    // Inbox preview text; hidden in the body itself.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">`,
    `${escapeHtml(variables.butlerNote)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background:${b.night}"><tr><td align="center" style="padding:32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="max-width:560px">`,
    `<tr><td style="padding:0 0 28px;text-align:center">`,
    `<p style="margin:0 0 18px;font-family:${b.serif};font-size:15px;letter-spacing:4px;`,
    `text-transform:uppercase;color:${b.gold}">${escapeHtml(EMAIL_SENDER_NAME)}</p>`,
    `<span style="display:inline-block;padding:6px 14px;border:1px solid ${b.gold};border-radius:999px;`,
    `font-family:${b.sans};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${b.gold}">`,
    `&#9679;&nbsp; Live in ${escapeHtml(variables.activeZone)}</span>`,
    `</td></tr>`,
    `<tr><td style="padding:0 0 28px">`,
    `<h1 style="margin:0 0 14px;font-family:${b.serif};font-size:28px;line-height:1.25;`,
    `font-weight:normal;color:${b.ivory}">${escapeHtml(variables.patronName)}, a note from your butler.</h1>`,
    `<p style="margin:0 0 14px;font-family:${b.sans};font-size:15px;line-height:1.65;color:${b.ivory}">`,
    `${escapeHtml(variables.butlerNote)}</p>`,
    `<p style="margin:0;font-family:${b.sans};font-size:12px;letter-spacing:1px;color:${b.muted}">`,
    `Curated around ${escapeHtml(variables.activeVenueTitle)}</p>`,
    `</td></tr>`,
    variables.recommendations.map(companionRecommendationHtml).join(""),
    `<tr><td style="padding:12px 0 0;border-top:1px solid ${b.rule}">`,
    `<p style="margin:16px 0 0;font-family:${b.sans};font-size:11px;line-height:1.6;color:${b.muted}">`,
    `Your live butler from ${escapeHtml(EMAIL_SENDER_NAME)}. Times and tables are confirmed live `,
    `on each experience page. You received this because you asked for in-journey recommendations.</p>`,
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

type PassPayload = EmailTemplatePayloads["traveler.journey-pass-confirmation"];

function passActHtml(act: PassPayload["acts"][number]): string {
  const b = BUTLER;
  return [
    `<tr><td style="padding:0 0 14px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background:${b.pine};border:1px solid ${b.rule};border-radius:14px">`,
    `<tr><td style="padding:18px 20px 20px">`,
    `<p style="margin:0 0 6px;font-family:${b.sans};font-size:10px;letter-spacing:2.5px;`,
    `text-transform:uppercase;color:${b.gold}">${escapeHtml(act.heading)} &nbsp;·&nbsp; `,
    `${escapeHtml(act.startsAt)}</p>`,
    `<h2 style="margin:0 0 8px;font-family:${b.serif};font-size:19px;line-height:1.3;`,
    `font-weight:normal;color:${b.ivory}">${escapeHtml(act.title)}</h2>`,
    `<p style="margin:0 0 8px;font-family:${b.sans};font-size:13px;line-height:1.5;color:${b.muted}">`,
    `${escapeHtml(act.addressLine)}</p>`,
    `<p style="margin:0 0 14px;font-family:${b.sans};font-size:13px;line-height:1.5;color:${b.ivory}">`,
    `<span style="color:${b.gold}">&#10022;</span>&nbsp; ${escapeHtml(act.privilege)}`,
    `<span style="color:${b.muted}"> · ${act.privilegeConfirmed ? "confirmed" : "requested"}</span></p>`,
    `<a href="${safeHref(act.directionsUrl)}" style="font-family:${b.sans};font-size:12px;`,
    `letter-spacing:0.5px;color:${b.gold};text-decoration:none">Directions &rarr;</a>`,
    `</td></tr></table>`,
    `</td></tr>`,
  ].join("");
}

function passHtml(variables: PassPayload): string {
  const b = BUTLER;
  const guests = `${variables.partySize} ${variables.partySize === 1 ? "guest" : "guests"}`;
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">`,
    `<title>${escapeHtml(EMAIL_SENDER_NAME)}</title></head>`,
    `<body style="margin:0;padding:0;background:${b.night}">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">`,
    `Your pass for ${escapeHtml(variables.journeyTitle)} · #${escapeHtml(variables.reference)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="background:${b.night}"><tr><td align="center" style="padding:32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="max-width:560px">`,
    `<tr><td style="padding:0 0 28px;text-align:center">`,
    `<p style="margin:0;font-family:${b.serif};font-size:15px;letter-spacing:4px;`,
    `text-transform:uppercase;color:${b.gold}">${escapeHtml(EMAIL_SENDER_NAME)}</p>`,
    `</td></tr>`,
    `<tr><td style="padding:0 0 24px">`,
    `<h1 style="margin:0 0 10px;font-family:${b.serif};font-size:26px;line-height:1.25;`,
    `font-weight:normal;color:${b.ivory}">${escapeHtml(variables.holderName)}, your evening is set.</h1>`,
    `<p style="margin:0;font-family:${b.sans};font-size:14px;line-height:1.6;color:${b.muted}">`,
    `${escapeHtml(variables.journeyTitle)} · ${escapeHtml(guests)} · `,
    `<span style="font-family:ui-monospace,Menlo,monospace">#${escapeHtml(variables.reference)}</span></p>`,
    `</td></tr>`,
    `<tr><td style="padding:0 0 24px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `,
    `style="border:1px solid ${b.gold};border-radius:14px">`,
    `<tr><td style="padding:18px 20px;text-align:center">`,
    `<p style="margin:0 0 6px;font-family:${b.sans};font-size:10px;letter-spacing:3px;`,
    `text-transform:uppercase;color:${b.muted}">Secret host keyword</p>`,
    `<p style="margin:0;font-family:${b.serif};font-size:24px;letter-spacing:3px;color:${b.gold}">`,
    `${escapeHtml(variables.secretKeyword)}</p>`,
    `</td></tr></table>`,
    `</td></tr>`,
    variables.acts.map(passActHtml).join(""),
    `<tr><td style="padding:10px 0 0;text-align:center">`,
    `<a href="${safeHref(variables.journeyUrl)}" `,
    `style="display:inline-block;padding:12px 22px;border-radius:999px;background:${b.gold};`,
    `color:${b.night};font-family:${b.sans};font-size:13px;font-weight:600;letter-spacing:0.5px;`,
    `text-decoration:none">Open my journey &rarr;</a>`,
    `</td></tr>`,
    `<tr><td style="padding:24px 0 0;border-top:1px solid ${b.rule}">`,
    variables.simulated
      ? `<p style="margin:16px 0 0;font-family:${b.sans};font-size:11px;line-height:1.6;color:${b.muted}">${escapeHtml(variables.notice)}</p>`
      : "",
    `<p style="margin:12px 0 0;font-family:${b.sans};font-size:11px;line-height:1.6;color:${b.muted}">`,
    `You received this because you reserved this journey with ${escapeHtml(EMAIL_SENDER_NAME)}.</p>`,
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

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
      ].join("\n"),

    html: ({ code, expiresInMinutes }) =>
      layout(
        "Your login code",
        [
          '<p style="margin:0 0 16px">Use this code to sign in:</p>',
          '<p style="font-size:32px;font-weight:600;letter-spacing:6px;margin:0 0 16px;',
          `font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(code)}</p>`,
          `<p style="margin:0 0 16px">It expires in ${escapeHtml(String(expiresInMinutes))} `,
          "minutes and can be used once.</p>",
          '<p style="margin:0;color:#767676">If you did not try to sign in, ignore this ',
          "email. Nobody can access your account with this code alone.</p>",
        ].join(""),
      ),
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
        `${EMAIL_SENDER_NAME}`,
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
        `${EMAIL_SENDER_NAME}`,
      ].join("\n"),

    html: passHtml,
  },
};

export function isEmailTemplateId(value: string): value is EmailTemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, value);
}

export const EMAIL_TEMPLATE_IDS = Object.keys(TEMPLATES) as readonly EmailTemplateId[];

/**
 * Render a template to subject, plain text and HTML.
 *
 * Both bodies are always produced. A text alternative is not politeness: a
 * transactional message with no text part is scored as more likely to be spam,
 * and login codes that land in a spam folder read to the user as a broken
 * product.
 */
export function renderEmailTemplate<K extends EmailTemplateId>(
  template: K,
  variables: EmailTemplatePayloads[K],
): RenderedEmail {
  if (!isEmailTemplateId(template)) {
    // Reachable if a template id ever arrives from queued or persisted data,
    // which is untrusted input like any other.
    throw new ValidationError("Unknown email template.", { template });
  }

  const definition = TEMPLATES[template];

  return {
    subject: definition.subject(variables),
    text: definition.text(variables),
    html: definition.html(variables),
  };
}
