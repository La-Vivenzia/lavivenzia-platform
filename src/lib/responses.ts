import { NextResponse } from "next/server";

/**
 * Response construction.
 *
 * Deliberately separate from `@/lib/http`, which pulls in the logger and
 * therefore the environment parser. Keeping this pure means it can be unit
 * tested with no environment at all — the same property that keeps the domain
 * suite infrastructure-free.
 */

/**
 * Build a JSON response.
 *
 * 204 and 304 are handled separately: they are defined to carry no body, and
 * `NextResponse.json` throws `Invalid response status code 204` when asked to
 * serialise one. Centralising it here means no future endpoint can rediscover
 * the 500 this caused on logout.
 */
export function jsonResponse<T>(body: T, status = 200): NextResponse {
  if (status === 204 || status === 304) {
    return new NextResponse(null, { status });
  }
  return NextResponse.json(body, { status });
}
