import { SESv2Client, SendEmailCommand, type SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import type { Logger } from "pino";
import type { EmailMessage, EmailPort, SendEmailResult } from "@/ports/email";
import { EMAIL_SENDER_NAME, renderEmailTemplate } from "@/modules/notifications/email-templates";
import { InternalError, ProviderTimeoutError, ProviderUnavailableError } from "@/lib/errors";
import { maskEmail } from "@/lib/mask";

/**
 * Amazon SES adapter.
 *
 * The only file in the codebase that knows SES exists. Everything above it
 * depends on `EmailPort`, so replacing the provider is a change here and a line
 * in the factory.
 */

const CHARSET = "UTF-8";

/**
 * Network budget.
 *
 * A login code is sent inside the request the traveller is waiting on
 * (ADR-0011), so the failure path has to stay inside human patience. Two
 * attempts at four seconds bounds the worst case near nine seconds including
 * backoff; the AWS default of three attempts with no request timeout can hang a
 * request for minutes when SES is degraded.
 */
const CONNECTION_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_ATTEMPTS = 2;

/**
 * Errors that repeating cannot fix. Every one of these is a configuration or
 * account problem: the domain is not verified, the account is in the sandbox,
 * sending is paused, the address is malformed. Retrying burns the request
 * budget and delays the alarm that should fire instead.
 */
const TERMINAL_ERROR_NAMES: ReadonlySet<string> = new Set([
  "AccountSuspendedException",
  "BadRequestException",
  "MailFromDomainNotVerifiedException",
  "MessageRejected",
  "NotFoundException",
  "SendingPausedException",
  "ValidationException",
]);

const TIMEOUT_ERROR_NAMES: ReadonlySet<string> = new Set([
  "AbortError",
  "RequestAbortedError",
  "TimeoutError",
]);

export interface SesEmailConfig {
  /** Verified sender address. Supplied by configuration; never hard-coded. */
  readonly from: string;
  readonly region: string;
  /**
   * SES configuration set. Optional to construct, but it is what routes bounce
   * and complaint events; without one those signals are invisible and the
   * sending reputation degrades silently.
   */
  readonly configurationSet?: string | undefined;
  readonly senderName?: string;
}

/**
 * The slice of the SES client this adapter uses.
 *
 * Narrowed to one method so tests can supply a fake without a network, a
 * credential chain, or a mocking framework reaching into the module registry.
 */
export interface SesSendClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export interface SesEmailAdapterDeps {
  /**
   * Resolved per send, not captured once.
   *
   * `getLogger()` reads the active `AsyncLocalStorage` context, so calling it
   * at send time is what puts the request's correlation ID on the delivery log
   * line. A logger captured when the adapter was constructed would carry the
   * correlation ID of whichever request happened to build it first.
   */
  readonly logger: () => Logger;
  /** Injected in tests; built from the config when absent. */
  readonly client?: SesSendClient;
}

interface AwsErrorShape {
  readonly name?: string;
  readonly message?: string;
  readonly $metadata?: { readonly httpStatusCode?: number };
  readonly $retryable?: { readonly throttling?: boolean };
  readonly code?: string;
}

/** Quote a display name so a comma or quote cannot break the From header. */
function formatSender(name: string, address: string): string {
  const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}" <${address}>`;
}

export class SesEmailAdapter implements EmailPort {
  readonly #config: SesEmailConfig;
  readonly #logger: () => Logger;
  #client: SesSendClient | undefined;

  constructor(config: SesEmailConfig, deps: SesEmailAdapterDeps) {
    // Assert configuration at construction, per src/adapters/README.md: a
    // missing sender must fail at wiring time, not on the first login attempt
    // of a real traveller.
    if (!config.from) {
      throw new InternalError("SES adapter requires a sender address (EMAIL_FROM).");
    }
    if (!config.region) {
      throw new InternalError("SES adapter requires an AWS region.");
    }

    this.#config = config;
    this.#logger = deps.logger;
    this.#client = deps.client;
  }

  /**
   * Built on first use rather than in the constructor. The client resolves
   * credentials through the AWS provider chain (an IAM role in a deployed
   * environment), and doing that lazily keeps process startup free of an
   * outbound dependency.
   */
  #getClient(): SesSendClient {
    this.#client ??= new SESv2Client({
      region: this.#config.region,
      maxAttempts: MAX_ATTEMPTS,
      requestHandler: {
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        requestTimeout: REQUEST_TIMEOUT_MS,
      },
    });

    return this.#client;
  }

  async send(message: EmailMessage): Promise<SendEmailResult> {
    const rendered = renderEmailTemplate(message.template, message.variables);
    const recipient = maskEmail(message.to);

    const command = new SendEmailCommand({
      FromEmailAddress: formatSender(
        this.#config.senderName ?? EMAIL_SENDER_NAME,
        this.#config.from,
      ),
      Destination: { ToAddresses: [message.to] },
      ...(this.#config.configurationSet
        ? { ConfigurationSetName: this.#config.configurationSet }
        : {}),
      Content: {
        Simple: {
          Subject: { Data: rendered.subject, Charset: CHARSET },
          Body: {
            Text: { Data: rendered.text, Charset: CHARSET },
            Html: { Data: rendered.html, Charset: CHARSET },
          },
        },
      },
    });

    const startedAt = Date.now();

    let output: SendEmailCommandOutput;
    try {
      output = await this.#getClient().send(command);
    } catch (caught) {
      throw this.#translate(caught, message.template, recipient, Date.now() - startedAt);
    }

    const providerMessageId = output.MessageId;

    if (!providerMessageId) {
      // SES always returns an ID on success. Without one there is nothing to
      // reconcile a bounce against, so treat it as a failed send rather than
      // reporting a delivery that cannot be traced.
      throw new ProviderUnavailableError("SES accepted the message but returned no message ID.", {
        template: message.template,
        recipient,
      });
    }

    // Never the subject, body or variables: the login code lives in all three.
    this.#logger().info(
      {
        transport: "ses",
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
    const error = (caught ?? {}) as AwsErrorShape;
    const name = error.name ?? error.code ?? "UnknownError";
    const httpStatus = error.$metadata?.httpStatusCode;

    // Context is deliberately narrow. It reaches the logs and the error
    // reporter, so it carries what identifies the failure and nothing that
    // identifies the user or reveals the message.
    const context = { provider: "ses", template, recipient, providerError: name, httpStatus };

    this.#logger().error(
      { ...context, durationMs, err: caught },
      "transactional email delivery failed",
    );

    if (TIMEOUT_ERROR_NAMES.has(name)) {
      return new ProviderTimeoutError("Email provider timed out.", context, { cause: caught });
    }

    if (TERMINAL_ERROR_NAMES.has(name)) {
      // Non-operational on purpose: these are our misconfiguration, not the
      // user's mistake, so the message must not be echoed to the client and
      // someone should be paged.
      return new InternalError(`Email provider rejected the message: ${name}`, context, {
        cause: caught,
      });
    }

    if (error.$retryable?.throttling === true || httpStatus === 429) {
      return new ProviderUnavailableError("Email provider is throttling.", context, {
        cause: caught,
      });
    }

    if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
      return new InternalError(`Email provider rejected the message: ${name}`, context, {
        cause: caught,
      });
    }

    return new ProviderUnavailableError("Email provider is unavailable.", context, {
      cause: caught,
    });
  }
}
