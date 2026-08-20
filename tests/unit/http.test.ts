import { describe, expect, it } from "vitest";
import { jsonResponse } from "@/lib/responses";

/**
 * Regression cover for a real 500 on the logout endpoint.
 *
 * 204 and 304 are defined to carry no body, and `NextResponse.json` throws
 * "Invalid response status code 204" rather than returning an empty response.
 * Logout returned 500 while still revoking the session — the worst kind of bug,
 * because the side effect succeeded and the caller was told it failed.
 */
describe("jsonResponse", () => {
  it("returns a bodyless response for 204", async () => {
    const response = jsonResponse(null, 204);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("returns a bodyless response for 304", async () => {
    expect(jsonResponse(null, 304).status).toBe(304);
  });

  it("still serialises JSON for ordinary statuses", async () => {
    const response = jsonResponse({ ok: true }, 200);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("serialises JSON for error statuses", async () => {
    const response = jsonResponse({ error: "nope" }, 400);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "nope" });
  });
});
