import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards a defect that shipped once and was invisible in review.
 *
 * A segment-level `loading.tsx` creates a Suspense boundary around **the whole
 * segment, including its nested routes**. With one at `experiences/`, the shell
 * for `experiences/[slug]` flushed before the page ran — committing HTTP 200 —
 * so a later `notFound()` rendered the right page under the wrong status.
 *
 * That is a soft 404: exactly what a search engine indexes, on a surface
 * REQUIREMENTS.md asks to be indexable. It looked correct in a browser and in
 * every rendering test, because the markup was right; only the status was wrong.
 *
 * The rule this asserts: **a segment containing a dynamic child route may not
 * have its own `loading.tsx`.** Put the Suspense boundary inside the page
 * instead, where it covers the slow part without covering the child.
 */

const APP = join(process.cwd(), "src", "app");

function directories(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isDirectory());
}

function allSegments(dir: string): string[] {
  return directories(dir).flatMap((path) => [path, ...allSegments(path)]);
}

function has(dir: string, file: string): boolean {
  try {
    return statSync(join(dir, file)).isFile();
  } catch {
    return false;
  }
}

/** A child segment that is dynamic, e.g. `[slug]` or `[id]`. */
function dynamicChildren(dir: string): string[] {
  return directories(dir).filter((path) => {
    const name = path.split(sep).pop() ?? "";
    return name.startsWith("[") && name.endsWith("]");
  });
}

describe("route structure", () => {
  const segments = allSegments(APP);

  it("finds the app directory", () => {
    // Guards the guard: a broken path makes every assertion below vacuous.
    expect(segments.length).toBeGreaterThan(10);
    expect(segments.some((path) => path.endsWith(`${sep}experiences`))).toBe(true);
  });

  it("has no loading.tsx in a segment that also has a dynamic child route", () => {
    const offences = segments
      .filter((dir) => has(dir, "loading.tsx") && dynamicChildren(dir).length > 0)
      .map((dir) => relative(process.cwd(), dir));

    // If this fails, the dynamic child below this segment will answer 200 for a
    // URL that does not exist. Move the boundary into the page: wrap the slow
    // part in <Suspense> there instead.
    expect(offences).toEqual([]);
  });

  it("still detects the arrangement it is meant to catch", () => {
    // Proves the matcher is not simply returning nothing: the experiences
    // segment does have a dynamic child, so the rule has something to check.
    const experiences = segments.find((path) => path.endsWith(`${sep}experiences`));
    expect(experiences).toBeDefined();
    expect(dynamicChildren(experiences!).length).toBeGreaterThan(0);
  });

  it("gives every signed-in shell a way to sign out", () => {
    // The traveller header had none: someone who signed in and then browsed the
    // public site could not get out without first navigating into a console.
    // Found by the founder demo walkthrough, not by any test.
    // The traveller header's sign-out lives in `ProfileButton`, which both the
    // mobile and desktop headers render — one control, not two copies.
    const shells = [
      join(process.cwd(), "src", "components", "ProfileButton.tsx"),
      join(process.cwd(), "src", "components", "host", "shell.tsx"),
      join(process.cwd(), "src", "components", "ops", "shell.tsx"),
    ];

    for (const shell of shells) {
      const source = readFileSync(shell, "utf8");
      expect(source, `${shell} offers no sign out`).toContain('action="/sign-out"');
      // A POST, not a link: as a GET it would be triggerable by any image tag.
      expect(source).toContain('method="post"');
    }
  });

  it("serves sign-out from one shared route, not a console-specific one", () => {
    // It lived under /host/sign-out, which the traveller site had no business
    // posting to. One endpoint, used by all three shells.
    expect(statSync(join(APP, "sign-out", "route.ts")).isFile()).toBe(true);
  });

  it("keeps a real loading state for the browse results", () => {
    // Removing the boundary entirely would trade one defect for another. The
    // skeleton still exists; it just lives inside the page now.
    const page = join(APP, "(site)", "experiences", "page.tsx");
    const source = readdirSync(join(APP, "(site)", "experiences"));

    expect(source).toContain("page.tsx");
    expect(statSync(page).isFile()).toBe(true);
  });

  /**
   * A traveller could not sign in through the product.
   *
   * The passwordless backend was complete and tested from the authentication
   * milestone onward — register, request a code, verify, session — and no page
   * ever called it. `/sign-in` collected a password, which a traveller does not
   * have, so following the header link was a dead end.
   *
   * That is the same class of defect as the soft 404 above: invisible to every
   * test that renders a component, because each component was correct on its
   * own. Only walking the product finds it. These assertions are deliberately
   * about *reachability*, which is the part that was missing.
   */
  it("gives travellers a way in that does not ask for a password", () => {
    // Asserted on the behaviour, not on a component name — the name has changed
    // once already and the property is what matters: the sign-in screen must
    // reach the emailed-code endpoints, not only the password one.
    const screen = readFileSync(join(APP, "sign-in", "sign-in-screen.tsx"), "utf8");

    expect(screen).toContain("/api/v1/auth/otp/request");
    expect(screen).toContain("/api/v1/auth/otp/verify");
    // And the password must be optional, or a traveller cannot submit at all.
    expect(screen).toContain("password.length === 0");
  });

  it("gives travellers a way to create an account", () => {
    const form = readFileSync(join(APP, "join", "join-form.tsx"), "utf8");
    // The flow the form delegates to. It moved out of the component so the
    // 409 rule could be unit-tested without a DOM; the assertion follows it
    // rather than being dropped.
    const flow = readFileSync(join(process.cwd(), "src", "lib", "traveller-join.ts"), "utf8");

    expect(statSync(join(APP, "join", "page.tsx")).isFile()).toBe(true);
    expect(form).toContain("startTravellerJoin");
    // Registered as a traveller, not as a host: the role decides whether a
    // password is required, and a traveller must not be given one.
    expect(flow).toContain(`role: "traveller"`);
  });

  it("does not leave the join screen on a dead end when the address exists", () => {
    // Registration reports a duplicate deliberately. The screen treating that
    // as fatal is what stranded anyone who already had an account, so the form
    // must not be calling the register endpoint directly any more.
    const form = readFileSync(join(APP, "join", "join-form.tsx"), "utf8");

    expect(form).not.toContain("/api/v1/auth/register");
    expect(form).toContain("startTravellerJoin");
  });

  it("does not send an already-signed-in visitor to a console they cannot enter", () => {
    // `/sign-in` redirected to `/host` unconditionally, which put a signed-in
    // traveller in front of a host console. One function answers this question.
    const signIn = readFileSync(join(APP, "sign-in", "page.tsx"), "utf8");

    expect(signIn).toContain("destinationForRoles");
    expect(signIn).not.toContain(`redirect("/host")`);
  });

  it("reaches the category pages that the requirements ask for", () => {
    // FR-01 lists category pages alongside destination pages. They existed only
    // as a query parameter on the browse screen until Phase 5.1.
    expect(statSync(join(APP, "(site)", "categories", "page.tsx")).isFile()).toBe(true);
    expect(statSync(join(APP, "(site)", "categories", "[key]", "page.tsx")).isFile()).toBe(true);

    // Reachability moved with the navigation: the approved header renders
    // `desktopNav`, and the home screen's circular shortcuts come from
    // `toQuickAccess`. Both must offer a route into the taxonomy.
    const nav = readFileSync(join(process.cwd(), "src", "data", "content.ts"), "utf8");
    const shortcuts = readFileSync(join(process.cwd(), "src", "lib", "home-content.ts"), "utf8");
    expect(nav).toContain("/categories");
    expect(shortcuts).toContain("/categories");
  });
});
