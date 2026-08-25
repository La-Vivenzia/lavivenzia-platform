import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards a defect that shipped once and was invisible in review.
 *
 * The hero call to action was written as a `secondary` button with
 * `className="bg-gold-light text-ink ..."` appended to recolour it. That does
 * not work. Tailwind utilities all have the same specificity, so which one
 * applies is decided by the order they appear in the generated stylesheet, not
 * by the order they appear in the class attribute — and `bg-transparent` is
 * emitted after `bg-gold-light`. The button rendered near-black text on the
 * near-black hero: present, clickable, invisible.
 *
 * A rendering test would not have caught it, because the markup was correct.
 * What was wrong was the assumption that the last class in the attribute wins.
 * So this asserts the rule instead: **a variant carries every colour it needs,
 * and `className` on a button carries none.**
 */

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Every `<Button …>` / `<ButtonLink …>` opening tag in the source. */
function buttonTags(source: string): string[] {
  return [...source.matchAll(/<Button(?:Link)?\s[^>]*?>/gs)].map((match) => match[0]);
}

/** The literal `className="…"` on a tag, if it has one. */
function classNameOf(tag: string): string | null {
  return /className="([^"]*)"/.exec(tag)?.[1] ?? null;
}

/**
 * Utilities that set a colour. `text-[13px]` and `text-sm` are sizes, not
 * colours, and are allowed — a caller may legitimately adjust type scale.
 */
function colourUtilities(className: string): string[] {
  return (
    className
      .split(/\s+/)
      .filter((utility) => utility.length > 0)
      // Ignore the variant prefix: `hover:bg-gold` is the same mistake as `bg-gold`.
      .map((utility) => utility.slice(utility.lastIndexOf(":") + 1))
      .filter((utility) => {
        if (utility.startsWith("bg-")) return true;
        if (utility.startsWith("border-")) return true;
        if (!utility.startsWith("text-")) return false;
        // Sizes are fine; anything else after `text-` is a colour.
        return !/^text-(\[|xs$|sm$|base$|lg$|xl$|\dxl$)/.test(utility);
      })
  );
}

describe("button colour discipline", () => {
  const files = tsxFiles(SRC);

  it("finds the source to check", () => {
    // Guards the guard: a broken path would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((file) => file.endsWith("page.tsx"))).toBe(true);
  });

  it("no button is recoloured through className", () => {
    const offences: string[] = [];

    for (const file of files) {
      for (const tag of buttonTags(readFileSync(file, "utf8"))) {
        const className = classNameOf(tag);
        if (className === null) continue;

        const colours = colourUtilities(className);
        if (colours.length > 0) {
          offences.push(`${file.replace(SRC, "src")}: ${colours.join(" ")}`);
        }
      }
    }

    // If this fails, the fix is a new variant in components/ui/button.tsx —
    // not a longer className.
    expect(offences).toEqual([]);
  });

  it("actually detects a colour override when one is present", () => {
    // Proves the matcher above is not simply returning nothing.
    expect(colourUtilities("bg-gold-light text-ink border-gold-light")).toEqual([
      "bg-gold-light",
      "text-ink",
      "border-gold-light",
    ]);
    expect(colourUtilities("hover:bg-gold-light/90")).toEqual(["bg-gold-light/90"]);
  });

  it("allows layout and type-scale classes", () => {
    expect(colourUtilities("w-full")).toEqual([]);
    expect(colourUtilities("text-[13px]")).toEqual([]);
    expect(colourUtilities("text-sm mt-2 flex")).toEqual([]);
  });

  it("finds the buttons it is meant to be checking", () => {
    const tags = files.flatMap((file) => buttonTags(readFileSync(file, "utf8")));
    expect(tags.length).toBeGreaterThan(10);
  });
});

describe("dark-surface variants exist", () => {
  it("offers a variant for each ground rather than requiring an override", () => {
    const source = readFileSync(join(SRC, "components", "ui", "button.tsx"), "utf8");

    // The light ground.
    expect(source).toContain("primary:");
    expect(source).toContain("secondary:");
    // The ink ground. Their absence is what forced the override in the first place.
    expect(source).toContain("gold:");
    expect(source).toContain("inverse:");
  });
});
