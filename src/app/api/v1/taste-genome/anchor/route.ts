import { env } from "@/lib/env";
import { assertSameOrigin, getRequestContext } from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { anchorRequestSchema } from "../_schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/taste-genome/anchor — begin sealing a guest genome to an account.
 *
 * Emails a six-digit code, creating a passwordless traveller account first if
 * the address has none. Nothing is written to any profile here: until the
 * code comes back, there is no proof the visitor owns the address, and a
 * profile anyone could write to by typing an email is not private.
 *
 * Always 202, for the reason the OTP request endpoint gives: any difference
 * between a new, existing or password account would enumerate them.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const body = await parseJsonBody(request, anchorRequestSchema);
  const context = await getRequestContext();

  await getAuthService().requestTravellerAccessOtp({ email: body.email, context });

  return jsonResponse({ status: "accepted" }, 202);
});
