import { describe, expect, it } from "vitest";
import {
  EMAIL_SENDER_NAME,
  EMAIL_TEMPLATE_IDS,
  escapeHtml,
  isEmailTemplateId,
  renderEmailTemplate,
} from "@/modules/notifications/email-templates";
import { ValidationError } from "@/lib/errors";

const LOGIN_CODE = { code: "482913", expiresInMinutes: 10 } as const;

describe("escapeHtml", () => {
  it("escapes every character that can break out of a text node or attribute", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes ampersands first, so an escape is not double-encoded into a literal", () => {
    // Getting the order wrong turns `<` into `&amp;lt;`, which renders as the
    // text "&lt;" rather than a less-than sign.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("renderEmailTemplate", () => {
  it("renders the login code into the subject, text and HTML bodies", () => {
    const rendered = renderEmailTemplate("auth.login-code", LOGIN_CODE);

    expect(rendered.subject).toContain("482913");
    expect(rendered.subject).toContain(EMAIL_SENDER_NAME);
    expect(rendered.text).toContain("482913");
    expect(rendered.html).toContain("482913");
  });

  it("states the expiry it was given rather than a hard-coded number", () => {
    // The caller derives this from OTP_TTL_MS. An email that contradicts the
    // actual lifetime is worse than one that omits it.
    const rendered = renderEmailTemplate("auth.login-code", {
      code: "111111",
      expiresInMinutes: 3,
    });

    expect(rendered.text).toContain("3 minutes");
    expect(rendered.html).toContain("3");
    expect(rendered.text).not.toContain("10 minutes");
  });

  it("always produces a plain-text alternative", () => {
    // A transactional message with no text part scores as more likely to be
    // spam, and a login code in a spam folder reads to the user as an outage.
    const rendered = renderEmailTemplate("auth.login-code", LOGIN_CODE);

    expect(rendered.text.length).toBeGreaterThan(0);
    expect(rendered.text).not.toContain("<");
    expect(rendered.text).not.toContain("style=");
  });

  it("tells the recipient the code alone is not enough to take the account", () => {
    const rendered = renderEmailTemplate("auth.login-code", LOGIN_CODE);
    expect(rendered.text.toLowerCase()).toContain("did not try to sign in");
  });

  it("escapes variables in the HTML body", () => {
    const rendered = renderEmailTemplate("auth.login-code", {
      code: "<img src=x onerror=alert(1)>",
      expiresInMinutes: 10,
    });

    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;img");
  });

  it("rejects an unknown template rather than sending an empty body", () => {
    // Reachable if a template id ever arrives from persisted or queued data.
    expect(() =>
      renderEmailTemplate(
        "auth.does-not-exist" as "auth.login-code",
        LOGIN_CODE as unknown as { code: string; expiresInMinutes: number },
      ),
    ).toThrow(ValidationError);
  });

  it("produces well-formed HTML with balanced wrapper tags", () => {
    const rendered = renderEmailTemplate("auth.login-code", LOGIN_CODE);
    const opens = (rendered.html.match(/<div/g) ?? []).length;
    const closes = (rendered.html.match(/<\/div>/g) ?? []).length;

    expect(opens).toBe(closes);
    expect(rendered.html.startsWith("<div")).toBe(true);
  });
});

describe("template registry", () => {
  it("exposes exactly the templates the product sends today", () => {
    // Guards against a template being added without a flow that sends it, and
    // against one being renamed out from under a caller.
    expect([...EMAIL_TEMPLATE_IDS]).toEqual(["auth.login-code", "traveler.in-journey-companion"]);
  });

  it("narrows a string to a known template id", () => {
    expect(isEmailTemplateId("auth.login-code")).toBe(true);
    expect(isEmailTemplateId("auth.password-reset")).toBe(false);
    // Must not be fooled by inherited object properties.
    expect(isEmailTemplateId("toString")).toBe(false);
    expect(isEmailTemplateId("constructor")).toBe(false);
  });
});

describe("in-journey companion email", () => {
  const COMPANION = {
    patronName: "Asha",
    activeVenueTitle: "Toit Brewery",
    activeZone: "Kalyani Nagar",
    butlerNote: "Asha, you're at Toit Brewery in Kalyani Nagar.",
    recommendations: [
      {
        title: "Hyatt Regency: Poolside Brunch",
        categoryName: "Culinary & Dining",
        distanceOrTime: "~12-min walk · 930 m",
        curatorSecret: "Ask for a table on the pool deck.",
        vipPerk: "Poolside table reserved for brunch",
        experienceUrl: "https://lavivenzia.com/experiences/hyatt-regency",
      },
      {
        title: "Shizusan: Dim Sum",
        categoryName: "Culinary & Dining",
        distanceOrTime: "~7-min drive · 1.5 km",
        curatorSecret: "Request the booth by the dim sum station.",
        vipPerk: "Premium booth reserved",
        experienceUrl: "https://lavivenzia.com/experiences/shizusan",
      },
    ],
  } as const;

  it("renders every recommendation with its perk, secret and pass link", () => {
    const rendered = renderEmailTemplate("traveler.in-journey-companion", COMPANION);

    expect(rendered.subject).toBe("Your live butler in Kalyani Nagar — 2 curated gems nearby");
    for (const recommendation of COMPANION.recommendations) {
      expect(rendered.html).toContain(recommendation.vipPerk);
      expect(rendered.html).toContain(`href="${recommendation.experienceUrl}"`);
      expect(rendered.text).toContain(recommendation.curatorSecret);
      expect(rendered.text).toContain(recommendation.experienceUrl);
    }
    expect(rendered.html).toContain("Live in Kalyani Nagar");
    expect(rendered.html).toContain("#080806");
    expect(rendered.html).toContain("#cda851");
  });

  it("counts what it actually recommends in the subject", () => {
    const rendered = renderEmailTemplate("traveler.in-journey-companion", {
      ...COMPANION,
      recommendations: COMPANION.recommendations.slice(0, 1),
    });
    expect(rendered.subject).toContain("one curated gem nearby");
  });

  it("escapes every variable in the HTML body", () => {
    const rendered = renderEmailTemplate("traveler.in-journey-companion", {
      ...COMPANION,
      patronName: "<script>alert(1)</script>",
      recommendations: [{ ...COMPANION.recommendations[0], title: "<img src=x onerror=1>" }],
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("never renders a non-web link as a live href", () => {
    const rendered = renderEmailTemplate("traveler.in-journey-companion", {
      ...COMPANION,
      recommendations: [{ ...COMPANION.recommendations[0], experienceUrl: "javascript:alert(1)" }],
    });

    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).toContain('href="#"');
  });

  it("has a plain-text alternative and balanced tables", () => {
    const rendered = renderEmailTemplate("traveler.in-journey-companion", COMPANION);

    expect(rendered.text).not.toContain("<");
    expect(rendered.text).not.toContain("style=");
    const opens = (rendered.html.match(/<table/g) ?? []).length;
    const closes = (rendered.html.match(/<\/table>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
