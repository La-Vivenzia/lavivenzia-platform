import { describe, expect, it } from "vitest";
import type { Logger } from "pino";
import { ConsoleEmailAdapter } from "@/adapters/email/console";
import type { EmailMessage } from "@/ports/email";

/**
 * The development transport.
 *
 * It exists so the whole authentication flow is exercisable with no AWS
 * account. What matters is that it renders through the same template code as
 * SES — so a broken template fails on a laptop rather than in production — and
 * that it is unmistakably not a delivery.
 */

const CODE = "482913";

const MESSAGE: EmailMessage = {
  to: "traveller@example.com",
  template: "auth.login-code",
  variables: { code: CODE, expiresInMinutes: 10 },
};

interface LogLine {
  readonly level: string;
  readonly payload: Record<string, unknown>;
  readonly message: string;
}

function recordingLogger(): { logger: () => Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const push =
    (level: string) =>
    (payload: Record<string, unknown>, message: string): void => {
      lines.push({ level, payload, message });
    };

  const fake = { info: push("info"), warn: push("warn"), error: push("error") };
  return { logger: () => fake as unknown as Logger, lines };
}

describe("ConsoleEmailAdapter", () => {
  it("logs the rendered message including the code", async () => {
    // Deliberate, and the reason this transport is refused in production.
    const log = recordingLogger();
    await new ConsoleEmailAdapter({ logger: log.logger }).send(MESSAGE);

    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]!.payload.body).toContain(CODE);
    expect(log.lines[0]!.payload.to).toBe("traveller@example.com");
  });

  it("says plainly that nothing was sent", async () => {
    // A developer reading the log must not mistake this for a delivery.
    const log = recordingLogger();
    await new ConsoleEmailAdapter({ logger: log.logger }).send(MESSAGE);

    expect(log.lines[0]!.level).toBe("warn");
    expect(log.lines[0]!.message).toContain("NOT sent");
  });

  it("renders through the shared template code", async () => {
    // If it stubbed the body instead, a broken template would only surface in
    // production — which is exactly the failure this transport should catch.
    const log = recordingLogger();
    await new ConsoleEmailAdapter({ logger: log.logger }).send(MESSAGE);

    expect(log.lines[0]!.payload.subject).toContain(CODE);
    expect(String(log.lines[0]!.payload.body)).toContain("10 minutes");
  });

  it("returns a message ID that cannot be mistaken for a real one", async () => {
    const log = recordingLogger();
    const result = await new ConsoleEmailAdapter({ logger: log.logger }).send(MESSAGE);

    expect(result.providerMessageId).toMatch(/^console-/);
  });

  it("returns a distinct ID per send", async () => {
    const log = recordingLogger();
    const adapter = new ConsoleEmailAdapter({ logger: log.logger });

    const first = await adapter.send(MESSAGE);
    const second = await adapter.send(MESSAGE);

    expect(first.providerMessageId).not.toBe(second.providerMessageId);
  });

  it("propagates a template failure rather than swallowing it", async () => {
    const log = recordingLogger();
    const adapter = new ConsoleEmailAdapter({ logger: log.logger });

    await expect(
      adapter.send({ ...MESSAGE, template: "auth.nope" as "auth.login-code" }),
    ).rejects.toThrow();
  });
});
