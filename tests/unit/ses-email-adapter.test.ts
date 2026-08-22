import { beforeEach, describe, expect, it } from "vitest";
import type { SendEmailCommand, SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import type { Logger } from "pino";
import { SesEmailAdapter, type SesSendClient } from "@/adapters/email/ses";
import type { EmailMessage } from "@/ports/email";
import { InternalError, ProviderTimeoutError, ProviderUnavailableError } from "@/lib/errors";

/**
 * The SES adapter is tested against a fake client rather than the network.
 *
 * AWS credentials are not available at this stage, and would not make these
 * assertions stronger if they were: what needs proving is that the right
 * request is constructed, that every failure mode lands on the right error, and
 * that nothing secret reaches the logs.
 */

const CODE = "482913";

const MESSAGE: EmailMessage = {
  to: "traveller@example.com",
  template: "auth.login-code",
  variables: { code: CODE, expiresInMinutes: 10 },
};

const CONFIG = {
  from: "no-reply@lavivenzia.com",
  region: "ap-south-1",
} as const;

interface LogLine {
  readonly level: "info" | "warn" | "error";
  readonly payload: unknown;
  readonly message: string;
}

/** Records what was logged so the tests can assert on it. */
function recordingLogger(): { logger: () => Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const push =
    (level: LogLine["level"]) =>
    (payload: unknown, message: string): void => {
      lines.push({ level, payload, message });
    };

  const fake = { info: push("info"), warn: push("warn"), error: push("error") };
  return { logger: () => fake as unknown as Logger, lines };
}

/** Captures the command instead of sending it. */
function fakeClient(behaviour: (command: SendEmailCommand) => Promise<SendEmailCommandOutput>): {
  client: SesSendClient;
  commands: SendEmailCommand[];
} {
  const commands: SendEmailCommand[] = [];

  return {
    commands,
    client: {
      send(command) {
        commands.push(command);
        return behaviour(command);
      },
    },
  };
}

function succeeds(messageId = "0100018f-aaaa-bbbb"): Promise<SendEmailCommandOutput> {
  return Promise.resolve({ MessageId: messageId, $metadata: {} });
}

/** An error shaped the way the AWS SDK shapes them. */
function awsError(
  name: string,
  extras: { httpStatusCode?: number; throttling?: boolean } = {},
): Error {
  const error = new Error(`${name}: provider said no`);
  error.name = name;
  Object.assign(error, {
    $metadata: { httpStatusCode: extras.httpStatusCode },
    ...(extras.throttling === undefined ? {} : { $retryable: { throttling: extras.throttling } }),
  });
  return error;
}

let log: ReturnType<typeof recordingLogger>;

beforeEach(() => {
  log = recordingLogger();
});

describe("construction", () => {
  it("refuses to build without a sender address", () => {
    // Fails at wiring, not on the first real traveller's login attempt.
    expect(
      () =>
        new SesEmailAdapter(
          { from: "", region: "ap-south-1" },
          { logger: log.logger, client: {} as SesSendClient },
        ),
    ).toThrow(InternalError);
  });

  it("refuses to build without a region", () => {
    expect(
      () =>
        new SesEmailAdapter(
          { from: "no-reply@lavivenzia.com", region: "" },
          { logger: log.logger, client: {} as SesSendClient },
        ),
    ).toThrow(InternalError);
  });
});

describe("successful send", () => {
  it("addresses the message to the recipient, from the configured sender", async () => {
    const { client, commands } = fakeClient(() => succeeds());
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE);

    const input = commands[0]!.input;
    expect(input.Destination?.ToAddresses).toEqual(["traveller@example.com"]);
    expect(input.FromEmailAddress).toContain("no-reply@lavivenzia.com");
    // Display name is quoted so a comma in it cannot split the header.
    expect(input.FromEmailAddress).toMatch(/^"[^"]+" <no-reply@lavivenzia\.com>$/);
  });

  it("sends the rendered subject and both bodies", async () => {
    const { client, commands } = fakeClient(() => succeeds());
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE);

    const simple = commands[0]!.input.Content?.Simple;
    expect(simple?.Subject?.Data).toContain(CODE);
    expect(simple?.Body?.Text?.Data).toContain(CODE);
    expect(simple?.Body?.Html?.Data).toContain(CODE);
    expect(simple?.Subject?.Charset).toBe("UTF-8");
  });

  it("returns the provider message ID for reconciliation", async () => {
    const { client } = fakeClient(() => succeeds("0100018f-1234"));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await expect(adapter.send(MESSAGE)).resolves.toEqual({ providerMessageId: "0100018f-1234" });
  });

  it("attaches the configuration set when one is configured", async () => {
    const { client, commands } = fakeClient(() => succeeds());
    const adapter = new SesEmailAdapter(
      { ...CONFIG, configurationSet: "lavivenzia-transactional" },
      { logger: log.logger, client },
    );

    await adapter.send(MESSAGE);
    expect(commands[0]!.input.ConfigurationSetName).toBe("lavivenzia-transactional");
  });

  it("omits the configuration set when none is configured", async () => {
    const { client, commands } = fakeClient(() => succeeds());
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE);
    expect(commands[0]!.input.ConfigurationSetName).toBeUndefined();
  });

  it("fails rather than reporting a send it cannot trace", async () => {
    // SES always returns an ID on success. Without one there is nothing to
    // match a later bounce against.
    const { client } = fakeClient(() => Promise.resolve({ $metadata: {} }));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await expect(adapter.send(MESSAGE)).rejects.toThrow(ProviderUnavailableError);
  });
});

describe("provider failures", () => {
  async function failWith(error: Error): Promise<unknown> {
    const { client } = fakeClient(() => Promise.reject(error));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });
    return adapter.send(MESSAGE).catch((caught: unknown) => caught);
  }

  it("treats a timeout as retryable", async () => {
    const error = await failWith(awsError("TimeoutError"));
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect((error as ProviderTimeoutError).isRetryable).toBe(true);
  });

  it("treats throttling as retryable", async () => {
    const error = await failWith(awsError("TooManyRequestsException", { throttling: true }));
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as ProviderUnavailableError).isRetryable).toBe(true);
  });

  it("treats a 429 as retryable even without the retryable marker", async () => {
    const error = await failWith(awsError("ThrottlingException", { httpStatusCode: 429 }));
    expect((error as ProviderUnavailableError).isRetryable).toBe(true);
  });

  it("treats a provider 5xx as retryable", async () => {
    const error = await failWith(
      awsError("InternalServiceErrorException", { httpStatusCode: 500 }),
    );
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as ProviderUnavailableError).isRetryable).toBe(true);
  });

  it("treats an unverified sending domain as terminal", async () => {
    // Retrying a configuration fault burns the budget and delays the alarm.
    const error = await failWith(
      awsError("MailFromDomainNotVerifiedException", { httpStatusCode: 400 }),
    );
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).isRetryable).toBe(false);
  });

  it("treats a rejected message as terminal", async () => {
    const error = await failWith(awsError("MessageRejected", { httpStatusCode: 400 }));
    expect((error as InternalError).isRetryable).toBe(false);
  });

  it("treats a suspended account as terminal", async () => {
    const error = await failWith(awsError("AccountSuspendedException", { httpStatusCode: 400 }));
    expect((error as InternalError).isRetryable).toBe(false);
  });

  it("treats an unrecognised 4xx as terminal", async () => {
    const error = await failWith(awsError("SomethingNewException", { httpStatusCode: 403 }));
    expect((error as InternalError).isRetryable).toBe(false);
  });

  it("treats an unrecognised failure with no status as retryable", async () => {
    // A bare socket error is far more likely transient than permanent, and
    // dropping a login code costs more than one extra attempt.
    const error = await failWith(awsError("ECONNRESET"));
    expect((error as ProviderUnavailableError).isRetryable).toBe(true);
  });

  it("survives a thrown non-error without masking it as success", async () => {
    const { client } = fakeClient(() => Promise.reject(new Error("string-like failure")));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });
    await expect(adapter.send(MESSAGE)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("keeps provider messages out of the client-facing body", async () => {
    // Non-operational errors are rendered opaquely by the HTTP layer, so the
    // provider's wording never reaches a caller.
    const error = (await failWith(
      awsError("MessageRejected", { httpStatusCode: 400 }),
    )) as InternalError;
    expect(error.isOperational).toBe(false);
  });
});

describe("logging", () => {
  it("never logs the code, the subject or the body on success", async () => {
    const { client } = fakeClient(() => succeeds());
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE);

    const serialised = JSON.stringify(log.lines);
    expect(serialised).not.toContain(CODE);
    expect(serialised).not.toContain("login code is");
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]!.level).toBe("info");
  });

  it("never logs the code on failure", async () => {
    const { client } = fakeClient(() => Promise.reject(awsError("MessageRejected")));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE).catch(() => undefined);

    expect(JSON.stringify(log.lines)).not.toContain(CODE);
  });

  it("masks the recipient rather than logging the full address", async () => {
    const { client } = fakeClient(() => succeeds());
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE);

    const payload = log.lines[0]!.payload as Record<string, unknown>;
    expect(payload.recipient).toBe("t*******r@example.com");
    expect(JSON.stringify(log.lines)).not.toContain("traveller@example.com");
  });

  it("keeps the full address out of the error context too", async () => {
    const { client } = fakeClient(() => Promise.reject(awsError("MessageRejected")));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    const error = (await adapter.send(MESSAGE).catch((e: unknown) => e)) as InternalError;

    expect(JSON.stringify(error.context)).not.toContain("traveller@example.com");
    expect(error.context.recipient).toBe("t*******r@example.com");
    expect(error.context.providerError).toBe("MessageRejected");
  });

  it("records the provider error name and template so a failure is diagnosable", async () => {
    const { client } = fakeClient(() => Promise.reject(awsError("TimeoutError")));
    const adapter = new SesEmailAdapter(CONFIG, { logger: log.logger, client });

    await adapter.send(MESSAGE).catch(() => undefined);

    const payload = log.lines[0]!.payload as Record<string, unknown>;
    expect(log.lines[0]!.level).toBe("error");
    expect(payload.providerError).toBe("TimeoutError");
    expect(payload.template).toBe("auth.login-code");
    expect(payload.provider).toBe("ses");
  });
});
