/**
 * Permission and role vocabulary.
 *
 * Permissions are declared here as the canonical list and seeded into the
 * database as rows (`prisma/seed.ts`). Code checks a permission key; operations
 * grants and revokes it by editing role assignments, without a deploy.
 *
 * ── ASSUMPTION, pending founder confirmation ──────────────────────────────
 * The role-to-permission mapping below is a working default derived from the
 * launch scope in PROJECT.md §4 and the actors in REQUIREMENTS.md §2. It has
 * not been confirmed by the founder. See docs/ASSUMPTIONS.md → A-001.
 *
 * It is deliberately cheap to change: permissions are data, the seed is
 * idempotent, and revising the mapping means re-running the seed rather than
 * writing a migration.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** The six actors defined in REQUIREMENTS.md §2. */
export const ROLE_KEYS = [
  "traveller",
  "host",
  "operations",
  "content_admin",
  "finance",
  "super_admin",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Every permission in the system.
 *
 * Naming is `resource:action` with an optional `:scope` suffix. `:own` means the
 * actor's own records only — the scope is part of the key rather than a runtime
 * flag so that a missing scope check is a missing permission, not a silent
 * widening.
 */
export const PERMISSIONS = {
  // Traveller — self-service
  BOOKING_READ_OWN: "booking:read:own",
  BOOKING_CREATE: "booking:create",
  BOOKING_CANCEL_OWN: "booking:cancel:own",
  WISHLIST_MANAGE_OWN: "wishlist:manage:own",
  ITINERARY_MANAGE_OWN: "itinerary:manage:own",
  REVIEW_CREATE_OWN: "review:create:own",
  PROFILE_MANAGE_OWN: "profile:manage:own",

  // Host — own business profile, inventory and bookings
  HOST_PROFILE_MANAGE_OWN: "host:manage:own",
  EXPERIENCE_READ_OWN: "experience:read:own",
  EXPERIENCE_CREATE: "experience:create",
  EXPERIENCE_UPDATE_OWN: "experience:update:own",
  EXPERIENCE_SUBMIT: "experience:submit",
  AVAILABILITY_MANAGE_OWN: "availability:manage:own",
  BOOKING_READ_HOST: "booking:read:host",
  GUEST_READ_HOST: "guest:read:host",
  PAYOUT_READ_OWN: "payout:read:own",
  REVIEW_RESPOND_OWN: "review:respond:own",

  // Operations — verification, approval, oversight
  USER_READ: "user:read",
  USER_SUSPEND: "user:suspend",
  HOST_READ: "host:read",
  HOST_VERIFY: "host:verify",
  EXPERIENCE_READ_ALL: "experience:read:all",
  EXPERIENCE_APPROVE: "experience:approve",
  EXPERIENCE_SUSPEND: "experience:suspend",
  BOOKING_READ_ALL: "booking:read:all",
  DISPUTE_MANAGE: "dispute:manage",

  // Content / admin — editorial surface
  CONTENT_MODERATE: "content:moderate",
  DESTINATION_MANAGE: "destination:manage",
  COLLECTION_MANAGE: "collection:manage",

  // Finance — money
  PAYMENT_READ_ALL: "payment:read:all",
  REFUND_ISSUE: "refund:issue",
  COMMISSION_CONFIGURE: "commission:configure",
  PAYOUT_APPROVE: "payout:approve",
  INVOICE_READ_ALL: "invoice:read:all",
  LEDGER_READ: "ledger:read",

  // Super admin — platform control
  ROLE_GRANT: "role:grant",
  ROLE_REVOKE: "role:revoke",
  USER_EXPORT_PII: "user:export_pii",
  CONFIG_MANAGE: "config:manage",
  AUDIT_READ: "audit:read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Human-readable descriptions, seeded alongside the keys so the admin console
 * can render a grant screen without a second source of truth.
 */
export const PERMISSION_DESCRIPTIONS: Readonly<Record<PermissionKey, string>> = {
  "booking:read:own": "View own bookings",
  "booking:create": "Create a booking",
  "booking:cancel:own": "Cancel own booking",
  "wishlist:manage:own": "Manage own wishlist",
  "itinerary:manage:own": "Create and edit own itineraries",
  "review:create:own": "Leave a review for a completed booking",
  "profile:manage:own": "Manage own profile and preferences",

  "host:manage:own": "Create and edit own host business profile",
  "experience:read:own": "View own experience listings",
  "experience:create": "Create a new experience listing",
  "experience:update:own": "Edit own experience listings",
  "experience:submit": "Submit an experience for approval",
  "availability:manage:own": "Manage availability and slots for own listings",
  "booking:read:host": "View bookings against own listings",
  "guest:read:host": "View guest details for own bookings",
  "payout:read:own": "View own payout statements",
  "review:respond:own": "Respond to reviews on own listings",

  "user:read": "View user accounts",
  "user:suspend": "Suspend or reinstate a user account",
  "host:read": "View host accounts and verification status",
  "host:verify": "Approve or reject host verification",
  "experience:read:all": "View all experience listings",
  "experience:approve": "Approve or reject an experience listing",
  "experience:suspend": "Suspend a published listing",
  "booking:read:all": "View all bookings",
  "dispute:manage": "Manage booking disputes",

  "content:moderate": "Moderate user-generated content and reviews",
  "destination:manage": "Manage destinations and destination content",
  "collection:manage": "Manage curated collections",

  "payment:read:all": "View all payment records",
  "refund:issue": "Issue a refund",
  "commission:configure": "Configure commission rules",
  "payout:approve": "Approve a host payout",
  "invoice:read:all": "View all invoices",
  "ledger:read": "Read the financial ledger",

  "role:grant": "Grant a role to a user",
  "role:revoke": "Revoke a role from a user",
  "user:export_pii": "Export personal data for a user",
  "config:manage": "Change platform configuration",
  "audit:read": "Read audit logs",
};

export interface RoleDefinition {
  readonly key: RoleKey;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionKey[];
}

const TRAVELLER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.BOOKING_READ_OWN,
  PERMISSIONS.BOOKING_CREATE,
  PERMISSIONS.BOOKING_CANCEL_OWN,
  PERMISSIONS.WISHLIST_MANAGE_OWN,
  PERMISSIONS.ITINERARY_MANAGE_OWN,
  PERMISSIONS.REVIEW_CREATE_OWN,
  PERMISSIONS.PROFILE_MANAGE_OWN,
];

/**
 * Role definitions.
 *
 * A host also holds traveller permissions: hosts book experiences too, and
 * modelling that as one role with a superset avoids every "does this user have
 * a traveller account as well" branch downstream.
 *
 * `super_admin` is defined as every permission, computed rather than listed, so
 * a new permission cannot be accidentally omitted from it.
 */
export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    key: "traveller",
    name: "Traveller",
    description: "Discovers, books and reviews experiences.",
    permissions: TRAVELLER_PERMISSIONS,
  },
  {
    key: "host",
    name: "Host",
    description: "Lists and operates experiences. Also holds traveller permissions.",
    permissions: [
      ...TRAVELLER_PERMISSIONS,
      PERMISSIONS.HOST_PROFILE_MANAGE_OWN,
      PERMISSIONS.EXPERIENCE_READ_OWN,
      PERMISSIONS.EXPERIENCE_CREATE,
      PERMISSIONS.EXPERIENCE_UPDATE_OWN,
      PERMISSIONS.EXPERIENCE_SUBMIT,
      PERMISSIONS.AVAILABILITY_MANAGE_OWN,
      PERMISSIONS.BOOKING_READ_HOST,
      PERMISSIONS.GUEST_READ_HOST,
      PERMISSIONS.PAYOUT_READ_OWN,
      PERMISSIONS.REVIEW_RESPOND_OWN,
    ],
  },
  {
    key: "operations",
    name: "Operations",
    description: "Verifies hosts, approves listings and oversees bookings.",
    permissions: [
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_SUSPEND,
      PERMISSIONS.HOST_READ,
      PERMISSIONS.HOST_VERIFY,
      PERMISSIONS.EXPERIENCE_READ_ALL,
      PERMISSIONS.EXPERIENCE_APPROVE,
      PERMISSIONS.EXPERIENCE_SUSPEND,
      PERMISSIONS.BOOKING_READ_ALL,
      PERMISSIONS.DISPUTE_MANAGE,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  {
    key: "content_admin",
    name: "Content Admin",
    description: "Curates destinations, collections and moderates content.",
    permissions: [
      PERMISSIONS.EXPERIENCE_READ_ALL,
      PERMISSIONS.CONTENT_MODERATE,
      PERMISSIONS.DESTINATION_MANAGE,
      PERMISSIONS.COLLECTION_MANAGE,
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Handles payments, refunds, commissions and payouts.",
    permissions: [
      PERMISSIONS.BOOKING_READ_ALL,
      PERMISSIONS.PAYMENT_READ_ALL,
      PERMISSIONS.REFUND_ISSUE,
      PERMISSIONS.COMMISSION_CONFIGURE,
      PERMISSIONS.PAYOUT_APPROVE,
      PERMISSIONS.INVOICE_READ_ALL,
      PERMISSIONS.LEDGER_READ,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full platform control. Grant sparingly.",
    permissions: ALL_PERMISSIONS,
  },
];

/**
 * Roles that handle money, personal data, or platform configuration. These
 * require TOTP enrolment and a session that has satisfied MFA (ADR-0005).
 */
export const MFA_REQUIRED_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>([
  "operations",
  "content_admin",
  "finance",
  "super_admin",
]);

/**
 * Actions that must additionally re-authenticate at the moment of use, even
 * inside an MFA-satisfied session: everything that moves money or changes who
 * can do what (ADR-0005).
 */
export const STEP_UP_PERMISSIONS: ReadonlySet<string> = new Set<string>([
  PERMISSIONS.ROLE_GRANT,
  PERMISSIONS.ROLE_REVOKE,
  PERMISSIONS.USER_EXPORT_PII,
  PERMISSIONS.REFUND_ISSUE,
  PERMISSIONS.COMMISSION_CONFIGURE,
  PERMISSIONS.PAYOUT_APPROVE,
  PERMISSIONS.CONFIG_MANAGE,
]);

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}

export function getRoleDefinition(key: RoleKey): RoleDefinition {
  const definition = ROLE_DEFINITIONS.find((role) => role.key === key);
  if (!definition) {
    // Unreachable while ROLE_DEFINITIONS covers ROLE_KEYS, which is asserted by
    // a test rather than left to review.
    throw new Error(`No role definition for '${key}'`);
  }
  return definition;
}
