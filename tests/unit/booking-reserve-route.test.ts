// Set test environment secrets before importing any modules that touch @/lib/env
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789012345678901234567890123456789012345678901234567890123";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://lavivenzia:lavivenzia_local_dev@localhost:5432/lavivenzia";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import type { Principal } from "@/modules/auth/authorization";

// Mock auth-context
const mockRequirePrincipal = vi.fn();
const mockAssertSameOrigin = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  requirePrincipal: () => mockRequirePrincipal(),
  assertSameOrigin: (url: string) => mockAssertSameOrigin(url),
}));

// Mock container
const mockReserveHold = vi.fn();
vi.mock("@/lib/container", () => ({
  getBookingCapacityEngine: () => ({
    reserveHold: mockReserveHold,
  }),
}));

describe("POST /api/v1/checkout/reserve Route Handler", () => {
  const dummyPrincipal: Principal = {
    userId: "u-auth-1234",
    email: "auth-traveller@lavivenzia.com",
    sessionId: "sess-1",
    roles: ["traveller"],
    permissions: new Set(["booking:create"]),
    mfaSatisfied: false,
    lastAuthenticatedAt: new Date(),
  };

  const validSlotId = "8b9487c6-2c93-4e42-998e-4a64860b21a8";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePrincipal.mockResolvedValue(dummyPrincipal);
    mockAssertSameOrigin.mockResolvedValue(undefined);
  });

  function createRequest(body: unknown, origin = "http://localhost:3000"): Request {
    return new Request("http://localhost:3000/api/v1/checkout/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("returns 201 with reservation payload for a valid authenticated request", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    const mockResult = {
      booking: {
        id: "b-1",
        bookingReference: "LV-A1B2-C3D4",
        userId: dummyPrincipal.userId,
        slotId: validSlotId,
        guestCount: 2,
        status: "HELD",
        heldUntil: new Date("2026-11-10T12:05:00.000Z"),
        totalAmountMinorUnits: 500000,
        currency: "INR",
      },
      quote: { totalMinor: 500000, currency: "INR" },
      slot: { id: validSlotId, capacity: 10, availableCapacityAfterHold: 8 },
    };
    mockReserveHold.mockResolvedValue(mockResult);

    const response = await POST(
      createRequest({
        slotId: validSlotId,
        guests: 2,
        specialRequests: "Window seat preferred",
      }),
      undefined,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as typeof mockResult;
    expect(body.booking.bookingReference).toBe("LV-A1B2-C3D4");
    expect(mockReserveHold).toHaveBeenCalledWith({
      slotId: validSlotId,
      userId: dummyPrincipal.userId,
      guests: 2,
      customerEmail: dummyPrincipal.email,
      customerPhone: undefined,
      specialRequests: "Window seat preferred",
    });
  });

  it("returns 401 Unauthenticated when session is missing or invalid", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");
    mockRequirePrincipal.mockRejectedValue(new UnauthenticatedError("Session expired."));

    const response = await POST(createRequest({ slotId: validSlotId, guests: 2 }), undefined);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 Forbidden when origin header fails CSRF check", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");
    mockAssertSameOrigin.mockRejectedValue(new ForbiddenError("Cross-origin request rejected."));

    const response = await POST(
      createRequest({ slotId: validSlotId, guests: 2 }, "https://malicious-site.com"),
      undefined,
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 Bad Request when JSON body is malformed", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    const response = await POST(createRequest("{ malformed json }"), undefined);
    expect(response.status).toBe(400);
  });

  it("returns 400 Bad Request when slotId is missing", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    const response = await POST(createRequest({ guests: 2 }), undefined);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 Bad Request when slotId is not a valid UUID", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    const response = await POST(createRequest({ slotId: "not-a-uuid", guests: 2 }), undefined);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 Bad Request when guests is zero or negative", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    const resZero = await POST(createRequest({ slotId: validSlotId, guests: 0 }), undefined);
    expect(resZero.status).toBe(400);

    const resNeg = await POST(createRequest({ slotId: validSlotId, guests: -1 }), undefined);
    expect(resNeg.status).toBe(400);
  });

  it("returns 400 Bad Request when guests is a decimal number", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    const response = await POST(createRequest({ slotId: validSlotId, guests: 2.5 }), undefined);
    expect(response.status).toBe(400);
  });

  it("enforces tenant/caller security by ignoring client attempts to inject user identity", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    mockReserveHold.mockResolvedValue({
      booking: { id: "b-2", userId: dummyPrincipal.userId },
      quote: {},
      slot: {},
    });

    // Client passes a spoofed userId
    await POST(
      createRequest({
        slotId: validSlotId,
        guests: 1,
        userId: "spoofed-attacker-user-id",
        customerEmail: "attacker@spoofed.com",
      }),
      undefined,
    );

    // Engine MUST receive authenticated principal values, never client-spoofed ones
    expect(mockReserveHold).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: dummyPrincipal.userId,
        customerEmail: dummyPrincipal.email,
      }),
    );
  });

  it("strips protected internal fields (status, reservedCount) from client payload", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");

    mockReserveHold.mockResolvedValue({
      booking: { id: "b-3" },
      quote: {},
      slot: {},
    });

    await POST(
      createRequest({
        slotId: validSlotId,
        guests: 1,
        status: "CONFIRMED",
        reservedCount: 99,
        heldUntil: "2099-01-01T00:00:00Z",
      }),
      undefined,
    );

    expect(mockReserveHold).toHaveBeenCalledWith({
      slotId: validSlotId,
      userId: dummyPrincipal.userId,
      guests: 1,
      customerEmail: dummyPrincipal.email,
      customerPhone: undefined,
      specialRequests: undefined,
    });
  });

  it("maps domain NotFoundError to 404 Not Found", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");
    mockReserveHold.mockRejectedValue(new NotFoundError("Experience slot not found."));

    const response = await POST(createRequest({ slotId: validSlotId, guests: 2 }), undefined);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps domain ConflictError (overbooking) to 409 Conflict", async () => {
    const { POST } = await import("@/app/api/v1/checkout/reserve/route");
    mockReserveHold.mockRejectedValue(
      new ConflictError("Requested 2 seat(s), but only 1 seat(s) remain available."),
    );

    const response = await POST(createRequest({ slotId: validSlotId, guests: 2 }), undefined);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });
});
