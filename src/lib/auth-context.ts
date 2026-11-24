import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { setLogUser } from "@/lib/logger";
import { isProduction } from "@/lib/env";
import { getAuthService } from "@/lib/container";
import { authorize, type Principal } from "@/modules/auth/authorization";
import type { SessionLifetime } from "@/modules/auth/session";
import type { RequestContext } from "@/modules/auth/service";

/**
 * HTTP-side authentication plumbing: cookies, request context, and turning a
 * request into a Principal.
 *
 * Kept out of `src/modules` because all of it is Next.js-specific. The domain
 * receives a token and returns a Principal; everything about *how* the token
 * travels lives here.
 */

/**
 * The `__Host-` prefix is a browser-enforced guarantee: a cookie carrying it is
 * rejected unless it is Secure, Path=/, and has no Domain attribute. That last
 * part is what matters — it prevents a compromised sibling subdomain from
 * writing a session cookie into our origin (session fixation).
 *
 * The prefix requires Secure, which requires https, so development over http
 * falls back to an unprefixed name.
 */
export const SESSION_COOKIE = isProduction ? "__Host-lv_session" : "lv_session";

export function buildSessionCookie(token: string, lifetime: SessionLifetime) {
  return {
    name: SESSION_COOKIE,
    value: token,
    // httpOnly: script cannot read it, so an XSS bug cannot exfiltrate sessions.
    httpOnly: true,
    // Secure in production; cannot be set over http, which is why the cookie
    // name is unprefixed locally.
    secure: isProduction,
    // Lax, not Strict: Strict would drop the cookie when a user arrives from an
    // email link, logging them out on every inbound click. Lax still blocks the
    // cross-site POSTs that CSRF depends on.
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(lifetime.absoluteMs / 1000),
  };
}

/** Expire the cookie. Attributes must match the original or browsers ignore it. */
export function buildClearedSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

/**
 * Client IP, taken from the first entry of `x-forwarded-for`.
 *
 * Trusted only because the ALB rewrites this header at the edge. Exposing the
 * app directly would make this attacker-controlled, and it is used for rate
 * limiting — so the network boundary is load-bearing, not incidental.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");

  return {
    ipAddress: forwarded?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
    correlationId: headerList.get("x-correlation-id"),
  };
}

/** Resolve the current principal, or null when anonymous. */
export async function getPrincipal(): Promise<Principal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const principal = await getAuthService().resolvePrincipal(token);
    // Attribute every subsequent log line in this request to the user.
    if (principal) setLogUser(principal.userId);

    return principal;
  } catch {
    // If database connection pool is full or token is invalid, degrade gracefully to guest
    return null;
  }
}

/** Resolve the principal, or reject the request. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new UnauthenticatedError();
  return principal;
}

/**
 * Require a specific permission.
 *
 * Delegates to the pure `authorize`, which enforces the MFA gate, the
 * permission check and step-up freshness in that order. Route handlers call
 * this; services call `authorize` directly, so worker jobs and internal callers
 * are governed by the same rules.
 */
export async function requirePermission(permission: string): Promise<Principal> {
  const principal = await requirePrincipal();
  authorize(principal, permission);
  return principal;
}

const ALLOWED_ORIGIN_HOSTS = new Set([
  "lavivenzia.com",
  "www.lavivenzia.com",
  "host.lavivenzia.com",
  "localhost",
  "127.0.0.1",
]);

export function isAllowedOrigin(originStr: string, appUrl: string): boolean {
  try {
    const originUrl = new URL(originStr);
    const configuredUrl = new URL(appUrl);

    // Exact match with configured APP_URL
    if (originUrl.origin === configuredUrl.origin) return true;

    // Allowed official hostnames or subdomains
    if (ALLOWED_ORIGIN_HOSTS.has(originUrl.hostname)) return true;
    if (originUrl.hostname.endsWith(".lavivenzia.com")) return true;
    if (originUrl.hostname.endsWith(".up.railway.app")) return true;
    if (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1") return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Reject cross-site state-changing requests.
 *
 * SameSite=Lax already blocks cross-site POSTs in every browser we support, so
 * this is defence in depth rather than the primary control — it covers older
 * clients and any future endpoint that relaxes SameSite.
 *
 * Compares Origin against the configured app URL and recognized platform origins
 * (lavivenzia.com, www.lavivenzia.com, host.lavivenzia.com, railway preview domains).
 * Requests with no Origin are allowed: non-browser clients legitimately omit it.
 */
export async function assertSameOrigin(appUrl: string): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (!origin) return;

  if (!isAllowedOrigin(origin, appUrl)) {
    throw new ForbiddenError("Cross-origin request rejected.");
  }
}

/** Attach a Set-Cookie to a response built by a route handler. */
export function withCookie(
  response: NextResponse,
  cookie: ReturnType<typeof buildSessionCookie>,
): NextResponse {
  response.cookies.set(cookie);
  return response;
}
