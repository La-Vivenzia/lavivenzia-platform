import type { RoleKey } from "@/modules/auth/permissions";
import type { TravelPreferences } from "@/modules/user-profile/profile";

/**
 * Account-settings contracts.
 *
 * Dates are ISO strings rather than `Date`: these shapes cross the wire to the
 * settings screen both as server-component props and as API JSON, and one
 * representation for both is what stops the screen handling two.
 */

export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly preferences: TravelPreferences;
  readonly roles: readonly RoleKey[];
  readonly emailVerifiedAt: string | null;
  readonly mfaEnabled: boolean;
  /**
   * Travellers sign in with an emailed code and hold no password. The screen
   * needs to know, so it does not offer to change something that does not exist.
   */
  readonly hasPassword: boolean;
  readonly createdAt: string;
}

/** Partial by design: an omitted field is left alone, `null` clears it. */
export interface UpdateProfileInput {
  readonly fullName?: string | null;
  readonly phone?: string | null;
  readonly avatarUrl?: string | null;
  readonly bio?: string | null;
  readonly preferences?: TravelPreferences;
}

export interface ChangePasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface UserSessionItem {
  readonly id: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly isCurrent: boolean;
  readonly userAgent: string | null;
  /** Coarse "Chrome on Windows" label derived from the user agent. */
  readonly device: string;
  readonly ip: string | null;
}
