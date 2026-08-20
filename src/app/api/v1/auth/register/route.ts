import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin, getRequestContext } from "@/lib/auth-context";
import { getAuthService } from "@/lib/container";
import { registerSchema } from "../_schemas";

/** POST /api/v1/auth/register — traveller (passwordless) or host (password). */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const body = await parseJsonBody(request, registerSchema);
  const context = await getRequestContext();

  const { userId } = await getAuthService().register({
    email: body.email,
    password: body.password,
    role: body.role,
    context,
  });

  // 201 with the id only. No session is issued: a traveller must still prove
  // control of the address by completing an emailed code, and a host must log
  // in. Auto-signing-in here would make registration a way to occupy an
  // account without ever demonstrating ownership of the mailbox.
  return jsonResponse({ userId }, 201);
});
