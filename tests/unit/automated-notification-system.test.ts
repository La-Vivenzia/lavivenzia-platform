import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProviderUnavailableError } from "@/lib/errors";
import {
  bookingConfirmationEmailVariables,
  sendBookingConfirmation,
} from "@/modules/booking/booking-confirmation-email";
import type { BookingConfirmation } from "@/modules/booking/contract";
import { quoteBooking } from "@/modules/booking/pricing";
import { CompanionService } from "@/modules/companion/service";
import { DiscoveryService } from "@/modules/discovery/service";
import { createPilotDiscoveryRepository } from "@/adapters/persistence/prisma/pilot-discovery-fallback";
import {
  EMAIL_TEMPLATE_IDS,
  LUXURY_BRAND,
  renderEmailTemplate,
} from "@/modules/notifications/email-templates";
import {
  _clearStore,
  getUnreadCount,
  listNotifications,
  markAsRead,
} from "@/modules/notifications/repository";
import {
  emitNotification,
  ensureOnboardingNotifications,
  getNotificationsForUser,
} from "@/modules/notifications/service";
import type { EmailMessage, EmailPort } from "@/ports/email";

interface TestEmailPort extends EmailPort {
  readonly sent: EmailMessage[];
  readonly failCount: number;
  readonly setFailCount: (count: number) => void;
}

function fakeEmailPort(): TestEmailPort {
  const sent: EmailMessage[] = [];
  let failCount = 0;
  return {
    sent,
    get failCount() {
      return failCount;
    },
    send: async (message) => {
      if (failCount > 0) {
        failCount -= 1;
        throw new ProviderUnavailableError("transient provider glitch");
      }
      sent.push(message);
      return { providerMessageId: `msg-${sent.length}` };
    },
    setFailCount: (count: number) => {
      failCount = count;
    },
  };
}

const SAMPLE_CONFIRMATION: BookingConfirmation = {
  reference: "LV-TEST-9921",
  mode: "demo",
  experience: {
    slug: "toit-brewery-craft-beer-tasting-kalyani-viman",
    title: "Toit Brewery Craft Tasting",
    hostName: "Toit Pune",
  },
  slot: {
    id: "slot-123",
    startsAt: "2026-11-28T14:00:00.000Z",
    endsAt: "2026-11-28T16:00:00.000Z",
  },
  guests: 2,
  quote: quoteBooking({
    basePriceMinor: 230000,
    currency: "INR",
    pricingUnit: "PER_PERSON",
    guests: 2,
  }),
  venue: {
    lines: ["Metro Station Road", "Kalyani Nagar, Pune", "India"],
    latitude: 18.548,
    longitude: 73.902,
    mapUrl: "https://maps.google.com/?q=18.548,73.902",
  },
  paymentId: "pay_test_123",
  confirmedAt: "2026-11-28T13:30:00.000Z",
};

describe("LA-22: Automated Email & Notification System", () => {
  beforeEach(() => {
    _clearStore();
  });

  afterEach(() => {
    _clearStore();
  });

  /* -------------------------------------------------- 1. Booking Confirmation */
  describe("Requirement 1: Booking Confirmation Email", () => {
    it("assembles complete variables from BookingConfirmation", () => {
      const vars = bookingConfirmationEmailVariables(
        SAMPLE_CONFIRMATION,
        "https://lavivenzia.test",
        "Vikram",
      );

      expect(vars.patronName).toBe("Vikram");
      expect(vars.reference).toBe("LV-TEST-9921");
      expect(vars.experienceTitle).toBe("Toit Brewery Craft Tasting");
      expect(vars.hostName).toBe("Toit Pune");
      expect(vars.guests).toBe(2);
      expect(vars.totalFormatted).toContain("4,600");
      expect(vars.venueLines).toContain("Metro Station Road");
      expect(vars.directionsUrl).toBe(SAMPLE_CONFIRMATION.venue.mapUrl);
      expect(vars.experienceUrl).toBe(
        "https://lavivenzia.test/experiences/toit-brewery-craft-beer-tasting-kalyani-viman",
      );
    });

    it("automatically dispatches booking confirmation email through email port", async () => {
      const email = fakeEmailPort();
      const result = await sendBookingConfirmation(email, {
        to: "vikram@example.test",
        confirmation: SAMPLE_CONFIRMATION,
        appUrl: "https://lavivenzia.test",
        patronName: "Vikram",
      });

      expect(result.providerMessageId).toBe("msg-1");
      expect(email.sent).toHaveLength(1);

      const msg = email.sent[0];
      expect(msg).toBeDefined();
      if (!msg || msg.template !== "traveler.booking-confirmation") {
        throw new Error("wrong template");
      }
      expect(msg.to).toBe("vikram@example.test");
      expect(msg.variables.reference).toBe("LV-TEST-9921");
    });

    it("retries once on retryable provider error", async () => {
      const email = fakeEmailPort();
      email.setFailCount(1);

      const result = await sendBookingConfirmation(email, {
        to: "retry@example.test",
        confirmation: SAMPLE_CONFIRMATION,
        appUrl: "https://lavivenzia.test",
      });

      expect(result.providerMessageId).toBe("msg-1");
      expect(email.sent).toHaveLength(1);
    });
  });

  /* --------------------------------------------- 2. In-App Notifications */
  describe("Requirement 2: In-App BOOKING_CONFIRMED Notifications", () => {
    it("emits in-app notification of type booking_confirmed with action URL", () => {
      const notification = emitNotification({
        userId: "patron-456",
        type: "booking_confirmed",
        title: "Booking Confirmed: Toit Brewery Craft Tasting",
        body: "Your reservation with Toit Pune is confirmed. Reference: LV-TEST-9921.",
        actionUrl: "/experiences/toit-brewery-craft-beer-tasting-kalyani-viman",
      });

      expect(notification.id).toBeTruthy();
      expect(notification.type).toBe("booking_confirmed");
      expect(notification.readAt).toBeNull();

      const userNotifications = listNotifications("patron-456");
      expect(userNotifications).toHaveLength(1);
      expect(userNotifications[0]!.title).toContain("Booking Confirmed");
      expect(getUnreadCount("patron-456")).toBe(1);

      markAsRead(notification.id, "patron-456");
      expect(getUnreadCount("patron-456")).toBe(0);
    });
  });

  /* ---------------------------------- 3. Automated Nearby Recommendations */
  describe("Requirement 3: Automated Nearby Curated Recommendations (Zero Manual Dispatch)", () => {
    const catalogue = new DiscoveryService({
      discovery: createPilotDiscoveryRepository((key) => key),
    });

    it("dispatches recommendations and emits in-app concierge_update notification", async () => {
      const email = fakeEmailPort();
      const companion = new CompanionService({
        catalogue,
        email,
        appUrl: "https://lavivenzia.test",
      });

      const userId = "patron-in-kalyani";
      const result = await companion.dispatch({
        to: "patron@example.test",
        userId,
        activeExperienceSlug: "toit-brewery-craft-beer-tasting-kalyani-viman",
        patronName: "Ananya",
      });

      expect(result.providerMessageId).toBe("msg-1");
      expect(email.sent).toHaveLength(1);
      expect(result.active.zone).toBe("Kalyani Nagar");
      expect(result.recommendations.length).toBeGreaterThan(0);

      const notifications = listNotifications(userId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.type).toBe("concierge_update");
      expect(notifications[0]!.title).toContain("Kalyani Nagar");
      expect(notifications[0]!.body).toContain(result.recommendations.length.toString());
    });

    it("enforces idempotency within 30 minutes to prevent repeat spam", async () => {
      const email = fakeEmailPort();
      const companion = new CompanionService({
        catalogue,
        email,
        appUrl: "https://lavivenzia.test",
      });

      const slug = "toit-brewery-craft-beer-tasting-kalyani-viman";

      // First dispatch
      const first = await companion.dispatch({
        to: "ananya@example.test",
        activeExperienceSlug: slug,
      });
      expect(first.alreadyDispatched).toBeUndefined();
      expect(email.sent).toHaveLength(1);

      // Automated second dispatch (e.g. page refresh / arrival re-trigger)
      const second = await companion.autoDispatch({
        to: "ananya@example.test",
        activeExperienceSlug: slug,
      });
      expect(second.alreadyDispatched).toBe(true);
      // Email was NOT sent twice!
      expect(email.sent).toHaveLength(1);

      // Explicit force bypasses idempotency
      const forced = await companion.dispatch({
        to: "ananya@example.test",
        activeExperienceSlug: slug,
        force: true,
      });
      expect(forced.alreadyDispatched).toBeUndefined();
      expect(email.sent).toHaveLength(2);
    });
  });

  /* ------------------------------------- 4. Curated Itinerary Save */
  describe("Requirement 4: Curated Itinerary Save Notification & Email", () => {
    it("emits in-app notification when a traveler saves a curated itinerary", () => {
      const userId = "traveler-itinerary-user";
      const notification = emitNotification({
        userId,
        type: "journey_pass",
        title: "Curated Itinerary Saved: Starlit Romance",
        body: "Your itinerary for Starlit Romance (Romantic) has been saved to My Curations and sent to your email.",
        actionUrl: "/journeys/starlit-romance",
      });

      expect(notification.type).toBe("journey_pass");
      const list = listNotifications(userId);
      expect(list).toHaveLength(1);
      expect(list[0]!.title).toContain("Curated Itinerary Saved");
    });
  });

  /* ----------------------- 5. Registration / First Sign-In Onboarding */
  describe("Requirement 5: Registration / First Sign-In Welcome & Journey Pass", () => {
    it("automatically creates welcome and onboarding Journey Pass notifications", () => {
      const newUserId = "new-user-registered-101";

      ensureOnboardingNotifications(newUserId);
      const inbox = getNotificationsForUser(newUserId);

      expect(inbox.notifications.length).toBeGreaterThanOrEqual(2);
      expect(inbox.unreadCount).toBeGreaterThanOrEqual(2);

      const welcome = inbox.notifications.find((n) => n.type === "system");
      expect(welcome).toBeDefined();
      expect(welcome?.title).toContain("Welcome to the Patron Circle");

      const pass = inbox.notifications.find((n) => n.type === "journey_pass");
      expect(pass).toBeDefined();
      expect(pass?.title).toContain("Inaugural Journey Pass");
      expect(pass?.actionUrl).toBe("/journeys/east-pune-twilight");
    });

    it("is strictly idempotent and does not duplicate seeds on second login", () => {
      const userId = "returning-patron-202";

      ensureOnboardingNotifications(userId);
      const count1 = listNotifications(userId).length;

      ensureOnboardingNotifications(userId);
      const count2 = listNotifications(userId).length;

      expect(count2).toBe(count1);
    });
  });

  /* ----------------------------------- 6. Luxury Brand Email Redesign */
  describe("Requirement 6: La Vivenzia Luxury Brand Design", () => {
    it("includes all 5 required templates in registry", () => {
      expect(EMAIL_TEMPLATE_IDS).toEqual([
        "auth.login-code",
        "traveler.booking-confirmation",
        "traveler.in-journey-companion",
        "traveler.journey-pass-confirmation",
        "traveler.curated-itinerary",
      ]);
    });

    it("redesigns all templates with official luxury palette tokens", () => {
      // 1. Login Code
      const login = renderEmailTemplate("auth.login-code", {
        code: "891234",
        expiresInMinutes: 10,
      });
      expect(login.html).toContain(LUXURY_BRAND.deepPine);
      expect(login.html).toContain(LUXURY_BRAND.champagneGold);
      expect(login.html).toContain(LUXURY_BRAND.warmIvory);
      expect(login.text).toContain("891234");
      expect(login.text).not.toContain("<");

      // 2. Booking Confirmation
      const booking = renderEmailTemplate("traveler.booking-confirmation", {
        patronName: "Rohan",
        experienceTitle: "Toit Brewery Craft Tasting",
        hostName: "Toit Pune",
        reference: "LV-8899",
        startsAtFormatted: "Sat, 28 Nov 2026, 7:00 PM",
        endsAtFormatted: "Sat, 28 Nov 2026, 9:00 PM",
        guests: 2,
        totalFormatted: "₹4,600",
        venueLines: ["Metro Station Road", "Kalyani Nagar"],
        directionsUrl: "https://maps.google.com",
        experienceUrl: "https://lavivenzia.com/experiences/toit",
        confirmedAt: "2026-11-28T10:00:00Z",
      });
      expect(booking.html).toContain(LUXURY_BRAND.deepPine);
      expect(booking.html).toContain(LUXURY_BRAND.champagneGold);
      expect(booking.html).toContain(LUXURY_BRAND.warmIvory);
      expect(booking.html).toContain(LUXURY_BRAND.border);
      expect(booking.text).toContain("LV-8899");
      expect(booking.text).not.toContain("<");

      // 3. Companion
      const companion = renderEmailTemplate("traveler.in-journey-companion", {
        patronName: "Asha",
        activeVenueTitle: "Toit",
        activeZone: "Kalyani Nagar",
        butlerNote: "A note from your butler.",
        recommendations: [
          {
            title: "Shizusan",
            categoryName: "Culinary",
            distanceOrTime: "~5-min walk",
            curatorSecret: "Ask for terrace",
            vipPerk: "Welcome drink",
            experienceUrl: "https://lavivenzia.com/experiences/shizusan",
          },
        ],
      });
      expect(companion.html).toContain(LUXURY_BRAND.deepPine);
      expect(companion.html).toContain(LUXURY_BRAND.champagneGold);
      expect(companion.text).toContain("Shizusan");
      expect(companion.text).not.toContain("<");

      // 4. Pass Confirmation
      const pass = renderEmailTemplate("traveler.journey-pass-confirmation", {
        holderName: "Mira",
        journeyTitle: "East Pune Twilight",
        reference: "PASS-99",
        secretKeyword: "AMBER-WHISPER",
        partySize: 2,
        simulated: false,
        notice: "Notice text",
        acts: [
          {
            heading: "Chapter I",
            title: "Effingut",
            startsAt: "19:00",
            addressLine: "Seasons Mall",
            privilege: "Reserved booth",
            privilegeConfirmed: true,
            directionsUrl: "https://maps.google.com",
          },
        ],
        journeyUrl: "https://lavivenzia.com/journeys/east-pune-twilight",
      });
      expect(pass.html).toContain(LUXURY_BRAND.deepPine);
      expect(pass.html).toContain(LUXURY_BRAND.champagneGold);
      expect(pass.html).toContain("AMBER-WHISPER");
      expect(pass.text).toContain("AMBER-WHISPER");
      expect(pass.text).not.toContain("<");

      // 5. Curated Itinerary
      const itinerary = renderEmailTemplate("traveler.curated-itinerary", {
        journeyTitle: "Starlit Romance",
        mood: "Romantic",
        tagline: "An evening for two",
        duration: "2 hours",
        partySize: 2,
        acts: [
          {
            heading: "Chapter I",
            title: "Rooftop Lounge",
            startsAt: "20:00",
            addressLine: "Koregaon Park",
            privilege: "Corner table",
            privilegeConfirmed: true,
            directionsUrl: "https://maps.google.com",
          },
        ],
        journeyUrl: "https://lavivenzia.com/journeys/starlit-romance",
      });
      expect(itinerary.html).toContain(LUXURY_BRAND.deepPine);
      expect(itinerary.html).toContain(LUXURY_BRAND.champagneGold);
      expect(itinerary.text).toContain("Starlit Romance");
      expect(itinerary.text).not.toContain("<");
    });
  });
});
