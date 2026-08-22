import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { EmailMessage, EmailPort, SendEmailResult } from "@/ports/email";
import { renderEmailTemplate } from "@/modules/notifications/email-templates";

/**
 * Development email transport.
 *
 * Writes the fully rendered message to the structured log instead of sending
 * it, so the whole authentication flow is exercisable on a laptop with no AWS
 * account. Nothing here is a stub: the message is rendered through the same
 * template code the SES adapter uses, so a broken template fails locally rather
 * than in production.
 *
 * It logs the login code in clear text. That is the entire point locally and
 * completely unacceptable anywhere else, which is why selecting this transport
 * in production is refused outright in `resolveEmailTransport` — a login code
 * in a retained production log is an account takeover for anyone with log
 * access.
 */
export class ConsoleEmailAdapter implements EmailPort {
  readonly #logger: () => Logger;

  /** `logger` is resolved per send so each line carries the request's correlation ID. */
  constructor(deps: { readonly logger: () => Logger }) {
    this.#logger = deps.logger;
  }

  /**
   * `async` rather than a hand-rolled `Promise.resolve`: rendering can throw on
   * an unknown template, and the port's contract is a rejected promise, not a
   * synchronous throw. A caller doing `send(...).catch(...)` must be able to
   * catch it — which is exactly what the SES adapter does.
   */
  async send(message: EmailMessage): Promise<SendEmailResult> {
    const rendered = renderEmailTemplate(message.template, message.variables);

    // A synthetic ID, prefixed so it can never be mistaken for a real SES
    // message ID when someone greps the logs during an incident.
    const providerMessageId = `console-${randomUUID()}`;

    this.#logger().warn(
      {
        transport: "console",
        template: message.template,
        to: message.to,
        subject: rendered.subject,
        body: rendered.text,
        providerMessageId,
      },
      "email NOT sent — development transport; message logged instead",
    );

    return { providerMessageId };
  }
}
