import { Resend } from "resend";
import type { Logger } from "pino";
import type { EmailMessage, EmailPort, SendEmailResult } from "@/ports/email";
import { EMAIL_SENDER_NAME, renderEmailTemplate } from "@/modules/notifications/email-templates";
import { InternalError, ProviderTimeoutError, ProviderUnavailableError } from "@/lib/errors";
import { maskEmail } from "@/lib/mask";

/**
 * Resend adapter.
 *
 * The only file in the codebase that knows Resend exists, mirroring the SES
 * adapter beside it. Everything above depends on `EmailPort`, so which provider
 * is in use is a line in the factory and an environment variable.
 *
 * It is deliberately a near-twin of `src/adapters/email/ses`: the same network
 * budget, the same terminal-versus-retryable split, the same masked logging,
 * and the same refusal to report a send that carries no provider message ID.
 * Two transports that fail differently would make an incident harder to read
 * than the provider swap is worth.
 */

/**
 * Network budget.
 *
 * A login code is sent inside the request the traveller is waiting on
 * (ADR-0011), so the failure path has to stay inside human patience. Resend's
 * SDK has no request timeout of its own, so one is imposed here with
 * `AbortSignal.timeout`; without it a degraded provider hangs the login request
 * until the platform's own timeout fires, which is far longer than a person
 * will wait.
 */
const REQUEST_TIMEOUT_MS = 4_000;

/**
 * Status codes that repeating cannot fix. Each is a configuration or account
 * problem — unverified domain, bad API key, malformed address, payload too
 * large — so retrying burns the request budget and delays the alarm that should
 * fire instead.
 *
 * 429 is deliberately absent: rate limiting is transient and retryable.
 */
const TERMINAL_STATUS_CODES: ReadonlySet<number> = new Set([400, 401, 403, 404, 409, 413, 422]);

/**
 * Resend's documented error names for the same conditions. The API returns a
 * structured `name` alongside the status, and matching on it survives a status
 * code changing under us.
 */
const TERMINAL_ERROR_NAMES: ReadonlySet<string> = new Set([
  "validation_error",
  "missing_api_key",
  "restricted_api_key",
  "invalid_api_key",
  "invalid_from_address",
  "invalid_to_address",
  "not_found",
  "method_not_allowed",
  "invalid_attachment",
]);

export interface ResendEmailConfig {
  /** Sender address on a domain verified in Resend. Never hard-coded. */
  readonly from: string;
  /**
   * API key. Supplied by configuration and never logged — `#translate` records
   * the error name and status only.
   */
  readonly apiKey: string;
  /** Overrides the display name on the From header. Defaults to the brand. */
  readonly senderName?: string | undefined;
}

/**
 * The slice of the Resend SDK this adapter uses.
 *
 * Declared structurally so the unit tests can supply a double without the SDK,
 * a network, or an API key — the same approach the SES adapter takes.
 */
export interface ResendSendClient {
  readonly emails: {
    send(
      payload: {
        readonly from: string;
        readonly to: readonly string[];
        readonly subject: string;
        readonly text: string;
        readonly html: string;
      },
      options?: { readonly signal?: AbortSignal },
    ): Promise<{
      readonly data: { readonly id: string } | null;
      readonly error: { readonly name?: string; readonly message?: string } | null;
    }>;
  };
}

export interface ResendEmailAdapterDeps {
  readonly logger: () => Logger;
  /** Injected in tests. Built lazily from the config in production. */
  readonly client?: ResendSendClient;
}

interface ResendErrorShape {
  readonly name?: string;
  readonly message?: string;
  readonly statusCode?: number;
}

function formatSender(name: string, address: string): string {
  const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}" <${address}>`;
}

export class ResendEmailAdapter implements EmailPort {
  readonly #config: ResendEmailConfig;
  readonly #logger: () => Logger;
  #client: ResendSendClient | undefined;

  constructor(config: ResendEmailConfig, deps: ResendEmailAdapterDeps) {
    if (!config.from) {
      throw new InternalError("Resend adapter requires a sender address (EMAIL_FROM).");
    }
    if (!config.apiKey) {
      throw new InternalError("Resend adapter requires an API key (RESEND_API_KEY).");
    }

    this.#config = config;
    this.#logger = deps.logger;
    this.#client = deps.client;
  }

  /**
   * Built on first use rather than in the constructor, matching the SES
   * adapter: process startup stays free of provider construction.
   */
  #getClient(): ResendSendClient {
    this.#client ??= new Resend(this.#config.apiKey) as unknown as ResendSendClient;
    return this.#client;
  }

  async send(message: EmailMessage): Promise<SendEmailResult> {
    const rendered = renderEmailTemplate(message.template, message.variables);
    const recipient = maskEmail(message.to);
    const startedAt = Date.now();

    let result: Awaited<ReturnType<ResendSendClient["emails"]["send"]>>;
    try {
      result = await this.#getClient().emails.send(
        {
          from: formatSender(this.#config.senderName ?? EMAIL_SENDER_NAME, this.#config.from),
          to: [message.to],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        },
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
    } catch (caught) {
      throw this.#translate(caught, message.template, recipient, Date.now() - startedAt);
    }

    // Resend reports failure in the response body rather than by throwing, so
    // the error branch has to be read explicitly. Treating a returned error as
    // a success is the one mistake that would report delivery of a login code
    // that was never sent.
    if (result.error) {
      throw this.#translate(result.error, message.template, recipient, Date.now() - startedAt);
    }

    const providerMessageId = result.data?.id;

    if (!providerMessageId) {
      // Without an ID there is nothing to reconcile a bounce against, so treat
      // it as a failed send rather than reporting an untraceable delivery.
      throw new ProviderUnavailableError(
        "Resend accepted the message but returned no message ID.",
        { template: message.template, recipient },
      );
    }

    // Never the subject, body or variables: the login code lives in all three.
    this.#logger().info(
      {
        transport: "resend",
        template: message.template,
        recipient,
        providerMessageId,
        durationMs: Date.now() - startedAt,
      },
      "transactional email sent",
    );

    return { providerMessageId };
  }

  /**
   * Map a provider failure onto the shared error model.
   *
   * The distinction that matters downstream is retryable versus terminal — the
   * worker turns it into a retry decision and the HTTP layer into a status
   * code. Anything unrecognised is treated as retryable: an unknown network
   * fault is far more likely transient than permanent, and the cost of one
   * extra attempt is lower than the cost of dropping a login code.
   */
  #translate(caught: unknown, template: string, recipient: string, durationMs: number): Error {
    const error = (caught ?? {}) as ResendErrorShape;
    const name = error.name ?? "UnknownError";
    const httpStatus = error.statusCode;

    // Context is deliberately narrow. It reaches the logs and the error
    // reporter, so it carries what identifies the failure and nothing that
    // identifies the user, reveals the message, or echoes the API key.
    const context = { provider: "resend", template, recipient, providerError: name, httpStatus };

    this.#logger().error(
      { ...context, durationMs, err: caught },
      "transactional email delivery failed",
    );

    // `AbortSignal.timeout` rejects with a TimeoutError DOMException.
    if (name === "TimeoutError" || name === "AbortError") {
      return new ProviderTimeoutError("Email provider timed out.", context, { cause: caught });
    }

    if (httpStatus === 429 || name === "rate_limit_exceeded" || name === "daily_quota_exceeded") {
      return new ProviderUnavailableError("Email provider is throttling.", context, {
        cause: caught,
      });
    }

    if (
      TERMINAL_ERROR_NAMES.has(name) ||
      (httpStatus !== undefined && TERMINAL_STATUS_CODES.has(httpStatus))
    ) {
      // Non-operational on purpose: these are our misconfiguration, not the
      // user's mistake, so the message must not be echoed to the client and
      // someone should be paged.
      return new InternalError(`Email provider rejected the message: ${name}`, context, {
        cause: caught,
      });
    }

    return new ProviderUnavailableError("Email provider is unavailable.", context, {
      cause: caught,
    });
  }
}
