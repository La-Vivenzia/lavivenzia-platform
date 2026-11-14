import { CALIBRATED_STORAGE_KEY } from "@/modules/taste-genome/types";

/**
 * Remembers that the Taste Genome modal has been answered or dismissed.
 *
 * Written to three places because each fails differently: localStorage is
 * cleared by some privacy tools, sessionStorage only lasts the tab, and a
 * cookie survives both but not a cookie wipe. The modal is shown only when
 * all three are silent — any one of them is enough to keep it away.
 *
 * Plain module, no `"use client"`: the browser APIs are passed in so the rules
 * can be tested in Node.
 */

export const DISMISSED_SESSION_KEY = "lv_onboarding_dismissed";

/** One year, in seconds. */
const COOKIE_MAX_AGE = 31_536_000;

export type CalibrationOutcome = "calibrated" | "skipped";

export interface CalibrationStores {
  readonly local?: Pick<Storage, "getItem" | "setItem"> | undefined;
  readonly session?: Pick<Storage, "getItem" | "setItem"> | undefined;
  /** Read and write access to `document.cookie`. */
  readonly cookie?: { get(): string; set(value: string): void } | undefined;
}

/** The modal only ever opens itself on the home page — never over a deep link. */
export function isOnboardingPath(pathname: string | null | undefined): boolean {
  return pathname === "/";
}

function attempt(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    // Private browsing, a full quota or a blocked cookie jar: the others still count.
    return false;
  }
}

export function rememberCalibration(stores: CalibrationStores, value: CalibrationOutcome): void {
  attempt(() => stores.local?.setItem(CALIBRATED_STORAGE_KEY, value));
  attempt(() => stores.session?.setItem(DISMISSED_SESSION_KEY, "1"));
  attempt(() =>
    stores.cookie?.set(
      `${CALIBRATED_STORAGE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`,
    ),
  );
}

function cookieHas(cookies: string, name: string): boolean {
  return cookies.split(";").some((pair) => {
    const [key, raw] = pair.trim().split("=");
    return key === name && (raw ?? "").length > 0;
  });
}

/**
 * True when any store says the modal was answered or dismissed.
 *
 * When nothing can be read at all, also true: without storage a skip cannot be
 * remembered, and asking on every visit is worse than not asking.
 */
export function hasCalibrated(stores: CalibrationStores): boolean {
  let readable = false;
  const read = (check: () => boolean): boolean => {
    try {
      const result = check();
      readable = true;
      return result;
    } catch {
      return false;
    }
  };

  if (stores.local && read(() => stores.local!.getItem(CALIBRATED_STORAGE_KEY) !== null)) {
    return true;
  }
  if (stores.session && read(() => stores.session!.getItem(DISMISSED_SESSION_KEY) !== null)) {
    return true;
  }
  if (stores.cookie && read(() => cookieHas(stores.cookie!.get(), CALIBRATED_STORAGE_KEY))) {
    return true;
  }
  return !readable;
}

/** The real browser stores. Each accessor can itself throw, so each is guarded. */
export function browserStores(): CalibrationStores {
  const safely = <T>(get: () => T): T | undefined => {
    try {
      return get();
    } catch {
      return undefined;
    }
  };
  return {
    local: safely(() => window.localStorage),
    session: safely(() => window.sessionStorage),
    cookie: {
      get: () => document.cookie,
      set: (value) => {
        document.cookie = value;
      },
    },
  };
}
