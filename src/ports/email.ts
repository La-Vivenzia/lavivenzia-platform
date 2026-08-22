import type {
  EmailTemplateId,
  EmailTemplatePayloads,
} from "@/modules/notifications/email-templates";

/**
 * Transactional email port (FR-12).
 *
 * Callers name a template and pass variables; they never assemble a body and
 * never see a provider concept. Rendering lives in
 * `@/modules/notifications/email-templates`, delivery in `src/adapters/email`.
 *
 * Delivery is synchronous with respect to the caller (ADR-0011). The one email
 * that exists today is a login code, which a user is actively waiting for; the
 * queue is the right home for mail that follows a business write, such as a
 * voucher or an invoice, and those arrive with the phases that own them.
 */

/**
 * A message to send.
 *
 * Distributed over the template map rather than declared as one loose shape, so
 * `variables` is checked against the template named in the same object. A
 * mismatched payload is a compile error, not a blank placeholder in a live
 * email.
 */
export type EmailMessage = {
  [K in EmailTemplateId]: {
    readonly to: string;
    readonly template: K;
    readonly variables: EmailTemplatePayloads[K];
  };
}[EmailTemplateId];

export interface SendEmailResult {
  /** Provider message ID, recorded for delivery reconciliation and support. */
  readonly providerMessageId: string;
}

export interface EmailPort {
  /**
   * Deliver one message.
   *
   * Implementations must throw a retryable `AppError` for transient provider
   * failures and a non-retryable one for rejections that repeating cannot fix,
   * so that callers and the worker share one notion of what to do next. They
   * must never resolve without having handed the message to a provider —
   * a silent no-op reads to every layer above as a successful send.
   */
  send(message: EmailMessage): Promise<SendEmailResult>;
}
