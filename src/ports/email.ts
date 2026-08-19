/**
 * Transactional email port (FR-12).
 *
 * All sending is asynchronous, via the worker — never inline in a request.
 */

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /** Template identifier; bodies are not assembled by callers. */
  readonly template: string;
  readonly variables: Readonly<Record<string, string | number>>;
}

export interface EmailPort {
  /** Returns the provider message ID, recorded for delivery reconciliation. */
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}
