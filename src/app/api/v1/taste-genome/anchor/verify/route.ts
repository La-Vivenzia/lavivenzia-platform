import { env } from "@/lib/env";
import {
  assertSameOrigin,
  buildSessionCookie,
  getRequestContext,
  withCookie,
} from "@/lib/auth-context";
import { getAuthService, getTasteGenomeService } from "@/lib/container";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import type { TasteGenome } from "@/modules/taste-genome/types";
import { readGuestPatronId } from "../../_identity";
import { anchorVerifySchema } from "../../_schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/taste-genome/anchor/verify — prove the mailbox, then anchor.
 *
 * The code is verified by the same service as a normal sign-in, so this
 * issues a real session. Only then is the genome written to the account, the
 * guest session folded into it, and the name filled in if the account had
 * none.
 *
 * The session is the part that cannot be repeated — the code is single-use —
 * so it is set even if the genome write fails. The response says
 * `anchored: false`, and the patron, now signed in, can save again through
 * `/calibrate`, which writes to their account.
 */
export const POST = withRoute(async (request) => {
  await assertSameOrigin(env.APP_URL);

  const body = await parseJsonBody(request, anchorVerifySchema);
  const context = await getRequestContext();

  const session = await getAuthService().verifyLoginOtp({
    email: body.email,
    code: body.code,
    context,
  });

  let genome: TasteGenome | null = null;
  try {
    genome = await getTasteGenomeService().anchor({
      userId: session.userId,
      guestPatronId: readGuestPatronId(request),
      answers: body.answers,
      fullName: body.name,
    });
  } catch (error) {
    getLogger().warn(
      { reason: error instanceof Error ? error.message : "unknown error" },
      "taste genome could not be anchored after sign-in",
    );
  }

  const response = jsonResponse({
    anchored: genome !== null,
    genome,
    mfaRequired: session.mfaRequired,
    expiresAt: session.expiresAt.toISOString(),
  });
  return withCookie(response, buildSessionCookie(session.token, session.lifetime));
});
