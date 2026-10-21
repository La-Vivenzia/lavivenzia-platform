import { env } from "@/lib/env";
import { jsonResponse, parseJsonBody, withRoute } from "@/lib/http";
import { assertSameOrigin } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getAvailabilityService } from "@/lib/container";
import { createSlotsSchema } from "../../../_schemas";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * GET /api/v1/host/experiences/:id/slots — the host's own availability (FR-08).
 *
 * Returns every slot, past included, because a host managing a calendar needs
 * to see what already ran. The traveller surface is a different route with a
 * different rule.
 */
export const GET = withRoute<RouteContext>(async (_request, { params }) => {
  const { id } = await params;
  const { principal, host } = await requireHostContext();

  const slots = await getAvailabilityService().listOwn(principal, host, id);

  return jsonResponse({ slots });
});

/**
 * POST /api/v1/host/experiences/:id/slots — add availability (FR-08).
 *
 * Takes a batch, because hosts add a week at a time rather than one slot at a
 * time, and because validating the batch against itself is the only way to
 * catch two submitted slots that overlap each other.
 *
 * The experience id comes from the path and the host from the session; neither
 * is read from the body, so a client cannot write slots onto a listing it does
 * not own.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id } = await params;
  const { principal, host } = await requireHostContext();
  const body = await parseJsonBody(request, createSlotsSchema);

  const slots = await getAvailabilityService().addSlots(
    principal,
    host,
    id,
    body.slots.map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt),
      capacity: slot.capacity,
      bookingCutoffMinutes: slot.bookingCutoffMinutes,
    })),
  );

  return jsonResponse({ slots }, 201);
});
