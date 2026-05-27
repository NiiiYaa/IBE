# Self-Onboarding Design Spec

**Date:** 2026-05-27  
**Status:** Approved

---

## Overview

Self-Onboarding is a standalone product that allows hotel staff to independently onboard their hotel onto the HyperGuest (HG) platform — connecting their existing Channel Manager, PMS, or CRS to HG without requiring manual assistance from the HG team.

HG already has working integrations with tens of CM/PMS/CRS systems. This feature does not build new integrations — it automates the process of activating an existing integration for a specific hotel, guided by a wizard UI and supported by an AI assistant.

**End state of a successful onboarding:**
- Hotel entity created in HG with full static data (images, address, rooms, occupancy, taxes, metadata)
- ARI (Availability, Rates, Inventory) flowing from the hotel's system into HG
- Test bookings confirmed by the hotel user

**Core principle:** Minimum friction for the hotel user. Everything that can be auto-discovered (from the hotel website, IBE, location-based data, HG internal data) is collected automatically. The hotel user only provides or confirms what cannot be inferred.

---

## System Architecture

### New Monorepo Apps

**`apps/onboarding`**
- Next.js 14 frontend
- Deployed at `onboard.hyperguest.com`
- Public landing page + token-gated wizard UI

**`apps/onboarding-api`**
- Fastify API (same pattern as `apps/marketplace-api`)
- Deployed at `onboard-api.hyperguest.com`
- Handles: invitation management, session state, step execution, SSE progress streaming, WebSocket live chat, AI assistant, notifications

### New Monorepo Package

**`packages/onboarding-flows`**
- Vendor flow definitions as typed TypeScript plugin objects
- Imported by `apps/onboarding-api` (execution) and `apps/admin` (vendor selector UI)
- One file per vendor: `src/flows/siteminder.ts`, `src/flows/cloudbeds.ts`, etc.
- Central registry: `src/index.ts` exports `VENDOR_FLOWS: Map<string, VendorFlow>`

### Shared With Existing System

- `packages/shared` — Zod types, reused as-is
- `apps/api` — called internally by `onboarding-api` via HTTP for: test bookings (`test-bookings.service.ts`), external IBE scraper (`external-ibe-scraper.service.ts`, `external-ibe.service.ts`), HG client (hotel entity creation, ARI validation). HG API endpoints for hotel entity creation and ARI to be provided separately and integrated into `onboarding-api`.
- `apps/admin` — new **Onboarding module** added (invitations + session tracking + live chat)

### Data Stores

- **Database:** New Prisma models (`OnboardingInvitation`, `OnboardingSession`, `OnboardingHelpRequest`) in the existing schema, prefixed `Onboarding*`
- **Redis:** Session state cache, invitation token cache, WebSocket presence

---

## Invitation & Authentication

### Two Entry Paths

**HG-initiated:**
An admin in `apps/admin` creates an invitation by entering: hotel contact email, hotel name, website URL, CM/PMS/CRS vendor, optional org link. The system generates a unique token and dispatches it via email or webhook.

**Self-registration:**
A public landing page on `onboard.hyperguest.com` lets a hotel staff member enter: hotel name, website URL, contact name, email, and select their CM/PMS/CRS. This creates a pending invitation and sends the token link automatically. Self-registration entries appear in the admin module for HG team visibility.

### Invitation Token

- Cryptographically random token (UUID v4), stored in `OnboardingInvitation`
- Expiry configurable per invitation (default: 7 days), enforced on every token-use attempt
- Single-use for session creation; token is consumed when the session is first created
- Expired unused invitations show a "Request a new link" prompt to the hotel user
- HG admin can resend or revoke any invitation

### Session Authentication

- On first visit to `/start/[token]`: token validated, `OnboardingSession` created, signed session cookie set on `onboard.hyperguest.com`
- All subsequent requests authenticated by session cookie — the raw token is not stored client-side after first use
- Session can be resumed: returning users are restored to their last incomplete step with all data intact

### DB Models

```
OnboardingInvitation {
  id
  token (unique, indexed)
  email
  hotelName
  websiteUrl
  vendorId
  orgId (nullable — links to HG org if HG-initiated)
  createdByAdminId (nullable)
  expiresAt
  usedAt (nullable)
  status: pending | active | completed | expired | revoked
  createdAt
  updatedAt
}

OnboardingSession {
  id
  invitationId (FK)
  currentStepId
  completedSteps (JSON array of step IDs)
  collectedData (JSON, encrypted at rest)
  hgPropertyId (nullable — set once hotel entity is created in HG)
  vendorId
  status: in_progress | completed | abandoned
  lastActivityAt
  createdAt
  updatedAt
}

OnboardingHelpRequest {
  id
  sessionId (FK)
  requestedAt
  resolvedAt (nullable)
  resolvedByAdminId (nullable)
  notes (nullable)
}
```

---

## Vendor Flow Plugin System

Each vendor is a TypeScript object implementing the `VendorFlow` interface, registered in `packages/onboarding-flows`.

### `VendorFlow` Interface

```typescript
interface VendorFlow {
  id: string                      // e.g. 'siteminder', 'cloudbeds', 'opera'
  name: string                    // display name
  logoUrl?: string
  estimatedMinutes: number        // shown to hotel user upfront
  steps: VendorStep[]             // ordered list of steps
  credentialsSchema: ZodSchema    // credentials to collect from hotel user
  enrichHotelData: (ctx: OnboardingContext) => Promise<PartialHotelData>
  validateConnection: (ctx: OnboardingContext) => Promise<ValidationResult>
  triggerAriSync: (ctx: OnboardingContext) => Promise<void>
}
```

### `VendorStep` Interface

```typescript
interface VendorStep {
  id: string
  title: string
  description?: string
  type: 'automated' | 'user_action' | 'data_review' | 'credentials' | 'confirmation' | 'test_booking'

  // automated: system executes, hotel user sees progress indicator
  execute?: (ctx: OnboardingContext) => Promise<StepResult>

  // user_action: instructions shown to hotel user, system polls for confirmation
  instructions?: (ctx: OnboardingContext) => StepInstructions  // markdown + optional image URLs
  poll?: (ctx: OnboardingContext) => Promise<boolean>          // true = action confirmed
  pollIntervalMs?: number
  pollTimeoutMs?: number

  // test_booking: delegates to existing test-bookings service
  // hotel user confirms booking appeared in their system; auto-cancels on confirm

  // optional: metadata for AI knowledge base context
  aiContext?: string              // vendor-specific help text for this step
  estimatedMinutes?: number
}
```

### `OnboardingContext`

Passed to every flow function — carries all accumulated state:
```typescript
interface OnboardingContext {
  session: OnboardingSession
  invitation: OnboardingInvitation
  credentials: Record<string, unknown>   // collected vendor credentials
  hotelData: PartialHotelData            // enriched + user-verified hotel data
  hgPropertyId?: number                  // set after hotel entity created in HG
  vendorFlow: VendorFlow
}
```

### Extensibility

The `VendorStep` type union and `VendorFlow` interface are intentionally open for extension. Vendor-specific step metadata (screenshots, external URLs, conditional branching based on context) is supported via the `aiContext` field and optional custom fields per step. Adding a new vendor = adding one file to `packages/onboarding-flows/src/flows/`.

---

## Onboarding State Machine

### Session Lifecycle

```
created → enrichment → data_review → credentials → [vendor steps] → test_booking → completed
```

Vendor steps are injected from `VendorFlow.steps` — the sequence and count vary per vendor.

### Step Execution Rules

- Steps execute sequentially; a step cannot start until the previous is completed
- **Automated steps** run server-side; progress streamed to frontend via SSE
- **User-action steps** display instructions, then poll HG or the vendor API at `pollIntervalMs` until confirmed or `pollTimeoutMs` is reached
- **Data review step** is always present; pre-filled by enrichment pipeline; hotel user verifies and edits
- **Test booking step** uses the existing `test-bookings.service.ts` via HTTP call to `apps/api`; hotel user confirms booking appeared in their system; system auto-cancels the booking

### Persistence

Step state is written to `OnboardingSession.completedSteps` and `OnboardingSession.currentStepId` after every transition. No state is lost on page refresh or API restart.

### Stuck Detection & Notifications

A background job (cron, every 5 minutes) checks active sessions:
- Automated step with no progress for **30 minutes** → HG team alert
- User-action step with no progress for **2 hours** → HG team alert
- Any step failure after retries → immediate HG team alert

Alerts sent via email + internal webhook. Alert payload includes: session ID, hotel name, vendor, step, error, time stuck.

### Help Request & Live Assistance

- Hotel user has a persistent "Request Help" button in the wizard header
- Triggering it creates an `OnboardingHelpRequest` record and notifies the HG team immediately
- Admin module surfaces active help requests as a notification badge
- **Live chat:** WebSocket connection (brokered by `onboarding-api`) between the hotel user's wizard and the admin session view
- HG team member can: send messages, re-trigger automated steps, mark a user-action step as manually verified/bypassed, extend invitation expiry

---

## Data Enrichment Pipeline

Runs at session start, after invitation token is consumed. Sources are tried in order; failures are silent (result in empty fields, not errors).

### Sources (in order)

1. **HG internal data** — if hotel partially exists in HG, pull available fields
2. **Hotel website scrape** — name, address, contacts, amenities, description, images (via `external-ibe-scraper.service.ts` + Playwright)
3. **External IBE analysis** — room names, board types, rate structure (via `external-ibe.service.ts`)
4. **Google Business / Data Provider** — address verification, coordinates, reviews score, photos (via `data-provider.service.ts`)
5. **Location-based defaults** — given city + country: VAT rate, city tax, currency, language, timezone, check-in/check-out norms (static lookup tables — country/city tax database, v1 ships with a curated dataset)
6. **Vendor-specific enrichment** — `VendorFlow.enrichHotelData()` — vendor may expose a property lookup API by property ID

### Result

A `PartialHotelData` object with a confidence score per field:
- **High confidence** → pre-filled, shown as read-only with an "Edit" affordance
- **Low confidence** → shown as a suggestion, user is prompted to verify
- **Missing** → shown as an empty required or optional field

The data review step presents a pre-filled form, not a blank one.

---

## Admin Module (`apps/admin`)

A new section in `apps/admin`, accessible to super-admins and org admins.

### Invitations Tab

- Create invitation form: email, hotel name, website URL, vendor selector, optional org link. Dispatches email or webhook.
- Invitation list: status badge, created by, sent at, expiry, resend / revoke actions
- Self-registration entries appear here automatically (auto-sent, visible for HG team awareness)

### Active Sessions Tab

- Real-time list: hotel name, vendor, current step, time in step, status indicator (on-track / stuck / help-requested / failed)
- Stuck and help-requested sessions sorted to top, highlighted
- Click into any session:
  - Step-by-step progress timeline with timestamps
  - Collected data (read-only)
  - Error log
  - **Live chat panel** (WebSocket)
  - Actions: re-trigger step, mark step as manually verified, extend expiry

### Completed Tab

- Full history with audit trail: every step, timestamp, actor, duration
- Export to Excel

### Notifications

- Configurable per-org: which events trigger email alerts to HG team
- Events: session stuck, step failed, help requested, onboarding completed

---

## Self-Help AI

Same architecture as the existing IBE AI assistant — SSE-based, system AI adapter.

### Context Injection

Every AI prompt is automatically enriched with: current step, vendor, step history, any errors, and the hotel user's collected data summary. The hotel user never needs to explain their situation.

### Proactive Mode (system-triggered)

- Step fails or times out → AI surfaces targeted explanation + recovery instructions for this vendor + step
- User-action polling times out → AI shows step-by-step guide (with screenshots if available in knowledge base)
- No session progress for X minutes → AI sends a gentle check-in nudge

### Reactive Mode (always-available chat)

- Collapsed chat bubble, bottom-right of wizard
- Hotel user asks anything; AI answers with vendor and step context
- Examples: "where do I find my property ID in Siteminder?", "what is a rate plan?", "why is step 3 failing?"

### Knowledge Base

- Vendor-specific documentation (provided separately, injected as system context per vendor)
- General hospitality concepts (ARI, rate plans, channel managers, board types, etc.)
- HG platform guidance

### Escalation

If the AI cannot resolve the issue after 2–3 exchanges, it proactively offers to escalate to the HG team (triggers the help request flow).

### Implementation

`apps/onboarding-api/src/services/onboarding-ai.service.ts` — thin wrapper around existing AI adapter, with onboarding-specific context injection.

---

## Frontend (Wizard UI)

### Routes

| Path | Description |
|------|-------------|
| `/` | Public landing + self-registration |
| `/start/[token]` | Token validation + session init, redirects to wizard |
| `/onboarding/[sessionId]` | Main wizard |
| `/onboarding/[sessionId]/complete` | Completion page |

### Landing Page (`/`)

- HyperGuest branding, value proposition
- Self-registration form: hotel name, website URL, contact name, email, vendor selector (logos + names)
- On submit → "Check your inbox" confirmation

### Wizard (`/onboarding/[sessionId]`)

- **Top progress bar:** all steps, current position, completed checkmarks, estimated time remaining
- **Step content area:** changes per step type:
  - `automated` → spinner + SSE progress log
  - `data_review` → pre-filled form with confidence indicators
  - `credentials` → vendor credential form (schema-driven from `VendorFlow.credentialsSchema`)
  - `user_action` → rich instruction panel (markdown + screenshots) + "I've done this" button + polling indicator
  - `test_booking` → booking details + "Confirm this appeared in your system" button
- **AI assistant panel:** collapsed chat bubble bottom-right; proactive messages appear as toast notifications that expand into the chat panel
- **"Request Help" button:** always visible in header
- **Session resume:** returning users land at their current step with all data intact

### Completion Page

- Celebration screen
- Summary: what was set up, HG property details
- Link to HG platform

---

## Error Handling & Recovery

- **Per-step retry:** Every step can be retried. Errors shown as human-readable messages (not stack traces) with a "Try again" button. AI proactively surfaces likely cause.
- **Invitation expiry:** In-progress sessions are unaffected by expiry (expiry only gates initial token redemption). Expired unused invitations show "Request a new link".
- **Session abandonment:** Sessions idle for 30 days are marked `abandoned`. Admin module flags these; re-invitation can be triggered.
- **Partial hotel entity:** If HG property creation succeeded before a later step fails, the HG property ID is persisted. On retry, the step resumes from the failure point — no duplicate hotel entities.
- **Vendor API downtime:** Step fails gracefully with "vendor system may be temporarily unavailable"; hotel user prompted to retry later or request HG assistance.
- **Enrichment failure:** Silent — results in more empty fields, never blocks the session.
- **Webhook delivery failure:** 3 retries with exponential backoff; on final failure, alerts the admin who created the invitation.

---

## Implementation Phasing

This spec describes the full system. Implementation is expected to proceed in phases:

- **Phase 1:** Core framework — invitation flow, session, wizard engine, data enrichment pipeline, one vendor end-to-end, basic admin module (invitations + session tracking)
- **Phase 2:** AI assistant, live chat / help request, stuck detection, notifications, 3–5 vendor flows
- **Phase 3:** Self-registration public landing page, full admin audit trail, Excel export, additional vendors

Each phase is independently deployable. HG APIs for hotel entity creation will be integrated in Phase 1.

---

## Out of Scope (v1)

- White-labeling per org (deferred — architecture supports it)
- Self-registration abuse prevention / rate limiting (add before public launch)
- Mobile app
- Multi-user onboarding (one session = one hotel user)
- Building new HG integrations (only existing integrations are activated)
