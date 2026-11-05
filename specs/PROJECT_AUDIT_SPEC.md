# Master Audit Specification: Full Repository Implementation & Production Readiness Audit

You are conducting an exhaustive, evidence-based engineering audit of the MAIN La Vivenzia SaaS repository (`lavivenziaSAAS`) as of **November 5, 2026**.

## Objective

Audit the entire codebase to evaluate what is complete, what is partially implemented, what is missing, and what is required to make the **Pune Pilot MVP (Amanora, Seasons Mall, Magarpatta Cybercity, Hadapsar, Viman Nagar)** 100% production-ready.

---

## Scope of Inspection

1. **Architecture & Project Health**:
   - Total test suites and passing tests (`npm test` — 953 tests).
   - TypeScript compilation (`npm run typecheck`).
   - Lint & formatting (`npm run lint`).
   - Next.js production build (`npm run build`).

2. **Phase-by-Phase Roadmap Audit (Phases 0–12)**:
   - **Phase 0 (Foundations)**: Framework, Tailwind tokens, Pine/Gold/Ivory palette, Ports & Adapters architecture.
   - **Phase 1 (Public Website & Shell)**: Desktop/Mobile headers, Theme toggle, Discovery layouts.
   - **Phase 2 (Experience Discovery)**: Geo-search, PostGIS, Category filters, Pune pilot listings (`src/data/pune-pilot.ts`), Google Places autocomplete & details.
   - **Phase 3 (Authentication & Roles)**: Passwordless OTP, session cookies, Traveller join, Host onboarding, Admin role RBAC.
   - **Phase 4 (Host Management & Publishing)**: Experience creation, draft, submission, approval lifecycle. Note: host management decoupling to Host Portal.
   - **Phase 5 (Search & Proximity)**: Distance sorting, radius filtering, Google Maps integration.
   - **Phase 6 (Bookings & Checkout)**: Availability slots, guest limits, pricing engine, Razorpay checkout adapter & webhook, digital master vouchers.
   - **Phase 7 (Admin & Operations Console)**: Listing moderation, experience approvals, host audit trail.
   - **Phase 8 & 9 (AI Itinerary Engine & Trip Architect)**: Itinerary synthesizer, timeline canvas, WhatsApp butler activation deeplink.
   - **Phase 10 (FinOps API Metering & Observability)**: Usage ring buffer, integer minor-unit pricing for Places, Gemini, Anthropic, WhatsApp, Resend, Razorpay, ₹5k budget guardrail.
   - **Phase 11 & 12 (Scale, Intermediate Host SaaS & Live Companion)**: Status of QR voucher validation, Twenty CRM bridge, WhatsApp bot.

3. **Pune Pilot MVP Readiness Check**:
   - Prime locations: Amanora, Seasons Mall, Magarpatta Cybercity, Hadapsar, Viman Nagar.
   - Data seed status (`src/data/pune-pilot.ts`).
   - Hostless / In-house curation model (`PILOT_HOST` / La Vivenzia Curations).

4. **External Blockers & Founder Decisions**:
   - Razorpay Live Merchant Account activation (test keys vs live credentials).
   - Meta WhatsApp Cloud API credentials & webhook verification for Live Travel Companion.
   - Host voucher redemption app (camera QR scanner for restaurant/experience staff).
   - Twenty CRM event ingestion synchronization.

---

## Required Deliverables

1. **Update `docs/ROADMAP_IMPLEMENTATION_AUDIT.md`**:
   - Date: 2026-11-05.
   - Updated executive summary reflecting current 953 tests, newly built modules (FinOps metering, AI itinerary synthesis, Google Maps New API).
   - Phase-by-phase status table (Phases 0–12) with exact file evidence.
   - Detailed production readiness assessment for Pune Pilot MVP.

2. **Update `docs/FOUNDER_DECISIONS_AND_BLOCKERS.md`**:
   - Date: 2026-11-05.
   - Precise list of remaining blockers for production go-live with risk levels and lead times.

3. **Preserve Code Stability**:
   - Do not modify application logic or delete existing working code.
   - Only update documentation files and ensure tests continue to pass.
