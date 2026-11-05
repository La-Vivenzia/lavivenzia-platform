# Master Engineering Specification: Enterprise FinOps API Metering & Cost Tracking Engine

You are building the institutional-grade API Metering, Observability, and FinOps Cost Tracking Engine for the Main La Vivenzia SaaS repository (`lavivenziaSAAS`).

---

## 1. Architectural Answers to Engineering Questions

1. **LLM Providers (Anthropic + Gemini)**:
   - Support **BOTH** `ANTHROPIC` and `GOOGLE_GEMINI`.
   - Anthropic: Claude 3.5 Sonnet ($3.00/1M input tokens, $15.00/1M output tokens), Haiku 3.5 ($0.80/1M input, $4.00/1M output).
   - Google Gemini: Gemini 1.5/2.0 Flash ($0.075/1M input, $0.30/1M output).
2. **Meta WhatsApp Cloud API**:
   - Reserve `META_WHATSAPP` in the provider list with operations:
     - `whatsapp.utility_conv`: ₹0.11 / conversation (11 paise).
     - `whatsapp.marketing_conv`: ₹0.78 / conversation (78 paise).
     - `whatsapp.service_conv`: ₹0.29 / conversation (29 paise; 0 if in-session).
     - `whatsapp.outbound_message`: ₹0.11 / message fallback.
   - The SaaS provides `POST /api/v1/ops/metering` with an API token check (`x-metering-secret` or bearer token matching `METERING_SECRET_KEY` or open in dev) so external microservices (like Twenty CRM / WhatsApp bots) can ingest usage events.
3. **Where to instrument**:
   - Instrument the adapters directly behind their domain interfaces:
     - `src/adapters/maps/google/index.ts` (Google Places autocomplete, details, search).
     - `src/adapters/email/resend/` (Resend transactional emails).
     - `src/adapters/llm/anthropic/` (Claude LLM requests).
     - Wrap calls transparently using the Metering Service so business logic remains clean.
4. **Units and Precision**:
   - **USD Minor Units**: Micro-dollars (1 USD = 1,000,000 micro-dollars).
   - **INR Minor Units**: Integer paise (1 INR = 100 paise).
   - **Exchange Rate**: Integer `PAISE_PER_USD = 8600` (86.00 INR per USD baseline).
   - Strict integer math: `Math.round(...)` or `BigInt` — zero floating-point accumulation drift.
5. **Storage & Durability**:
   - **Primary Storage**: In-memory ring buffer (up to 10,000 events) with sliding window aggregation for `today`, `thisWeek`, `thisMonth`.
   - Non-blocking / fire-and-forget: Metering operations MUST NEVER throw or block customer queries (Places search, checkout, email sending). If recording fails, catch internally and log a warning.
6. **Razorpay Fee Calculation**:
   - Standard configured rate: 2% gateway fee + 18% GST on the fee = 2.36% of gross transaction amount (`Math.round(amountPaise * 236 / 10000)`).
   - Operation: `razorpay.payment_fee`.

---

## 2. File Architecture & Modules to Create

### `src/modules/metering/types.ts`

- `ApiProvider`: `'GOOGLE_PLACES' | 'GOOGLE_GEMINI' | 'ANTHROPIC' | 'META_WHATSAPP' | 'RESEND' | 'RAZORPAY'`
- `ApiOperation`:
  - Places: `'places.autocomplete' | 'places.searchText' | 'places.details' | 'places.photos'`
  - Gemini: `'gemini.flash_input' | 'gemini.flash_output' | 'gemini.flash_total'`
  - Anthropic: `'anthropic.sonnet_input' | 'anthropic.sonnet_output' | 'anthropic.haiku_input' | 'anthropic.haiku_output'`
  - WhatsApp: `'whatsapp.utility_conv' | 'whatsapp.marketing_conv' | 'whatsapp.service_conv' | 'whatsapp.outbound_message'`
  - Email: `'email.transactional_send'`
  - Payment: `'razorpay.payment_fee'`
- `ApiUsageEvent`:
  - `id: string`
  - `provider: ApiProvider`
  - `operation: ApiOperation`
  - `units: number` (calls, tokens, conversations, or transaction paise)
  - `costMinorInr: number` (integer paise)
  - `costMicroUsd: number` (integer micro-dollars)
  - `latencyMs: number`
  - `status: 'SUCCESS' | 'ERROR'`
  - `timestamp: string` (ISO 8601)
  - `metadata?: Record<string, unknown>`
- `FinOpsCostSummary`:
  - `period: 'today' | 'this_week' | 'this_month' | 'all_time'`
  - `totalCostInrPaise: number`
  - `totalCostInrFormatted: string` (e.g. "₹42.50")
  - `totalCostMicroUsd: number`
  - `totalRequests: number`
  - `errorCount: number`
  - `providerBreakdown: Record<ApiProvider, { requestCount: number; costInrPaise: number; costFormatted: string }>`
  - `budgetAlert: { triggered: boolean; monthlyBudgetCapInr: number; currentSpendInr: number; percentageUsed: number }`

### `src/modules/metering/rates.ts`

Pricing constants and calculation functions:

- Google Places API (New):
  - `places.autocomplete`: $2.83 / 1,000 calls = 2,830 micro-dollars/call
  - `places.searchText`: $32.00 / 1,000 calls = 32,000 micro-dollars/call
  - `places.details`: $17.00 / 1,000 calls = 17,000 micro-dollars/call
  - `places.photos`: $7.00 / 1,000 calls = 7,000 micro-dollars/call
- Anthropic:
  - Sonnet 3.5: Input $3.00/1M tokens (3 micro-dollars/token); Output $15.00/1M tokens (15 micro-dollars/token)
  - Haiku 3.5: Input $0.80/1M tokens (0.8 micro-dollars/token); Output $4.00/1M tokens (4 micro-dollars/token)
- Google Gemini 1.5/2.0 Flash:
  - Input tokens: $0.075 / 1M tokens
  - Output tokens: $0.30 / 1M tokens
- Meta WhatsApp (India):
  - `whatsapp.utility_conv`: 11 paise
  - `whatsapp.marketing_conv`: 78 paise
  - `whatsapp.service_conv`: 29 paise
  - `whatsapp.outbound_message`: 11 paise
- Resend:
  - `email.transactional_send`: $0.00028 per send (280 micro-dollars)
- Pure function: `calculateApiCost(provider: ApiProvider, operation: ApiOperation, units: number): { costMinorInr: number; costMicroUsd: number }`

### `src/modules/metering/service.ts`

- Singleton `MeteringService` class:
  - Circular buffer / memory array capped at 10,000 entries.
  - `record(event: Omit<ApiUsageEvent, 'id' | 'costMinorInr' | 'costMicroUsd' | 'timestamp'>): ApiUsageEvent` (calculates cost, inserts into buffer, non-blocking).
  - `getSummary(period?: 'today' | 'this_week' | 'this_month' | 'all_time'): FinOpsCostSummary`
  - `getRecentEvents(limit?: number): ApiUsageEvent[]`
  - `clear(): void` (useful for test resets).
  - Export `getMeteringService()` singleton factory.

### `src/adapters/maps/google/index.ts`

- Instrument Google Places calls (`autocomplete`, `details`, etc.) with `getMeteringService().record(...)`.

### `src/adapters/email/resend/`

- Instrument email sending calls with `email.transactional_send`.

### `src/adapters/llm/anthropic/index.ts`

- Instrument LLM token usage with Anthropic pricing.

### `src/app/api/v1/ops/metering/route.ts`

- `GET`: Return `{ success: true, summary: FinOpsCostSummary, recentEvents: ApiUsageEvent[] }`.
- `POST`: Ingest usage event payload from external services (CRM, WhatsApp worker) with validation.

---

## 3. Test Requirements (`tests/unit/metering.test.ts`)

- Unit tests covering:
  1. Rate calculations for each provider and operation (exact integer paise and micro-dollars).
  2. Ring buffer storage, trimming at capacity, and timestamp filtering.
  3. Summary calculations (today, this_week, this_month, provider breakdown).
  4. Budget alert triggering at the ₹5,000 monthly threshold.
  5. Failure isolation (invalid input or throwing handlers do not crash).
  6. API route GET and POST handlers with mocked or real requests.
- All existing tests in the repository must continue to pass (`npm test`).

---

## 4. Execution Directive

Please implement all files, wire the instrumentation into existing adapters, write comprehensive tests, ensure `npm test` and `npm run typecheck` succeed 100%, and summarize all deliverables.
