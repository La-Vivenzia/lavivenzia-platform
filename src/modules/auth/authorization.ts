import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { MFA_REQUIRED_ROLES, STEP_UP_PERMISSIONS, type RoleKey } from "@/modules/auth/permissions";

/**
 * Authorization decisions.
 *
 * Deliberately pure: no database, no HTTP, no clock beyond what is passed in.
 * Enforcement happens at the *service* layer rather than only at route
 * handlers, so that worker jobs and internal callers are governed by the same
 * rules — route-only checks are how privilege escalation bugs happen.
 */

export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly RoleKey[];
  /** Flattened permission keys from every role the user holds. */
  readonly permissions: ReadonlySet<string>;
  /** Whether this session has satisfied a TOTP challenge. */
  readonly mfaSatisfied: boolean;
  /** When the session last re-authenticated, for step-up decisions. */
  readonly lastAuthenticatedAt: Date;
}

/** Window within which a prior authentication still counts for a step-up action. */
export const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000;

export function hasPermission(principal: Principal, permission: string): boolean {
  return principal.permissions.has(permission);
}

export function requiresMfa(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => MFA_REQUIRED_ROLES.has(role));
}

export function requiresStepUp(permission: string): boolean {
  return STEP_UP_PERMISSIONS.has(permission);
}

/**
 * Assert that `principal` may perform `permission`, throwing otherwise.
 *
 * Three gates, in order of decreasing generality:
 *   1. a role that requires MFA must be on an MFA-satisfied session;
 *   2. the permission must be held;
 *   3. step-up actions need a recent authentication.
 *
 * Order matters: an unsatisfied MFA session is rejected before we disclose
 * anything about which permissions exist.
 */
export function authorize(principal: Principal, permission: string, now: Date = new Date()): void {
  if (requiresMfa(principal.roles) && !principal.mfaSatisfied) {
    throw new UnauthenticatedError("Multi-factor authentication required", { permission });
  }

  if (!hasPermission(principal, permission)) {
    throw new ForbiddenError("Insufficient permissions", { permission });
  }

  if (requiresStepUp(permission)) {
    const age = now.getTime() - principal.lastAuthenticatedAt.getTime();
    if (age > STEP_UP_MAX_AGE_MS) {
      throw new UnauthenticatedError("Re-authentication required for this action", { permission });
    }
  }
}
