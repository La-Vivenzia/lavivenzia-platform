import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RazorpayAdapter } from "@/adapters/payments/razorpay";
import { NotImplementedError, UnauthenticatedError, ValidationError } from "@/lib/errors";

const SECRET = "test_webhook_secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

const adapter = new RazorpayAdapter({ webhookSecret: SECRET });

describe("RazorpayAdapter.verifyWebhook", () => {
  const body = JSON.stringify({ id: "evt_123", event: "payment.captured", payload: {} });

  it("accepts a correctly signed payload and returns the idempotency key", async () => {
    const event = await adapter.verifyWebhook(body, sign(body));

    expect(event.eventId).toBe("evt_123");
    expect(event.eventType).toBe("payment.captured");
  });

  it("rejects a payload signed with the wrong secret", async () => {
    await expect(adapter.verifyWebhook(body, sign(body, "wrong_secret"))).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("rejects a tampered body even when the signature is well formed", async () => {
    const signature = sign(body);
    const tampered = JSON.stringify({ id: "evt_123", event: "payment.failed", payload: {} });

    await expect(adapter.verifyWebhook(tampered, signature)).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects a signature of the wrong length without throwing on the comparison", async () => {
    await expect(adapter.verifyWebhook(body, "abc")).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects an empty signature", async () => {
    await expect(adapter.verifyWebhook(body, "")).rejects.toThrow(UnauthenticatedError);
  });

  it("verifies the signature before parsing the body", async () => {
    // Malformed JSON with a bad signature must fail as a signature error, not a
    // parse error: we must never parse unverified input.
    await expect(adapter.verifyWebhook("{not json", "deadbeef")).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("rejects a verified body that is not valid JSON", async () => {
    const malformed = "{not json";
    await expect(adapter.verifyWebhook(malformed, sign(malformed))).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects a verified body missing the event id", async () => {
    const missing = JSON.stringify({ event: "payment.captured" });
    await expect(adapter.verifyWebhook(missing, sign(missing))).rejects.toThrow(ValidationError);
  });
});

describe("RazorpayAdapter construction", () => {
  it("refuses to construct without a webhook secret", () => {
    expect(() => new RazorpayAdapter({ webhookSecret: "" })).toThrow(ValidationError);
  });
});

describe("deferred payment operations", () => {
  it("fails loudly rather than returning empty data", () => {
    expect(() =>
      adapter.createOrder({
        amount: { amountMinor: 499900, currency: "INR" },
        referenceId: "ref-1",
      }),
    ).toThrow(NotImplementedError);

    expect(() => adapter.fetchPayment("pay_1")).toThrow(NotImplementedError);
  });
});
