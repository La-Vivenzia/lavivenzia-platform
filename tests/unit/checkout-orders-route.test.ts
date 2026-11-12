// Set test environment secrets before importing any modules that touch @/lib/env
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789012345678901234567890123456789012345678901234567890123";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://lavivenzia:lavivenzia_local_dev@localhost:5432/lavivenzia";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ForbiddenError,
  NotFoundError,
  OrderCreationInProgressError,
  OrderStatusUnresolvedError,
  PaymentGatewayError,
  PaymentGatewayTimeoutError,
  UnauthenticatedError,
} from "@/lib/errors";
import type { Principal } from "@/modules/auth/authorization";

// Mock auth-context
const mockRequirePrincipal = vi.fn();
const mockAssertSameOrigin = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  requirePrincipal: () => mockRequirePrincipal(),
  assertSameOrigin: (url: string) => mockAssertSameOrigin(url),
}));

// Mock container
const mockCreateCheckoutOrder = vi.fn();
vi.mock("@/lib/container", () => ({
  getCheckoutOrdersService: () => ({
    createCheckoutOrder: mockCreateCheckoutOrder,
  }),
}));

describe("POST /api/v1/checkout/orders Route Handler", () => {
  const dummyPrincipal: Principal = {
    userId: "u-auth-traveller-1",
    email: "traveller@lavivenzia.com",
    sessionId: "sess-abc",
    roles: ["traveller"],
    permissions: new Set(["booking:create"]),
    mfaSatisfied: false,
    lastAuthenticatedAt: new Date(),
  };

  const validBookingId = "8b9487c6-2c93-4e42-998e-4a64860b21a8";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePrincipal.mockResolvedValue(dummyPrincipal);
    mockAssertSameOrigin.mockResolvedValue(undefined);
  });

  function createRequest(body: unknown, origin = "http://localhost:3000"): Request {
    return new Request("http://localhost:3000/api/v1/checkout/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("returns 201 Created with order payload for a valid request (Scenario A)", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");

    const mockResult = {
      statusCode: 201 as const,
      body: {
        bookingId: validBookingId,
        paymentId: "7a32e18b-2c93-4e42-998e-4a64860b21a8",
        gatewayOrderId: "order_MNOP1234567890",
        orderId: "order_MNOP1234567890",
        amount: 50000,
        currency: "INR",
        receipt: "p_7a32e18b-2c93-4e42-998e-4a64860b21a8",
        status: "INITIATED",
      },
    };
    mockCreateCheckoutOrder.mockResolvedValue(mockResult);

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual(mockResult.body);
    expect(mockCreateCheckoutOrder).toHaveBeenCalledWith({
      bookingId: validBookingId,
      userId: dummyPrincipal.userId,
    });
  });

  it("returns 200 OK with order payload for an idempotent replay (Scenario B)", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");

    const mockResult = {
      statusCode: 200 as const,
      body: {
        bookingId: validBookingId,
        paymentId: "7a32e18b-2c93-4e42-998e-4a64860b21a8",
        gatewayOrderId: "order_MNOP1234567890",
        orderId: "order_MNOP1234567890",
        amount: 50000,
        currency: "INR",
        receipt: "p_7a32e18b-2c93-4e42-998e-4a64860b21a8",
        status: "INITIATED",
      },
    };
    mockCreateCheckoutOrder.mockResolvedValue(mockResult);

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockResult.body);
  });

  it("rejects unauthenticated requests with 401 Unauthenticated", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockRequirePrincipal.mockRejectedValue(new UnauthenticatedError());

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);
    expect(response.status).toBe(401);
  });

  it("rejects CSRF origin mismatch with 403 Forbidden", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockAssertSameOrigin.mockRejectedValue(new ForbiddenError("Cross-origin request rejected."));

    const response = await POST(
      createRequest({ bookingId: validBookingId }, "http://malicious-site.com"),
      undefined,
    );
    expect(response.status).toBe(403);
  });

  it("rejects malformed body (invalid booking UUID) with 400 Validation Error", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");

    const response = await POST(createRequest({ bookingId: "not-a-uuid" }), undefined);
    expect(response.status).toBe(400);
  });

  it("translates NotFoundError (missing or unauthorized booking) to 404 Not Found", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockCreateCheckoutOrder.mockRejectedValue(
      new NotFoundError("Booking not found.", { bookingId: validBookingId }),
    );

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("translates OrderCreationInProgressError to 409 Conflict with structured code", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockCreateCheckoutOrder.mockRejectedValue(
      new OrderCreationInProgressError(
        "An order creation request is currently being processed for this reservation. Please wait.",
        { paymentId: "p-in-flight" },
      ),
    );

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("ORDER_CREATION_IN_PROGRESS");
    expect(body.error.paymentId).toBe("p-in-flight");
  });

  it("translates OrderStatusUnresolvedError to 409 Conflict with structured code and status", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockCreateCheckoutOrder.mockRejectedValue(
      new OrderStatusUnresolvedError(
        "A previous checkout attempt has an unresolved status. Please wait for automated verification or contact support.",
        { paymentId: "p-uncertain", status: "INITIATED_UNCERTAIN" },
      ),
    );

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("ORDER_STATUS_UNRESOLVED");
    expect(body.error.paymentId).toBe("p-uncertain");
    expect(body.error.status).toBe("INITIATED_UNCERTAIN");
  });

  it("translates PaymentGatewayError to 502 Bad Gateway with PAYMENT_GATEWAY_ERROR code", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockCreateCheckoutOrder.mockRejectedValue(
      new PaymentGatewayError("Payment provider rejected order creation. Please try again."),
    );

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("PAYMENT_GATEWAY_ERROR");
  });

  it("translates PaymentGatewayTimeoutError to 504 Gateway Timeout with PAYMENT_GATEWAY_TIMEOUT code", async () => {
    const { POST } = await import("@/app/api/v1/checkout/orders/route");
    mockCreateCheckoutOrder.mockRejectedValue(
      new PaymentGatewayTimeoutError(
        "Payment provider timed out. Order outcome is uncertain. Verification in progress.",
        { paymentId: "p-timeout", status: "INITIATED_UNCERTAIN" },
      ),
    );

    const response = await POST(createRequest({ bookingId: validBookingId }), undefined);
    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body.error.code).toBe("PAYMENT_GATEWAY_TIMEOUT");
    expect(body.error.paymentId).toBe("p-timeout");
    expect(body.error.status).toBe("INITIATED_UNCERTAIN");
  });
});
