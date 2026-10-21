"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { PALETTE_KEY, THEME_KEY } from "@/lib/theme-init";

export type Theme = "light" | "dark";
export type Palette = "green" | "blue";

/** Browser chrome colour per combination, kept in step with globals.css. */
const CHROME_COLOR: Record<Palette, Record<Theme, string>> = {
  green: { light: "#f3efe7", dark: "#0d1611" },
  blue: { light: "#f3efe7", dark: "#0a1524" },
};

type ThemeContextValue = {
  theme: Theme;
  palette: Palette;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: Palette) => void;
  toggleTheme: () => void;
  togglePalette: () => void;
  /** False during the first client render, so toggles can avoid hydration mismatch. */
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [palette, setPaletteState] = useState<Palette>("green");
  const [mounted, setMounted] = useState(false);

  /*
   * Adopt whatever `themeInitScript` already stamped on <html>.
   *
   * This project lints with `react-hooks/set-state-in-effect`, which the demo
   * did not. The rule is right in general and does not fit here: the values
   * genuinely live outside React, written to the DOM before the first paint and
   * before any component mounts, so there is nothing to derive them from during
   * render. Reading them once on mount is precisely the "synchronise with an
   * external system" case the rule documents as legitimate.
   *
   * The alternative — resolving the theme during render — reintroduces exactly
   * the flash of the wrong palette that the init script exists to prevent.
   */
  useEffect(() => {
    const root = document.documentElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(root.classList.contains("dark") ? "dark" : "light");
    setPaletteState(root.dataset.palette === "blue" ? "blue" : "green");
    setMounted(true);
  }, []);

  /**
   * Scopes the cross-fade to the switch itself so ordinary hovers stay snappy,
   * and keeps the browser chrome colour in step with the new ground.
   */
  const runTransition = useCallback((nextTheme: Theme, nextPalette: Palette) => {
    const body = document.body;
    body.classList.add("lv-theme-transition");
    window.setTimeout(() => body.classList.remove("lv-theme-transition"), 460);

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", CHROME_COLOR[nextPalette][nextTheme]);
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      const root = document.documentElement;
      runTransition(next, palette);
      root.classList.toggle("dark", next === "dark");
      root.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode — the choice still applies for this visit */
      }
      setThemeState(next);
    },
    [palette, runTransition],
  );

  const setPalette = useCallback(
    (next: Palette) => {
      const root = document.documentElement;
      runTransition(theme, next);
      root.dataset.palette = next;
      try {
        localStorage.setItem(PALETTE_KEY, next);
      } catch {
        /* private mode — the choice still applies for this visit */
      }
      setPaletteState(next);
    },
    [theme, runTransition],
  );

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [setTheme, theme],
  );

  const togglePalette = useCallback(
    () => setPalette(palette === "blue" ? "green" : "blue"),
    [setPalette, palette],
  );

  const value = useMemo(
    () => ({
      theme,
      palette,
      setTheme,
      setPalette,
      toggleTheme,
      togglePalette,
      mounted,
    }),
    [theme, palette, setTheme, setPalette, toggleTheme, togglePalette, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
