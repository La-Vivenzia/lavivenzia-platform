import type { RoleKey } from "@/modules/auth/permissions";

/**
 * Where a signed-in person belongs.
 *
 * One place, because sign-in, the MFA challenge and the landing page all need
 * the same answer, and three copies of it would drift into three different
 * ideas of where an operations user lands.
 *
 * Order matters: a person may hold several roles, and the most privileged
 * console wins. Someone who is both an operator and a host is here to operate.
 */
const OPERATIONS_ROLES: readonly RoleKey[] = [
  "super_admin",
  "operations",
  "content_admin",
  "finance",
];

export function destinationForRoles(roles: readonly RoleKey[]): string {
  if (roles.some((role) => OPERATIONS_ROLES.includes(role))) return "/ops";
  // Hosts and patrons land on their patron profile in the main app
  return "/profile";
}

/**
 * A `?next=` value that is safe to send someone to after sign-in, or null.
 *
 * Same-origin paths only. `//evil.example` and `/\evil.example` are
 * protocol-relative to a browser, so a bare "starts with /" check is an open
 * redirect. Backslashes (browsers read them as `/`) and control characters
 * (stripped before parsing) are refused anywhere in the value.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  return raw;
}

/** The sign-in URL that returns here afterwards. */
export function signInHref(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/** The current page, path and query, for `signInHref` — browser only. */
export function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}
