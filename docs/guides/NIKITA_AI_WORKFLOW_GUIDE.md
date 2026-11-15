# ⚡ Nikita's AI-Assisted Implementation Guide: Automated Email & Notification Engine

**Target Issue**: [LA-22](https://linear.app/la-vivenzia/issue/LA-22/backend-and-automation-automated-production-ready-notification-and)  
**Target Repository**: `lavivenziaSAAS`  
**Git Branch**: `feat/automated-email-notification-system`  
**Reference Modules**: `src/modules/notifications/`, `src/adapters/email/`, `src/jobs/`  

---

## 🏛️ System Architecture Overview

The La Vivenzia notification engine operates on a clean hexagonal architecture:
1. **Ports & Domain**:
   - `src/ports/email.ts`: Defines `EmailPort` and `EmailMessage` interfaces.
   - `src/modules/notifications/types.ts`: Defines `Notification`, `NotificationType`, and `CreateNotificationParams`.
2. **Templates & Formatting**:
   - `src/modules/notifications/email-templates.ts`: Produces provider-agnostic rendered HTML & Plain Text.
3. **Adapters**:
   - `src/adapters/email/resend/`: Primary transactional email transport.
   - `src/adapters/email/ses/`: Secondary AWS SES transport.
   - `src/adapters/email/console/`: Local dev & fallback transport.
4. **In-App Store**:
   - `src/modules/notifications/service.ts` & `repository.ts`: Persists in-app notifications for patrons.

---

## 🤖 How to Leverage AI Tools Efficiently (Claude Code / Cursor / Copilot)

### Rule 1: Feed Concrete Types to the AI
Never ask AI to "write an email sender". Give it the exact TypeScript interface:
> **Example Prompt for AI**:
> *"Look at `src/modules/notifications/email-templates.ts`. We need to redesign the HTML template for `traveler.journey-pass-confirmation` and `traveler.curated-itinerary`. The email must adhere to our Quiet Luxury design tokens: Deep Pine (`#0D1611`), Warm Ivory (`#FBF9F5`), Muted Gold (`#C5A880`), using inline styles compatible with Gmail and Apple Mail. Generate fully validated HTML with an elegant header, tabular itinerary breakdown, and deep-link CTA."*

### Rule 2: Eliminate Manual Triggers
Guide AI to attach dispatch listeners directly to domain events:
> **Example Prompt for AI**:
> *"Locate the checkout completion handler in `src/app/api/v1/experiences/[slug]/checkout/confirm/route.ts` and `src/app/api/v1/journeys/[id]/pass/checkout/route.ts`. Remove any requirement for an operator or manual button press. Wire an asynchronous dispatch that automatically triggers `sendJourneyPassEmail` and calls `emitNotification({ type: 'BOOKING_CONFIRMED', ... })` within an error-isolated background promise."*

### Rule 3: Guard Against Runtime Failures
* Ensure email sending errors never abort user transactions.
* AI must wrap transport calls with `try/catch` logging via `getLogger().error(...)` and return `{ success: false, error: ... }` rather than crashing the request.

---

## 🛠️ Step-by-Step Task Breakdown

### 1. Zero-Manual-Trigger Event Wiring
* **Automated Booking Pass**:
  - When payment or booking confirmation succeeds, automatically trigger `traveler.journey-pass-confirmation` email AND emit an in-app notification.
* **Automated Nearby Curation / Live Butler Companion**:
  - Hook into `src/app/api/v1/companion/dispatch/route.ts` and ensure nearby venue curations can be triggered automatically upon checking in or selecting a zone.
* **Automated Itinerary Save**:
  - When a user saves a curated journey in `src/app/api/v1/user/curations/route.ts`, automatically dispatch the luxury `traveler.curated-itinerary` email.
* **Automated Welcome Notification**:
  - On first sign-in / registration in `src/app/api/v1/auth/register/route.ts`, automatically call `emitNotification` to deliver the luxury member welcome message.

### 2. Luxury Email Template Overhaul (`src/modules/notifications/email-templates.ts`)
* Redesign all transactional templates:
  - `auth.login-code` (Passwordless authentication code)
  - `traveler.in-journey-companion` (Live Butler nearby recommendations)
  - `traveler.journey-pass-confirmation` (Digital Pass & Secret Door Keyword)
  - `traveler.curated-itinerary` (Curated journey running order)
* **Design Standards**:
  - Full-width background: `#FBF9F5` (Warm Ivory).
  - Container box: Max-width 580px, centered, clean white card (`#FFFFFF`) with 1px border (`#E6E1D8`) and 12px rounded corners.
  - Header: Official wordmark with serif styling.
  - Accent details: Champagne Gold highlights (`#C5A880`) for times, dates, and VIP perks.
  - CTA Button: Deep Pine pill (`#0D1611`), white text (`#FFFFFF`), `padding: 14px 28px`, `border-radius: 9999px`.
  - Plain Text version: Structured with clean ASCII section dividers and clear URLs.

### 3. In-App Notification Store Synchronization
* In `src/modules/notifications/service.ts`, ensure that every event dispatched via email also stores an in-app notification record:
  ```ts
  emitNotification({
    userId: patronId,
    type: "BOOKING_CONFIRMED", // or "CURATION_READY", "VIP_PERK", "WELCOME"
    title: "Journey Pass Confirmed: Smaaash Arena",
    body: "Your secret pass keyword and VIP lane privileges are now active.",
    actionUrl: `/journeys/${journeyId}/pass`,
  });
  ```

### 4. Transport Verification & Resilient Fallback (`src/adapters/email/`)
* Verify `RESEND_API_KEY` configuration.
* Sender domain must default to `concierge@lavivenzia.com` (or `invitations@lavivenzia.com`).
* If `RESEND_API_KEY` is not present (e.g. local developer machine or PR preview), the transport must smoothly fall back to `src/adapters/email/console` without throwing unhandled exceptions.

### 5. Automated Unit & Integration Tests
* Create unit tests under `tests/notifications/automated-dispatch.test.ts`:
  1. Template rendering test: Verify that HTML generated for all 4 templates includes required keywords and valid markup.
  2. Event dispatch test: Verify that simulated checkout automatically produces both an email job and an in-app notification.
  3. Resilience test: Verify that when email transport fails, the transaction still returns HTTP 200 with the in-app notification safely persisted.

---

## 🧪 Verification & Acceptance Checklist
Before opening your Pull Request:
1. Run `npm run test` -> Verify all notification & email tests pass.
2. Run `npm run build` -> Next.js production build must compile with zero errors.
3. Test a real booking or curation save in local environment and inspect the rendered HTML email output and in-app notification list.
4. Push branch: `git push origin feat/automated-email-notification-system`.
