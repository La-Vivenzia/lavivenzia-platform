import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext } from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";
import { otpRequestSchema } from "../../_schemas";

/** POST /api/v1/auth/otp/request — issue a traveller login code. */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const body = await parseJsonBody(request, otpRequestSchema);
  const context = await getRequestContext();

  await getAuthService().requestLoginOtp({ email: body.email, context });

  // Always 202, whether or not the address has an account. Any difference here
  // — status, body, or timing — turns this endpoint into a way to discover who
  // is registered.
  return jsonResponse({ status: "accepted" }, 202);
});
