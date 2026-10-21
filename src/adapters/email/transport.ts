import { InternalError } from "@/lib/errors";
import type { SesEmailConfig } from "@/adapters/email/ses";
import type { ResendEmailConfig } from "@/adapters/email/resend";

/**
 * Which email transport a given configuration selects, and whether that
 * combination is allowed.
 *
 * Split out from the factory so it can be tested exhaustively without an
 * environment, a logger or the AWS SDK. The rules here are the ones that stop a
 * deployment from quietly not sending mail, so they deserve tests that run in
 * the suite requiring no infrastructure.
 */

export const EMAIL_TRANSPORTS = ["resend", "ses", "console"] as const;
export type EmailTransportKind = (typeof EMAIL_TRANSPORTS)[number];

export interface EmailTransportInput {
  readonly nodeEnv: "development" | "test" | "production";
  readonly transport: EmailTransportKind;
  readonly from?: string | undefined;
  readonly region?: string | undefined;
  readonly configurationSet?: string | undefined;
  readonly resendApiKey?: string | undefined;
}

export type EmailTransportPlan =
  | { readonly kind: "console" }
  | { readonly kind: "ses"; readonly config: SesEmailConfig }
  | { readonly kind: "resend"; readonly config: ResendEmailConfig };

/**
 * Decide the transport, refusing configurations that would silently do the
 * wrong thing.
 *
 * Two refusals matter, and both are production-only:
 *
 * - the console transport in production, because it reports success while
 *   sending nothing and writes login codes into a retained log;
 * - a real transport with no verified sender or no credential, because the
 *   adapter would be constructed and then fail on the first real traveller
 *   instead of at deploy time.
 *
 * Failing at wiring is the whole design: the process refuses to start rather
 * than serving a login page that cannot deliver a code.
 */
export function resolveEmailTransport(input: EmailTransportInput): EmailTransportPlan {
  const isProduction = input.nodeEnv === "production";

  if (input.transport === "console") {
    if (isProduction) {
      throw new InternalError(
        "EMAIL_TRANSPORT=console is not permitted in production: it sends no mail and logs login codes. Set EMAIL_TRANSPORT=ses.",
      );
    }

    return { kind: "console" };
  }

  const from = input.from?.trim();

  if (input.transport === "resend") {
    const apiKey = input.resendApiKey?.trim();

    if (!from) {
      throw new InternalError(
        "EMAIL_TRANSPORT=resend requires EMAIL_FROM (an address on a domain verified in Resend).",
      );
    }
    if (!apiKey) {
      throw new InternalError("EMAIL_TRANSPORT=resend requires RESEND_API_KEY.");
    }

    return { kind: "resend", config: { from, apiKey } };
  }

  const region = input.region?.trim();

  if (!from) {
    throw new InternalError("EMAIL_TRANSPORT=ses requires EMAIL_FROM (a verified SES identity).");
  }
  if (!region) {
    throw new InternalError("EMAIL_TRANSPORT=ses requires AWS_REGION.");
  }

  const configurationSet = input.configurationSet?.trim();

  return {
    kind: "ses",
    config: {
      from,
      region,
      ...(configurationSet ? { configurationSet } : {}),
    },
  };
}
