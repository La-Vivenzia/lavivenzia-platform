import { describe, expect, it } from "vitest";
import {
  EMAIL_SENDER_NAME,
  EMAIL_TEMPLATE_IDS,
  LUXURY_BRAND,
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
    const rendered = renderEmailTemplate("auth.login-code", {
      code: "111111",
      expiresInMinutes: 3,
    });

    expect(rendered.text).toContain("3 minutes");
    expect(rendered.html).toContain("3");
    expect(rendered.text).not.toContain("10 minutes");
  });

  it("always produces a plain-text alternative", () => {
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
    expect(() =>
      renderEmailTemplate(
        "auth.does-not-exist" as "auth.login-code",
        LOGIN_CODE as unknown as { code: string; expiresInMinutes: number },
      ),
    ).toThrow(ValidationError);
  });

  it("produces well-formed HTML with balanced wrapper tables and doctype", () => {
    const rendered = renderEmailTemplate("auth.login-code", LOGIN_CODE);
    const opens = (rendered.html.match(/<table/g) ?? []).length;
    const closes = (rendered.html.match(/<\/table>/g) ?? []).length;

    expect(opens).toBe(closes);
    expect(rendered.html.startsWith("<!doctype html>")).toBe(true);
  });

  it("renders official La Vivenzia luxury branding tokens", () => {
    const rendered = renderEmailTemplate("auth.login-code", LOGIN_CODE);
    expect(rendered.html).toContain(LUXURY_BRAND.deepPine);
    expect(rendered.html).toContain(LUXURY_BRAND.champagneGold);
    expect(rendered.html).toContain(LUXURY_BRAND.warmIvory);
  });
});

describe("template registry", () => {
  it("exposes exactly the templates the product sends today including booking-confirmation", () => {
    expect([...EMAIL_TEMPLATE_IDS]).toEqual([
      "auth.login-code",
      "traveler.booking-confirmation",
      "traveler.in-journey-companion",
      "traveler.journey-pass-confirmation",
      "traveler.curated-itinerary",
    ]);
  });

  it("narrows a string to a known template id", () => {
    expect(isEmailTemplateId("auth.login-code")).toBe(true);
    expect(isEmailTemplateId("traveler.booking-confirmation")).toBe(true);
    expect(isEmailTemplateId("auth.password-reset")).toBe(false);
    expect(isEmailTemplateId("toString")).toBe(false);
    expect(isEmailTemplateId("constructor")).toBe(false);
  });
});

describe("booking confirmation email (LA-22)", () => {
  const BOOKING = {
    patronName: "Kabir",
    experienceTitle: "Effingut Craft Brewery: Private Tasting",
    hostName: "Effingut Brewhouse",
    reference: "LV-EF-8942",
    startsAtFormatted: "Sat, 28 Nov 2026, 07:30 PM",
    endsAtFormatted: "Sat, 28 Nov 2026, 09:30 PM",
    guests: 2,
    totalFormatted: "₹5,400",
    venueLines: ["Effingut Brewhouse, Seasons Mall", "Magarpatta, Pune 411028", "India"],
    directionsUrl: "https://maps.google.com/?q=18.519,73.931",
    experienceUrl: "https://lavivenzia.com/experiences/effingut-craft-brewery",
    confirmedAt: "2026-11-28T14:00:00.000Z",
  } as const;

  it("renders booking details with reference, host, date, party, and luxury styling", () => {
    const rendered = renderEmailTemplate("traveler.booking-confirmation", BOOKING);

    expect(rendered.subject).toContain("Booking Confirmed: Effingut Craft Brewery");
    expect(rendered.subject).toContain("LV-EF-8942");

    // Text fallback
    expect(rendered.text).toContain("Kabir");
    expect(rendered.text).toContain("Effingut Craft Brewery");
    expect(rendered.text).toContain("LV-EF-8942");
    expect(rendered.text).toContain("₹5,400");
    expect(rendered.text).toContain("2 guests");
    expect(rendered.text).toContain("Seasons Mall");
    expect(rendered.text).not.toContain("<");

    // HTML luxury branding
    expect(rendered.html).toContain(LUXURY_BRAND.deepPine);
    expect(rendered.html).toContain(LUXURY_BRAND.champagneGold);
    expect(rendered.html).toContain(LUXURY_BRAND.warmIvory);
    expect(rendered.html).toContain(LUXURY_BRAND.border);
    expect(rendered.html).toContain("LV-EF-8942");
    expect(rendered.html).toContain("Effingut Craft Brewery");
    expect(rendered.html).toContain("View Experience &amp; Pass");
  });

  it("escapes untrusted variables in booking confirmation", () => {
    const rendered = renderEmailTemplate("traveler.booking-confirmation", {
      ...BOOKING,
      patronName: "<script>alert('xss')</script>",
      experienceTitle: "Craft & Sip <img src=x onerror=1>",
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("has balanced tables and doctype in HTML", () => {
    const rendered = renderEmailTemplate("traveler.booking-confirmation", BOOKING);
    const opens = (rendered.html.match(/<table/g) ?? []).length;
    const closes = (rendered.html.match(/<\/table>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(rendered.html.startsWith("<!doctype html>")).toBe(true);
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

  it("renders every recommendation with its perk, secret and pass link in luxury branding", () => {
    const rendered = renderEmailTemplate("traveler.in-journey-companion", COMPANION);

    expect(rendered.subject).toBe("Your live butler in Kalyani Nagar — 2 curated gems nearby");
    for (const recommendation of COMPANION.recommendations) {
      expect(rendered.html).toContain(recommendation.vipPerk);
      expect(rendered.html).toContain(`href="${recommendation.experienceUrl}"`);
      expect(rendered.text).toContain(recommendation.curatorSecret);
      expect(rendered.text).toContain(recommendation.experienceUrl);
    }
    expect(rendered.html).toContain("Live in Kalyani Nagar");
    expect(rendered.html).toContain(LUXURY_BRAND.deepPine);
    expect(rendered.html).toContain(LUXURY_BRAND.champagneGold);
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
