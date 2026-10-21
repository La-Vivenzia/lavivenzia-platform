import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { ResendEmailAdapter, type ResendSendClient } from "@/adapters/email/resend";
import { InternalError, ProviderTimeoutError, ProviderUnavailableError } from "@/lib/errors";

/**
 * Resend adapter.
 *
 * Every test here drives a double rather than the SDK, so the suite needs no
 * API key, no network and no environment — and **no real email is ever sent**.
 *
 * What is being pinned is not "does it call the SDK": it is the behaviour the
 * layers above depend on. A terminal failure must not be retried, a transient
 * one must be, and a send must never report success without a provider message
 * ID to reconcile a bounce against.
 */

const CONFIG = { from: "hello@example.com", apiKey: "test-key-not-a-real-credential" } as const;

const MESSAGE = {
  to: "traveller@example.com",
  template: "auth.login-code",
  variables: { code: "123456", expiresInMinutes: 10 },
} as const;

function makeLogger() {
  const info = vi.fn();
  const error = vi.fn();
  return { logger: () => ({ info, error }) as unknown as Logger, info, error };
}

function clientReturning(result: Awaited<ReturnType<ResendSendClient["emails"]["send"]>>): {
  client: ResendSendClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn().mockResolvedValue(result);
  return { client: { emails: { send } }, send };
}

function clientThrowing(error: unknown): ResendSendClient {
  return { emails: { send: vi.fn().mockRejectedValue(error) } };
}

describe("ResendEmailAdapter", () => {
  describe("construction", () => {
    it("refuses a missing sender rather than failing on the first traveller", () => {
      const { logger } = makeLogger();
      expect(() => new ResendEmailAdapter({ from: "", apiKey: "k" }, { logger })).toThrow(
        InternalError,
      );
    });

    it("refuses a missing API key", () => {
      const { logger } = makeLogger();
      expect(() => new ResendEmailAdapter({ from: "a@b.com", apiKey: "" }, { logger })).toThrow(
        InternalError,
      );
    });
  });

  describe("successful send", () => {
    it("returns the provider message ID", async () => {
      const { logger } = makeLogger();
      const { client } = clientReturning({ data: { id: "msg_abc123" }, error: null });

      const result = await new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE);

      expect(result).toEqual({ providerMessageId: "msg_abc123" });
    });

    it("sends the rendered subject, text and html for the named template", async () => {
      const { logger } = makeLogger();
      const { client, send } = clientReturning({ data: { id: "msg_1" }, error: null });

      await new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE);

      const payload = send.mock.calls[0]?.[0];
      expect(payload.to).toEqual(["traveller@example.com"]);
      expect(payload.subject).toBeTruthy();
      expect(payload.text).toContain("123456");
      expect(payload.html).toContain("123456");
    });

    it("formats the From header with the brand display name", async () => {
      const { logger } = makeLogger();
      const { client, send } = clientReturning({ data: { id: "msg_1" }, error: null });

      await new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE);

      expect(send.mock.calls[0]?.[0].from).toBe('"La Vivenzia" <hello@example.com>');
    });

    it("passes an abort signal so a degraded provider cannot hang the login request", async () => {
      const { logger } = makeLogger();
      const { client, send } = clientReturning({ data: { id: "msg_1" }, error: null });

      await new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE);

      expect(send.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    it("logs the send without the code, the subject or the full address", async () => {
      const { logger, info } = makeLogger();
      const { client } = clientReturning({ data: { id: "msg_1" }, error: null });

      await new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE);

      const logged = JSON.stringify(info.mock.calls[0]?.[0]);
      expect(logged).not.toContain("123456");
      expect(logged).not.toContain("traveller@example.com");
      expect(logged).toContain("resend");
    });
  });

  describe("provider returns an error in the response body", () => {
    it("treats a validation error as terminal, not retryable", async () => {
      const { logger } = makeLogger();
      const { client } = clientReturning({
        data: null,
        error: { name: "validation_error", message: "from address is not verified" },
      });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(InternalError);
    });

    it("treats an invalid API key as terminal", async () => {
      const { logger } = makeLogger();
      const { client } = clientReturning({
        data: null,
        error: { name: "invalid_api_key", message: "API key is invalid" },
      });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(InternalError);
    });

    it("treats rate limiting as retryable", async () => {
      const { logger } = makeLogger();
      const { client } = clientReturning({
        data: null,
        error: { name: "rate_limit_exceeded", message: "too many requests" },
      });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it("never reports success when the body carries an error", async () => {
      const { logger } = makeLogger();
      // A returned error alongside data is the shape most likely to be
      // mis-read as a success. It must not be.
      const { client } = clientReturning({
        data: { id: "msg_should_be_ignored" },
        error: { name: "validation_error" },
      });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow();
    });
  });

  describe("thrown provider failures", () => {
    it("maps a timeout onto ProviderTimeoutError", async () => {
      const { logger } = makeLogger();
      const client = clientThrowing(
        Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      );

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(ProviderTimeoutError);
    });

    it("maps a 4xx onto a terminal error", async () => {
      const { logger } = makeLogger();
      const client = clientThrowing({ name: "bad_request", statusCode: 422 });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(InternalError);
    });

    it("maps a 429 onto a retryable error", async () => {
      const { logger } = makeLogger();
      const client = clientThrowing({ name: "too_many", statusCode: 429 });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it("treats an unrecognised failure as retryable rather than dropping a login code", async () => {
      const { logger } = makeLogger();
      const client = clientThrowing(new Error("socket hang up"));

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it("never puts the API key in the failure log", async () => {
      const { logger, error } = makeLogger();
      const client = clientThrowing({ name: "invalid_api_key", statusCode: 401 });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow();

      expect(JSON.stringify(error.mock.calls[0]?.[0])).not.toContain(CONFIG.apiKey);
    });
  });

  describe("missing message ID", () => {
    it("fails rather than reporting a delivery it cannot reconcile", async () => {
      const { logger } = makeLogger();
      const { client } = clientReturning({ data: null, error: null });

      await expect(
        new ResendEmailAdapter(CONFIG, { logger, client }).send(MESSAGE),
      ).rejects.toThrow(ProviderUnavailableError);
    });
  });
});
