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
