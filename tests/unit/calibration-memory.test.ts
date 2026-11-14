import { describe, expect, it } from "vitest";

import {
  DISMISSED_SESSION_KEY,
  hasCalibrated,
  isOnboardingPath,
  rememberCalibration,
  type CalibrationStores,
} from "@/components/onboarding/calibration-memory";
import { CALIBRATED_STORAGE_KEY } from "@/modules/taste-genome/types";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

function memoryCookie() {
  let jar = "";
  return {
    get: () => jar,
    set: (value: string) => {
      const pair = value.split(";")[0]!;
      jar = jar ? `${jar}; ${pair}` : pair;
    },
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("calibration memory", () => {
  it("a fresh browser has not calibrated", () => {
    const stores = { local: memoryStorage(), session: memoryStorage(), cookie: memoryCookie() };
    expect(hasCalibrated(stores)).toBe(false);
  });

  it("remembering writes localStorage, sessionStorage and a one-year cookie", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const writes: string[] = [];
    rememberCalibration(
      { local, session, cookie: { get: () => "", set: (value) => void writes.push(value) } },
      "calibrated",
    );
    expect(local.map.get(CALIBRATED_STORAGE_KEY)).toBe("calibrated");
    expect(session.map.get(DISMISSED_SESSION_KEY)).toBe("1");
    expect(writes).toEqual([
      `${CALIBRATED_STORAGE_KEY}=calibrated; path=/; max-age=31536000; SameSite=Lax`,
    ]);
  });

  it.each<[string, (stores: ReturnType<typeof fresh>) => void]>([
    ["localStorage", (s) => s.local.setItem(CALIBRATED_STORAGE_KEY, "skipped")],
    ["sessionStorage", (s) => s.session.setItem(DISMISSED_SESSION_KEY, "1")],
    ["the cookie", (s) => s.cookie.set(`${CALIBRATED_STORAGE_KEY}=calibrated; path=/`)],
  ])("any one store is enough: %s", (_, mark) => {
    const stores = fresh();
    mark(stores);
    expect(hasCalibrated(stores)).toBe(true);
  });

  it("a remembered skip survives localStorage being cleared", () => {
    const stores = fresh();
    rememberCalibration(stores, "skipped");
    expect(hasCalibrated({ ...stores, local: memoryStorage() })).toBe(true);
  });

  it("does not match a cookie that merely shares a prefix", () => {
    const stores = fresh();
    stores.cookie.set(`${CALIBRATED_STORAGE_KEY}_old=calibrated`);
    expect(hasCalibrated(stores)).toBe(false);
  });

  it("a blocked store neither throws nor stops the others", () => {
    const session = memoryStorage();
    const stores: CalibrationStores = { local: throwing, session, cookie: memoryCookie() };
    expect(() => rememberCalibration(stores, "skipped")).not.toThrow();
    expect(hasCalibrated(stores)).toBe(true);
  });

  it("treats wholly unreadable storage as calibrated rather than nagging", () => {
    const cookie = {
      get: () => {
        throw new Error("blocked");
      },
      set: () => undefined,
    };
    expect(hasCalibrated({ local: throwing, session: throwing, cookie })).toBe(true);
  });

  it("opens only on the home page", () => {
    expect(isOnboardingPath("/")).toBe(true);
    for (const path of [
      "/journeys/abc",
      "/experiences/sunset-dinner",
      "/profile",
      "/account",
      null,
    ]) {
      expect(isOnboardingPath(path)).toBe(false);
    }
  });
});

function fresh() {
  return { local: memoryStorage(), session: memoryStorage(), cookie: memoryCookie() };
}
