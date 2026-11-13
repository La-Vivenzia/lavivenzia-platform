import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

import { getPrincipal } from "@/lib/auth-context";
import { isProduction } from "@/lib/env";
import { getLogger } from "@/lib/logger";

/**
 * Who a Taste Genome belongs to.
 *
 * A signed-in patron is keyed by user id, so the genome follows them across
 * devices. Anyone else gets an opaque guest id in an httpOnly cookie — browsing
 * is public, and personalisation should work before an account exists.
 */

export const GUEST_COOKIE = isProduction ? "__Host-lv_guest" : "lv_guest";

const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PatronIdentity {
  readonly patronId: string;
  /** A guest id minted for this request; the response must set it. */
  readonly newGuestId: string | null;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Resolve the patron. A failing session lookup degrades to guest rather than
 * failing the request: personalisation is never a dependency.
 */
export async function resolvePatron(request: Request): Promise<PatronIdentity> {
  try {
    const principal = await getPrincipal();
    if (principal) return { patronId: `user:${principal.userId}`, newGuestId: null };
  } catch (error) {
    getLogger().warn(
      { reason: error instanceof Error ? error.message : "unknown error" },
      "taste genome could not resolve session; treating as guest",
    );
  }

  // Only a well-formed id is honoured, so the cookie cannot inject arbitrary keys.
  const existing = readCookie(request, GUEST_COOKIE);
  if (existing && UUID.test(existing)) return { patronId: `guest:${existing}`, newGuestId: null };

  const minted = randomUUID();
  return { patronId: `guest:${minted}`, newGuestId: minted };
}

export function withGuestCookie(response: NextResponse, identity: PatronIdentity): NextResponse {
  if (identity.newGuestId) {
    response.cookies.set({
      name: GUEST_COOKIE,
      value: identity.newGuestId,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_MAX_AGE_SECONDS,
    });
  }
  return response;
}
