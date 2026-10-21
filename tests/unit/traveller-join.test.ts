import { describe, expect, it } from "vitest";
import {
  OTP_REQUEST_PATH,
  REGISTER_PATH,
  isAlreadyRegistered,
  startTravellerJoin,
} from "@/lib/traveller-join";
import { ApiError } from "@/lib/api-client";

/**
 * The join flow, and the dead end it exists to prevent.
 *
 * Someone who already has an account and lands on "create an account" used to
 * get "An account with that email already exists" and nothing else: no code, no
 * next step, no way forward from that screen. The registration endpoint was
 * behaving correctly — reporting the duplicate is the project's standing
 * trade-off — and the screen was treating a correct answer as a fatal error.
 *
 * The distinction these tests hold is between *this address is taken*, which is
 * not a failure of the thing the visitor is trying to do, and every other
 * failure, which is.
 */

/** Records the calls, so the test can assert what did and did not happen. */
function recordingClient(behaviour: Record<string, () => Promise<unknown>> = {}) {
  const calls: { path: string; body: unknown }[] = [];

  return {
    calls,
    client: {
      post(path: string, body?: unknown): Promise<unknown> {
        calls.push({ path, body });
        const handler = behaviour[path];
        return handler ? handler() : Promise.resolve({});
      },
    },
  };
}

const conflict = () =>
  Promise.reject(
    new ApiError({
      status: 409,
      code: "CONFLICT",
      message: "An account with that email already exists.",
    }),
  );

describe("isAlreadyRegistered", () => {
  it("recognises a 409 from the registration endpoint", () => {
    expect(
      isAlreadyRegistered(new ApiError({ status: 409, code: "CONFLICT", message: "taken" })),
    ).toBe(true);
  });

  it("does not treat other failures as a duplicate address", () => {
    // Keyed on status rather than message, because the message is user-facing
    // copy that will be reworded and must not be load-bearing.
    for (const status of [400, 401, 403, 404, 422, 429, 500, 503]) {
      expect(isAlreadyRegistered(new ApiError({ status, code: "INTERNAL", message: "no" }))).toBe(
        false,
      );
    }
  });

  it("does not mistake a plain error for a duplicate address", () => {
    // A network failure is an `Error`, not an `ApiError`, and has no status.
    expect(isAlreadyRegistered(new Error("network"))).toBe(false);
    expect(isAlreadyRegistered(null)).toBe(false);
    expect(isAlreadyRegistered({ status: 409 })).toBe(false);
  });
});

describe("startTravellerJoin — a new address", () => {
  it("registers, then asks for a code", async () => {
    const { client, calls } = recordingClient();

    await startTravellerJoin(client, "someone@example.com");

    expect(calls.map((call) => call.path)).toEqual([REGISTER_PATH, OTP_REQUEST_PATH]);
  });

  it("registers as a traveller, with no password", async () => {
    // The role decides whether a password is required. Registering as a host
    // here would demand one that the screen never collects.
    const { client, calls } = recordingClient();

    await startTravellerJoin(client, "someone@example.com");

    expect(calls[0]?.body).toEqual({ email: "someone@example.com", role: "traveller" });
    expect(calls[0]?.body).not.toHaveProperty("password");
  });
});

describe("startTravellerJoin — an address that already has an account", () => {
  it("continues to the code request instead of stopping", async () => {
    // The regression. Before the fix this threw, and the screen showed the
    // conflict message with no way forward.
    const { client, calls } = recordingClient({ [REGISTER_PATH]: conflict });

    await expect(startTravellerJoin(client, "existing@example.com")).resolves.toBeUndefined();

    expect(calls.map((call) => call.path)).toEqual([REGISTER_PATH, OTP_REQUEST_PATH]);
  });

  it("asks for the code against the address that was typed", async () => {
    const { client, calls } = recordingClient({ [REGISTER_PATH]: conflict });

    await startTravellerJoin(client, "existing@example.com");

    expect(calls[1]?.body).toEqual({ email: "existing@example.com" });
  });
});

describe("startTravellerJoin — genuine failures still fail", () => {
  it("propagates a rate limit rather than pretending a code was sent", async () => {
    // Swallowing this would show "a code is on its way" to someone who is being
    // throttled and will receive nothing.
    const { client, calls } = recordingClient({
      [REGISTER_PATH]: () =>
        Promise.reject(
          new ApiError({ status: 429, code: "RATE_LIMITED", message: "Too many attempts." }),
        ),
    });

    await expect(startTravellerJoin(client, "someone@example.com")).rejects.toThrow(ApiError);
    expect(calls.map((call) => call.path)).toEqual([REGISTER_PATH]);
  });

  it("propagates a validation failure", async () => {
    const { client } = recordingClient({
      [REGISTER_PATH]: () =>
        Promise.reject(
          new ApiError({ status: 400, code: "VALIDATION_FAILED", message: "Not an address." }),
        ),
    });

    await expect(startTravellerJoin(client, "not-an-address")).rejects.toThrow(ApiError);
  });

  it("propagates a failure from the code request itself", async () => {
    // Only registration is forgiving. If asking for the code fails, the screen
    // must say so rather than advance to a step that cannot complete.
    const { client } = recordingClient({
      [REGISTER_PATH]: conflict,
      [OTP_REQUEST_PATH]: () =>
        Promise.reject(
          new ApiError({ status: 503, code: "PROVIDER_UNAVAILABLE", message: "Email is down." }),
        ),
    });

    await expect(startTravellerJoin(client, "existing@example.com")).rejects.toThrow(ApiError);
  });

  it("does not swallow a conflict raised by the code request", async () => {
    // The 409 tolerance belongs to registration alone. A conflict from a
    // different call is not the case this exists to handle.
    const { client } = recordingClient({ [OTP_REQUEST_PATH]: conflict });

    await expect(startTravellerJoin(client, "someone@example.com")).rejects.toThrow(ApiError);
  });
});
