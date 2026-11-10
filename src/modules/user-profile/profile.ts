import { ValidationError } from "@/lib/errors";

/**
 * Profile rules shared by the server and the settings screen.
 *
 * Kept free of the password module (a native addon) and of the service, so the
 * client can import the option lists and limits it renders without dragging
 * argon2 into the browser bundle — the same split `auth/password-policy.ts`
 * makes.
 */

export const PROFILE_LIMITS = {
  fullName: 120,
  phone: 20,
  bio: 600,
  avatarUrl: 2048,
} as const;

/*
 * Taste options. Keys are what is stored; labels are what is shown. A key is
 * never renamed once shipped, because stored preferences would silently stop
 * matching it — add a new key and retire the old one instead.
 */

export const DIETARY_OPTIONS = [
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "jain", label: "Jain" },
  { value: "halal", label: "Halal" },
  { value: "none", label: "None" },
] as const;

export const VIBE_OPTIONS = [
  { value: "sunset_retreats", label: "Sunset retreats" },
  { value: "culinary_tastings", label: "Culinary tastings" },
  { value: "craft_breweries", label: "Craft breweries" },
  { value: "adventure", label: "Adventure" },
] as const;

export const CLUSTER_OPTIONS = [
  { value: "kalyani_nagar", label: "Kalyani Nagar" },
  { value: "viman_nagar", label: "Viman Nagar" },
  { value: "hadapsar", label: "Hadapsar" },
  { value: "amanora", label: "Amanora" },
] as const;

export type DietaryKey = (typeof DIETARY_OPTIONS)[number]["value"];
export type VibeKey = (typeof VIBE_OPTIONS)[number]["value"];
export type ClusterKey = (typeof CLUSTER_OPTIONS)[number]["value"];

export interface TravelPreferences {
  readonly dietary: readonly DietaryKey[];
  readonly vibes: readonly VibeKey[];
  readonly clusters: readonly ClusterKey[];
}

export const EMPTY_PREFERENCES: TravelPreferences = { dietary: [], vibes: [], clusters: [] };

/** Keep known keys only, once each, in the order the options are listed. */
function pick<T extends string>(options: readonly { value: T }[], raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  const chosen = new Set(raw.filter((item): item is string => typeof item === "string"));
  return options.map((option) => option.value).filter((value) => chosen.has(value));
}

/**
 * Canonical preferences from anything.
 *
 * Used on the way in and on the way out. Reading a stored value through the
 * same filter means a retired key, or a row written before a rule existed,
 * degrades to "not chosen" instead of reaching the screen as an unknown tag.
 *
 * "None" for dietary means "no restriction", so it cannot sit beside one. A
 * restriction wins: dropping it would be the unsafe reading for a kitchen.
 */
export function normalizePreferences(raw: unknown): TravelPreferences {
  const source = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const dietary = pick(DIETARY_OPTIONS, source.dietary);
  const restrictions = dietary.filter((value) => value !== "none");

  return {
    dietary: restrictions.length > 0 ? restrictions : dietary,
    vibes: pick(VIBE_OPTIONS, source.vibes),
    clusters: pick(CLUSTER_OPTIONS, source.clusters),
  };
}

/** An empty field means "cleared", which is stored as null. */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Digits, spaces, dashes and brackets, optional leading +, 7–15 digits (E.164). */
export function isPlausiblePhone(phone: string): boolean {
  if (!/^\+?[0-9][0-9\s\-()]*$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

/**
 * https only. An `http:` avatar is mixed content on every page that shows it,
 * and `javascript:` or `data:` in an `src` is a door left open.
 */
export function isAllowedAvatarUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export interface ProfileFieldChanges {
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  preferences?: TravelPreferences;
}

/**
 * Trim, null out blanks and enforce every field rule.
 *
 * The HTTP schema checks shape and length too, but this is the authoritative
 * check: the service may be called by something other than the route.
 * Only fields present in the input appear in the result, so a PATCH that
 * omits a field leaves it alone rather than clearing it.
 */
export function normalizeProfileChanges(input: {
  readonly fullName?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly avatarUrl?: string | null | undefined;
  readonly bio?: string | null | undefined;
  readonly preferences?: unknown;
}): ProfileFieldChanges {
  const changes: ProfileFieldChanges = {};

  const text = (
    field: "fullName" | "phone" | "avatarUrl" | "bio",
    label: string,
  ): string | null | undefined => {
    if (input[field] === undefined) return undefined;
    const value = blankToNull(input[field]);
    if (value !== null && value.length > PROFILE_LIMITS[field]) {
      throw new ValidationError(`${label} must be at most ${PROFILE_LIMITS[field]} characters.`, {
        field,
      });
    }
    return value;
  };

  const fullName = text("fullName", "Name");
  if (fullName !== undefined) changes.fullName = fullName;

  const phone = text("phone", "Phone number");
  if (phone !== undefined) {
    if (phone !== null && !isPlausiblePhone(phone)) {
      throw new ValidationError("Enter a phone number with 7 to 15 digits.", { field: "phone" });
    }
    changes.phone = phone;
  }

  const avatarUrl = text("avatarUrl", "Avatar URL");
  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && !isAllowedAvatarUrl(avatarUrl)) {
      throw new ValidationError("Avatar URL must be an https:// address.", { field: "avatarUrl" });
    }
    changes.avatarUrl = avatarUrl;
  }

  const bio = text("bio", "Bio");
  if (bio !== undefined) changes.bio = bio;

  if (input.preferences !== undefined)
    changes.preferences = normalizePreferences(input.preferences);

  return changes;
}

/**
 * A readable name for a browser session, from its user agent.
 *
 * Deliberately coarse — browser and platform, no versions. It exists so a
 * traveller can tell "my phone" from "a laptop I don't recognise", not to
 * fingerprint anyone.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;

  const platform = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? "Unknown device";
}
