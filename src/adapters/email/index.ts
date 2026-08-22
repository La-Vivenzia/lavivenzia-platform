import type { EmailPort } from "@/ports/email";
import { env } from "@/lib/env";
import { getLogger } from "@/lib/logger";
import { ConsoleEmailAdapter } from "@/adapters/email/console";
import { SesEmailAdapter } from "@/adapters/email/ses";
import { resolveEmailTransport } from "@/adapters/email/transport";

/**
 * Email transport selection.
 *
 * The only place that reads email configuration from the environment. The
 * decision itself lives in `resolveEmailTransport`, which is pure and tested;
 * this function just supplies it with the environment and builds the adapter it
 * names.
 */
export function createEmailAdapter(): EmailPort {
  const plan = resolveEmailTransport({
    nodeEnv: env.NODE_ENV,
    transport: env.EMAIL_TRANSPORT,
    from: env.EMAIL_FROM,
    region: env.AWS_REGION,
    configurationSet: env.SES_CONFIGURATION_SET,
  });

  // `getLogger` is passed rather than called: the adapters resolve it at send
  // time so each delivery line carries the correlation ID of the request that
  // caused it, even though the adapter itself is built once.
  if (plan.kind === "console") {
    return new ConsoleEmailAdapter({ logger: getLogger });
  }

  return new SesEmailAdapter(plan.config, { logger: getLogger });
}

export { resolveEmailTransport } from "@/adapters/email/transport";
export type { EmailTransportKind, EmailTransportPlan } from "@/adapters/email/transport";
