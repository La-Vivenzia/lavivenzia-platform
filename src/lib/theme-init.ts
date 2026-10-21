/**
 * The pre-paint theme script, and the storage keys it shares with the provider.
 *
 * **Deliberately not in `ThemeProvider.tsx`.** That module carries `"use client"`,
 * and this string is consumed by the root layout, which is a *server* component.
 * A plain value exported across the React Server Components boundary arrives as
 * a client-reference proxy rather than as the value itself, and the failure is
 * silent — which is exactly the defect `tests/unit/client-boundary.test.ts` was
 * written for, after it broke `/experiences` with
 * `RADIUS_CHOICES_KM.filter is not a function`.
 *
 * Next inlines a bare string like this one today, so moving it fixes nothing
 * that is currently broken. What it removes is a dependence on that behaviour
 * continuing to hold, which is worth more than the two minutes it cost.
 */

export const THEME_KEY = "lavivenzia-theme";
export const PALETTE_KEY = "lavivenzia-palette";

/**
 * Runs before first paint. Resolves both axes from `?theme=` / `?palette=`
 * (handy for sharing a specific look), then the stored preference, then the OS
 * setting, and stamps them on <html> so the correct palette is what gets
 * painted first.
 *
 * Minified by hand rather than by a build step: it is inlined into every
 * document, so every byte is on the critical path, and it must not depend on
 * any bundle having loaded.
 */
export const themeInitScript = `(function(){try{
var q=new URLSearchParams(location.search);
var s=q.get("theme")||localStorage.getItem("${THEME_KEY}");
var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
if(t==="dark")document.documentElement.classList.add("dark");
document.documentElement.dataset.theme=t;
var p=q.get("palette")||localStorage.getItem("${PALETTE_KEY}");
document.documentElement.dataset.palette=p==="blue"?"blue":"green";
}catch(e){}})();`;
