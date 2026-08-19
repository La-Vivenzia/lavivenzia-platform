# La Vivenzia — Project Constitution

## 1. Project Identity

**Product:** La Vivenzia  
**Category:** Curated experiential tourism marketplace and travel intelligence platform  
**Launch target:** Production product launch in 2 months  
**Primary platform for launch:** Responsive, mobile-first web application

La Vivenzia is not a simple travel-listing website. The launch product must establish a real marketplace foundation that can later evolve into AI discovery, mobile experiences, creator commerce, Experience OS and global travel intelligence.

## 2. Product Objective

Launch a functioning curated experience marketplace where:

- Travellers can discover experiences and destinations.
- Travellers can search, filter, personalize, save and book.
- Hosts can onboard, create listings, manage availability and operate bookings.
- Operations/admin teams can approve, moderate, audit and manage the commercial ecosystem.
- Payments, invoices, cancellations, refunds and notifications work reliably.
- AI discovery is integrated into the core discovery experience.
- The architecture can evolve without a major rebuild.

## 3. Product Principles

1. Mobile-first
2. AI-native
3. Modular
4. API-first
5. Data-driven
6. Trust-first
7. Production-first
8. Consistent design system
9. Security and privacy by default
10. Do not over-engineer before the requirement exists

## 4. Launch Scope

### Traveller

- Landing/home
- Destination/city pages
- Experience/category discovery
- Search, filters and sorting
- Map-based discovery
- Experience detail
- Authentication
- Profile/preferences
- Wishlist
- Saved itineraries
- Cart/checkout
- Booking history
- Invoices/vouchers
- Cancellation/refund visibility
- AI discovery
- AI shortlist
- AI itinerary generation
- Regenerate/edit/save itinerary

### Host

- Registration
- Onboarding
- Verification/KYC workflow
- Listing creation/editing
- Media
- Pricing
- Capacity
- Availability/slots
- Policies
- Booking management
- Guest information
- Revenue/booking analytics
- Reviews
- Notifications

### Admin / Operations

- Dashboard
- User management
- Host verification
- Experience approval
- Content moderation
- Booking oversight
- Refund/dispute handling
- Commission configuration
- Revenue/payout visibility
- Audit logs
- Roles/permissions
- Operational task queue
- System configuration

### Commerce

- Razorpay
- Booking checkout
- GST invoice generation
- Digital vouchers
- Refunds
- Cancellation
- Rescheduling/modification
- Commission calculation
- Host payout ledger
- Payment reconciliation

### Trust

- Verification
- Quality scoring
- Audit trail
- Suspicious activity flags
- Abuse/review reporting
- Consent/privacy controls
- Rate limiting
- Secrets management
- Encryption
- Backup/recovery

## 5. Technology Direction

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Node.js
- TypeScript
- Modular service architecture
- REST/API-first boundaries

### Data

- PostgreSQL
- Prisma
- pgvector for semantic/vector capability

### Search

- Structured search
- Semantic search
- Vector similarity
- Relevance ranking

### Infrastructure

- AWS or equivalent production cloud
- Object storage
- CDN where justified
- Automated backups
- Monitoring/error tracking
- CI/CD
- Development/staging/production separation

### Integrations

- Google Maps APIs
- Razorpay
- LLM provider + orchestration layer
- Email
- SMS/WhatsApp where required
- PostHog/Mixpanel
- n8n/event-driven automation where required

## 6. Architecture Rules

- Prefer a modular monolith initially.
- Keep clear module boundaries.
- Do not create microservices just for architectural aesthetics.
- Database ownership must remain explicit.
- Business logic must not be scattered through UI components.
- External integrations must be isolated behind service adapters.
- Secrets must never be committed.
- Production credentials must be company-controlled.
- Every important financial operation must be auditable.
- AI must not bypass deterministic business rules.
- Booking/payment state must be deterministic and server-authoritative.

## 7. Development Rules for Antigravity

Before changing code:

1. Read `PROJECT.md`.
2. Read `REQUIREMENTS.md`.
3. Read `DESIGN.md`.
4. Read `SYSTEM_DESIGN.md`.
5. Read `WIREFRAME.md`.
6. Inspect the existing repository.
7. Identify existing components/modules before creating new ones.
8. Plan the change.
9. Implement only the requested scope.
10. Run typecheck/lint/tests/build where applicable.
11. Check responsive behavior.
12. Check design-system consistency.
13. Check security and error handling.
14. Update documentation if architecture or requirements changed.

Never blindly rewrite the repository.

## 8. Definition of Done

A feature is not done when it merely renders.

It must have:

- Correct business behavior
- Correct loading state
- Correct empty state
- Correct error state
- Responsive UI
- Accessibility basics
- Validation
- Security controls where relevant
- API error handling
- Database consistency
- Tests appropriate to risk
- No unrelated regressions
- Documentation updated when needed

## 9. Out of Scope for Initial Launch Unless Explicitly Approved

- Kubernetes
- Multi-region infrastructure
- Dedicated search cluster
- Dedicated vector database
- Complex microservice deployment
- Full creator economy
- Global payment expansion
- Advanced ML recommendation training
- Autonomous multi-agent travel council
- Global Experience OS
- Complex mobile apps if they threaten the 2-month web launch

These belong to the broader product roadmap, not the minimum launch architecture.
