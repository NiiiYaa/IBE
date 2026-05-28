# Self-Onboarding Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core self-onboarding framework — three entry points, IBE-driven data harvest, session state machine, Mews ARI connection, and admin module — so a hotel can be onboarded with minimal manual input and reach "pending review" without HG team involvement during the wizard. HG staff approves the final go-live step.

**Three entry points — all feed the same wizard:**
1. **Hotel self-registration** — hotel lands on `onboarding.hyperguest.net`, fills name + city + country, enters wizard immediately. Harvest runs live in the hotel's session.
2. **HG staff invitation** — HG staff creates invitation in IBE admin (hotel name + IBE URL). System immediately runs data harvest in the background. When harvest completes → invitation email is sent automatically to the hotel. Hotel clicks link → wizard starts at Data Review (harvest already done, no waiting). If harvest fails → goes into "needs attention" queue in admin + email notification sent to fixed HG staff address.
3. **Zoho CRM/Desk trigger** — *(Phase 2, not implemented here)* Zoho API trigger auto-creates invitation → same pre-harvest flow as staff invitation. Placeholder `source='zoho'` reserved in DB.

**Wizard steps:**

*Self-registration (all steps run in hotel's session):*
1. **Hotel identification** — name + city + country
2. **Candidate search** — Playwright headless browser searches for the hotel, returns candidate URLs/titles as cards. User picks the correct one. Fallbacks: user pastes a URL directly; if no IBE found at all → manual data form.
3. **IBE detection** (automated) — system runs 3-tier detection against the selected URL:
   - Match found → IBE name + harvester identified → proceed to harvest
   - **No match → hotel is shown a `PendingIbeStep`**: "We don't recognise your booking system yet. We've flagged this for our team — we'll email you as soon as we've added support." Hotel's URL is saved. Session status → `pending_ibe_review`. HG staff notified (email + admin queue).
4. **Data harvest** (automated, SSE) — IBE-specific Playwright harvester runs multi-search discovery:
   - **Hotel info / policies page** → name, stars, address, description, images, amenities + general policies where available: check-in/out time, pets, smoking, min age, parking, extra bed. Scraped into `HarvestedPolicy[]`; missing types surfaced in DataReviewStep with common defaults (check-in 15:00, check-out 11:00, pets=not_allowed, smoking=not_allowed, min age=18) for user to confirm/override.
   - **Multiple occupancy searches** (1A / 2A / 3A / 2A+1C / 2A+2C / 1A+1C, dummy dates) — per search: which room types appear (→ `supportedOccupancies`), which board types (→ `discoveredRatePlanTypes[].boardCode`), R/NR options, parse cancellation policy text
   - **Age sweep** (2A + 1C at age 0, 1, 2 … 17) — discovers the hotel's age bracket policy:
     - Priority 1: IBE shows explicit age dropdown/selector → parse categories directly
     - Priority 2: Policy text on page ("Children 0–11 stay free") → parse with regex
     - Priority 3: Detect price changes across the age sweep → bracket boundaries where price changes
     - Produces `DiscoveredAgePolicy { categories, hasTieredChildPricing, source, rawText }`
     - `hasTieredChildPricing: true` when child bracket has multiple price tiers (e.g. age 2–5 ≠ age 6–11) — signals CM may push per-age-group rates
   - **Per room type** (deduplicated across all searches) → name, description, images, bed config, amenities, and the full set of `supportedOccupancies` discovered
   - **One booking/payment page** (any room + any rate) → property-level taxes & fees (resort fee, city tax, service charges); **if unreachable** → fall back to `tax-lookup.service.ts` (curated country/city dataset, `source: 'lookup'`, shown with a "please verify" warning)
   - Result: `HarvestedHotelData` with `policies`, `discoveredRatePlanTypes` (board × R/NR matrix), `agePolicy` — no per-room rate plan list (IBE cannot expose actual CM rate plans)
5. **Data review** — user reviews and edits harvested data.
6. **ARI source selection** — hotel picks their CM/PMS/CRS from a dropdown of all registered ARI sources:
   - Match found → `pmsId` set on invitation → proceed to credentials
   - **No match → hotel types the name of their CM** in a free-text field and submits. Session status → `pending_ari_source`. HG staff notified (email + admin queue). Hotel sees: "Your channel manager isn't supported yet. We've noted it — we'll email you when it's ready."
7. **ARI credentials** — schema-driven form for the selected ARI source (e.g. Mews Channel Manager Code). Skipped if `credentialsSchema` has no fields.
8. **CM settings** — currency, pricing model, per-rate-plan config, tax relations.
9. **HG property creation** (automated, SSE) — creates property in HG Back Office API.
10. **ARI sync trigger** (automated, SSE) — triggers first availability & rates sync.
11. → `pending_review` → HG staff approves → hotel goes live.

*Staff invitation / Zoho trigger (hotel's wizard skips steps 1–4):*
- HG staff creates invitation with hotel name + IBE URL + pmsId → harvest runs in background on the server
- Harvest complete → invitation email sent automatically (via configured email service)
- Hotel opens link → wizard starts at step 5 (Data Review) — no waiting, IBE and ARI source already resolved
- Harvest failed → "needs attention" queue in admin + email to fixed HG staff address; staff retries from admin

**Completion state:** All wizard completions land in `pending_review`. HG staff reviews in IBE admin and explicitly approves → hotel goes live on HyperGuest.

**Architecture:**
- *Self-registration:* form → Playwright candidate search → IBE detection → Playwright data harvest (SSE, live in hotel session) → user reviews → ARI credentials → HG BO API → SSE progress → `pending_review` → admin approval.
- *Staff/CRM invitation:* admin creates invitation with IBE URL → background harvest runs server-side → on complete: email sent to hotel; on fail: admin queue + HG staff email notification → hotel opens link → wizard starts at Data Review → ARI credentials → HG BO API → `pending_review` → admin approval.

Three new units: `apps/onboarding` (Next.js 14 wizard, `onboarding.hyperguest.net`), `apps/onboarding-api` (Fastify port 3003, shares same Prisma schema as `apps/api`), `packages/onboarding-flows` (vendor plugin objects).

**Two completely independent registries — IBE and ARI source are not related:**

| | IBE Registry | ARI Source Registry |
|--|-------------|---------------------|
| What it is | The hotel's public booking website (used for data harvest) | The CM/PMS/CRS pushing inventory to HG |
| Purpose | Select the right Playwright harvester | Drive the wizard flow + HG BO API calls |
| Identified by | URL pattern matching | Hotel/staff declares it (`pmsId`) |
| Lives in | `ibe-harvester-map.ts` + `detectKnownIBE()` (shared) | `packages/onboarding-flows/src/vendors/` |
| Adding a new one | Add URL pattern + write harvester (Claude Code session) | Create one vendor file (Claude Code session) |
| Quick variant | Staff adds hostname to `IBERegistry` DB via admin UI | Always a code change |

A hotel can have any combination — a Sentec IBE with a SiteMinder CM, a custom IBE with a Mews CM, etc. The wizard uses both registries independently: IBE detection drives the harvest; CM selection drives the wizard steps and HG BO API calls.

**Tech Stack:** Next.js 14, Fastify 4, Prisma 5 (shared schema), Playwright (headless, reuses existing scraping infrastructure), Vitest, Zod, undici (HG BO API calls), SSE (same pattern as manual.route.ts), TypeScript ESM

---

## CM Taxonomy (derived from full KB survey of 87 ARI sources)

Three data flow types drive the wizard step sequence. The `VendorFlow.dataFlow` field selects the type.

### hg_pulls (Type 1)
CM pushes static data (rooms, rate plans, content) via ARI; HG reads it. `hasStaticData=true`.
Wizard: harvest → data review → credentials → cm_settings → create property → ARI sync.
Hotel only provides CM credentials. Examples: **Mews**, eZee, 5stelle*, Phobs, A&O, Booklogic, SabeeApp.

### blank (Type 2)
CM pushes ARI only. `hasStaticData=false`. Rooms + rate plans must be pre-created in HG with **exact CM codes** before ARI sync — mismatch = silent failure.
Wizard adds: room code entry + rate plan code entry + room/rateplan creation steps.
Examples: **SiteMinder**, D-EDGE, Roomcloud, ACI Group, AxisRooms, Channex, Ermes, Host PMS, Optima, Spider, Travelline.
Sub-variants:
- `ratePlanCodesProvidedByStaff=true` — CM emails codes to HG (D-EDGE, eRevMax); hotel doesn't enter codes
- `useDefaultCodes=true` — HG auto-generates codes; CM adapts (TravelClick)
- `requiresStaffChannelSetup=true` + blank — staff contacts CM for hotel ID (Cloudbeds, Eviivo)

### reverse_pull (Type 3)
HG creates property with IBE-harvested content; CM pulls static data from HG and adapts its codes to match ours. `hasStaticData=false` in API but **simplest wizard**: no code entry, often no credentials.
Wizard: harvest → data review → [credentials if any] → create property → CM pulls content → ARI sync.
Examples: **Bookito**, Q2B Solutions, 5starDesk, OneHotel, Vioma, Viajes Olympia, STAAH V2 (sometimes), Acigrup, TeamSystem/Figaro.

### Special flags (apply across types)

| Flag | Affects | Examples |
|------|---------|---------|
| `requiresStaffChannelSetup` | All types | Cloudbeds, Eviivo, Shiji, SynXis, RateTiger, Hotetec, LobbyPMS |
| `mandatoryTaxRelations` | cm_settings locked fields | eZee (always 'add'), NextPax, Shiji, SynXis CCX, TravelClick |
| `canOverrideDataFlow` | cm_settings data-flow toggle | STAAH V2 |
| `supportedPricingModels` | cm_settings pricing model | Phobs (one model only) |
| `childrenSupported=false` | DataReview occupancy | LobbyPMS |
| `roomCodeFormat` | DataReview code validation | RoomRaccoon (no underscores) |
| `regionAware` | Admin post-creation action | SiteMinder (Asia/Pacific area) |
| `credentialTransform` | Server-side ID mutation | Phobs (prepend "HG") |
| `ratePlanCodeTransform` | Server-side code mutation | Prestige (append "-{boardCode}") |
| `useDefaultCodes` | Skips code entry | TravelClick |
| `ratePlanCodesProvidedByStaff` | Hides code fields | D-EDGE, eRevMax |

---

## Adding a New ARI Source (CM / PMS / CRS)

The vendor plugin system is designed for low-ceremony extension. Adding a new ARI source is a single-file operation that does not touch the DB, admin UI, or wizard rendering code.

Each addition is done in a **Claude Code session**: open the session, say "add [CM name] as an ARI source", and the session reads the KB article, creates the vendor file, registers it, runs tests, and commits. No manual coding required.

### Process (Claude Code session)

1. **Read the CM's KB article** (or HG BO API docs). Identify:
   - Data flow type: `hg_pulls` / `blank` / `reverse_pull`
   - Credentials required (field names, formats)
   - Any special flags from the table above
   - Whether HG staff must coordinate with the CM (`requiresStaffChannelSetup`)

2. **Create the vendor file** using `createVendorFlow()`:

   ```
   packages/onboarding-flows/src/vendors/{cm-kebab-name}.ts
   ```

   ```typescript
   import { z } from 'zod';
   import { createVendorFlow } from '../factory.js';

   export const channelManagerXFlow = createVendorFlow({
     pmsId: 999,
     pmsName: 'Channel Manager X',
     dataFlow: 'blank',
     requiresStaffChannelSetup: true,
     staffChannelSetupNote: 'Hotel must add HyperGuest in CM X dashboard under Settings → Channels.',
     credentialsSchema: z.object({
       propertyId: z.string().min(1, 'Property ID is required'),
     }),
     validateConnection: async (ctx) => {
       if (!ctx.credentials.propertyId) return { valid: false, message: 'Property ID is required' };
       return { valid: true };
     },
     getHGPropertyPayload: (ctx) => ({
       property: { name: ctx.enrichedData.hotelName, pmsId: 999 },
       propertySource: { hasStaticData: false, data: { propertyId: ctx.credentials.propertyId } },
     }),
   });
   // Steps are auto-generated by defaultStepsFor('blank') inside createVendorFlow — override only if needed.
   ```

   - `reverse_pull` with no credentials: ~15 lines (set `credentialsSchema: z.object({})`)
   - `blank` with staff coordination: ~25 lines
   - Complex CM with transforms/flags: ~50 lines

3. **Register it** — one line in `registry.ts`:

   ```typescript
   import { channelManagerXFlow } from './vendors/channel-manager-x.js';
   registry.set(999, channelManagerXFlow);
   ```

4. **Run tests** — `validateVendorFlow()` runs automatically on every registered flow at module load time:

   ```bash
   cd packages/onboarding-flows && pnpm vitest run
   ```

5. **Deploy** — no DB migration, no admin UI change, no feature flag. The wizard resolves the vendor by `pmsId` from the invitation; the new CM is immediately available.

### Updating/correcting an existing ARI source

Open a Claude Code session, describe the change. The session edits the single vendor file, re-runs tests, deploys. The registry entry does not change.

### Time estimates (per Claude Code session)

| ARI source type | Effort |
|----------------|--------|
| `reverse_pull`, no credentials | 30 min |
| `hg_pulls`, credentials only | 45 min |
| `blank`, staff channel setup | 1–2 hr |
| `blank` with transforms + mandatory tax relations | 2–3 hr |

---

## Adding a New IBE (or Updating an Existing One)

The IBE registry drives data harvest only — it has nothing to do with the ARI source registry. A hotel's IBE and their CM/PMS are two completely separate systems with no implied relationship.

**13 IBE types are already identified** in `packages/shared/src/utils/known-ibe-registry.ts` (built for the external IBE integration feature). Their URL detection patterns, hotel ID extraction logic, and search URL templates are reused here with no duplication — the IBE detector calls `detectKnownIBE()` from that package as its first pass.

> **IBE patterns are shared platform infrastructure.**
> `packages/shared` is imported by every app in the monorepo. Any IBE pattern added to `known-ibe-registry.ts` is immediately available to **all features** — self-onboarding IBE detection, external IBE integration (price comparison, booking widget URL templates), and any future feature that calls `detectKnownIBE()`. Adding one IBE benefits the entire platform, not just onboarding.
>
> The only thing that is onboarding-specific is the full **Playwright harvester** (`apps/onboarding-api/src/services/harvesters/`), which runs the deep multi-occupancy scrape, age sweep, and policy parsing needed for self-onboarding. The URL templates in the shared registry are sufficient for all other features and do not need the harvester.

### Two sub-cases

**Sub-case A — New variant of a known IBE type (staff task, no deployment)**

Example: We already have a Sentec harvester. A new hotel uses Sentec but on a hostname we haven't seen before.

→ HG staff adds the hostname to `IBERegistry` via admin UI. No code, no deployment. The existing Sentec harvester picks it up automatically.

**Sub-case B — Brand new IBE type never seen before (Claude Code session)**

Example: A hotel uses an IBE brand we've never encountered.

Open a Claude Code session:
1. Investigate the IBE URL structure and page layout (using existing Playwright investigation methodology)
2. Add URL detection to `packages/shared/src/utils/known-ibe-registry.ts` — either a `domainPattern` regex or a `paramFingerprint` function + `extractHotelId`
3. Write the Playwright harvester: `apps/onboarding-api/src/services/harvesters/{ibe-name}-harvester.ts`
   - Hotel info page → name, stars, address, description, images, amenities, policies
   - Multiple occupancy searches using the new `searchTemplate` → rooms + board types + R/NR options
   - Age sweep (2A + 1C at ages 0–17)
   - One payment/booking page → property-level taxes & fees
4. Register it in `ibe-harvester-map.ts`: one line mapping IBE name → harvester
5. Deploy

### Updating/correcting an existing IBE harvester

Open a Claude Code session, describe what changed (IBE redesigned their page, new URL format, scraping broke). The session edits the harvester file and/or the detection pattern. The registry entry (`ibe-harvester-map.ts`) does not change unless the IBE name changed.

### IBE detection pipeline (3 tiers, in order)

1. `detectKnownIBE(url)` from `packages/shared` — matches the 13 already-known IBE types via domain pattern or query-param fingerprint. Returns IBE name + hotel ID + search URL template instantly.
2. `IBERegistry` DB lookup by hostname — HG staff can register new hostnames → IBE name mappings via admin UI without any deployment.
3. No match → session status set to `pending_ibe_review` → surfaced to HG staff queue; hotel waits. Staff identifies the IBE, then either adds it to the DB (sub-case A) or opens a Claude Code session to add a full harvester (sub-case B).

### Time estimates (per Claude Code session)

| IBE type | Effort |
|----------|--------|
| New hostname of known IBE type | Staff DB entry, 5 min, no session needed |
| New IBE with clean DOM, no bot protection | 1–2 hr |
| New IBE with complex URL structure or heavy JS | 2–4 hr |
| Fixing a broken harvester (page layout changed) | 30–60 min |

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/prisma/schema.prisma` | Modify | Add OnboardingInvitation (source, zohoRecordId, ibeUrl, ibePattern, harvestStatus, harvestedData, failureReason, harvestNotifiedAt), OnboardingSession, OnboardingHelpRequest |
| `apps/api/src/routes/onboarding-admin.route.ts` | Create | Admin routes: POST/GET/DELETE invitations, GET sessions, PUT sessions/:id/approve, PUT sessions/:id/resolve-ibe (after IBE added → resume session + email hotel), PUT sessions/:id/resolve-ari-source (after VendorFlow added → resume session + email hotel), POST invitations/:id/retry-harvest |
| `apps/api/src/services/onboarding-invitation.service.ts` | Create | Create/list/revoke invitations; triggerBackgroundHarvest; sendInvitationEmail; notifyHarvestFailure; notifyUnknownIbe; notifyUnknownAriSource |
| `apps/api/src/services/onboarding-email.service.ts` | Create | Sends invitation email to hotel (via configured email provider) and failure notification to fixed HG staff address |
| `packages/onboarding-flows/package.json` | Create | New package declaration |
| `packages/onboarding-flows/src/types.ts` | Create | VendorFlow, OnboardingContext, StepResult, HarvestedHotelData (hotel info + rooms + rate plans + property-level taxes/fees) types |
| `packages/onboarding-flows/src/factory.ts` | Create | `createVendorFlow()` factory + `defaultStepsFor(dataFlow)` + `validateVendorFlow()` |
| `packages/onboarding-flows/src/vendors/siteminder.ts` | Create | SiteMinder vendor plugin (blank data flow) — first registered ARI source; validates the full factory pattern including user_action step and regionAware flag. Mews added as a subsequent vendor. |
| `packages/onboarding-flows/src/registry.ts` | Create | Map pmsId → VendorFlow; runs validateVendorFlow() on all registered flows at startup |
| `packages/onboarding-flows/src/index.ts` | Create | Re-exports |
| `apps/onboarding-api/package.json` | Create | Fastify app, references shared prisma schema |
| `apps/onboarding-api/src/env.ts` | Create | Env vars with zod |
| `apps/onboarding-api/src/db/client.ts` | Create | Prisma client singleton |
| `apps/onboarding-api/src/services/session.service.ts` | Create | Token validation, session CRUD, step state machine, completeSession |
| `apps/onboarding-api/src/services/hotel-search.service.ts` | Create | Playwright headless search: query → candidate URLs + titles |
| `apps/onboarding-api/src/services/ibe-detector.service.ts` | Create | 3-tier IBE detection: (1) `detectKnownIBE()` from `@ibe/shared` for 13 known types, (2) `IBERegistry` DB hostname lookup, (3) → `pending_ibe_review` if no match |
| `apps/onboarding-api/src/services/ibe-harvester-map.ts` | Create | Maps IBE name (string) → harvester instance; one entry per implemented IBE type |
| `apps/onboarding-api/src/services/ibe-harvester.service.ts` | Create | Orchestrator: detects IBE → looks up harvester in map → runs multi-step harvest sequence → streams SSE progress |
| `apps/onboarding-api/src/services/harvesters/mews-harvester.ts` | Create | Mews IBE Playwright harvester: hotel info → occupancy searches → age sweep → payment page taxes; falls back to `tax-lookup.service.ts` if payment page unreachable |
| `apps/onboarding-api/src/services/tax-lookup.service.ts` | Create | Curated static dataset of country/city accommodation taxes (VAT/GST, tourist tax per night); returns `HarvestedFee[]` as fallback when payment page scraping fails |
| `apps/onboarding-api/src/services/hg-bo.client.ts` | Create | HG Back Office API calls (createProperty, triggerAriSync) |
| `apps/onboarding-api/src/services/step-executor.service.ts` | Create | Orchestrates automated steps, emits SSE events |
| `apps/onboarding-api/src/routes/session.route.ts` | Create | POST /session (token→cookie), POST /register (self-registration: name+city+country) |
| `apps/onboarding-api/src/routes/search.route.ts` | Create | POST /hotel-search (runs Playwright search, returns candidates), POST /select-url (user picks candidate or pastes URL) |
| `apps/onboarding-api/src/routes/wizard.route.ts` | Create | GET /wizard/state, POST /wizard/confirm-review, POST /wizard/submit-credentials, GET /wizard/execute (SSE) |
| `apps/onboarding-api/src/app.ts` | Create | Fastify app factory |
| `apps/onboarding-api/src/server.ts` | Create | Entry point |
| `apps/onboarding-api/tsconfig.json` | Create | TypeScript config |
| `apps/onboarding/package.json` | Create | Next.js 14 app |
| `apps/onboarding/src/app/page.tsx` | Create | Entry form: name + city + country (same for hotel and HG staff invite link) |
| `apps/onboarding/src/app/start/[token]/page.tsx` | Create | Staff invite token → sets cookie → redirect to wizard (pre-fills name+city+country from invitation) |
| `apps/onboarding/src/app/wizard/page.tsx` | Create | Main wizard page — renders current step component |
| `apps/onboarding/src/app/pending/page.tsx` | Create | Post-completion: "Our team will review within 24h" |
| `apps/onboarding/src/components/WizardLayout.tsx` | Create | Progress bar + step area |
| `apps/onboarding/src/components/steps/CandidateSearchStep.tsx` | Create | Shows search results as cards; user picks one or pastes URL |
| `apps/onboarding/src/components/steps/AutomatedStep.tsx` | Create | SSE progress display (harvest, create property, ARI sync) |
| `apps/onboarding/src/components/steps/DataReviewStep.tsx` | Create | Displays harvested data (rooms, images, descriptions) — user edits and confirms |
| `apps/onboarding/src/components/steps/CredentialsStep.tsx` | Create | ARI credentials input (e.g. Mews Channel Manager Code) |
| `apps/onboarding/src/components/steps/AriSourceSelectionStep.tsx` | Create | Dropdown of all registered ARI sources; "My CM isn't listed" → free-text input → parks session at `pending_ari_source` |
| `apps/onboarding/src/components/steps/ManualDataStep.tsx` | Create | Fallback form when no IBE detected — user fills hotel info manually |
| `apps/onboarding/src/components/steps/PendingIbeStep.tsx` | Create | Shown when IBE unrecognized — "We've flagged this, we'll email you when support is added" |
| `apps/onboarding/src/components/steps/PendingAriSourceStep.tsx` | Create | Shown when CM not in registry — "We've noted your CM name, we'll email you when it's supported" |
| `apps/onboarding/src/lib/api.ts` | Create | Typed fetch wrapper for onboarding-api |
| `apps/web/src/app/admin/hotel-onboarding/page.tsx` | Create | Admin: 3 tabs — All Sessions, Needs Attention (pending_ibe_review + pending_ari_source + harvest failures), Pending Approval; distinct labels + action per issue type |
| `apps/web/src/app/admin/_layout-client.tsx` | Modify | Add `onboardingOnly?: boolean` to NavItem/Section types; hide non-onboarding sections from `onboarding_staff` role; add hotel-onboarding section with `onboardingOnly: true` |

---

## Task 1: DB Models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/src/services/__tests__/onboarding-invitation.service.test.ts` (written in Task 4)

- [ ] **Step 1: Add models to schema**

Append to the end of `apps/api/prisma/schema.prisma`:

```prisma
// ── Self-Onboarding ──────────────────────────────────────────────────────────

model OnboardingInvitation {
  id                  Int                @id @default(autoincrement())
  token               String             @unique @default(cuid())
  organizationId      Int?               // null for self-registration (assigned on approval)
  source              String             @default("staff_invite") // staff_invite | self_registration | zoho
  zohoRecordId        String?            // Phase 2: Zoho deal/ticket ID that spawned this
  pmsId               Int?               // set by staff upfront (staff flow) or by hotel selection (self-reg)
  pmsName             String?            // human-readable name of the selected ARI source, e.g. "Mews"
  unknownPmsName      String?            // hotel typed a CM name not in registry → triggers pending_ari_source
  hotelName           String?
  city                String?
  country             String?
  ibeUrl              String?            // selected IBE URL (staff sets this upfront; self-reg sets it during wizard)
  ibePattern          String?            // detected IBE pattern name from registry; null if unrecognized
  contactEmail        String?
  // Pre-harvest fields (staff_invite / zoho flow only)
  harvestStatus       String             @default("pending") // pending | harvesting | complete | failed
  harvestedData       Json?              // HarvestedHotelData — populated before invitation is sent (staff/CRM flow)
  failureReason       String?            // error message if harvestStatus=failed
  harvestNotifiedAt   DateTime?          // when HG staff were notified of harvest failure
  expiresAt           DateTime
  usedAt              DateTime?
  revokedAt           DateTime?
  createdAt           DateTime           @default(now())
  createdByAdminId    Int?               // null for self-registration and zoho
  session             OnboardingSession?
}

model OnboardingSession {
  id                 Int                  @id @default(autoincrement())
  invitationId       Int                  @unique
  invitation         OnboardingInvitation @relation(fields: [invitationId], references: [id])
  status             String               @default("in_progress")
  // status values:
  //   in_progress        — hotel is actively moving through the wizard
  //   pending_ibe_review — IBE URL not recognised; HG staff must add IBE pattern before hotel can continue
  //   pending_ari_source — CM/PMS not in registry; hotel typed the name; HG staff must add VendorFlow before hotel can continue
  //   pending_review     — wizard complete; awaiting HG staff approval to go live
  //   approved           — HG staff approved; hotel is live
  //   abandoned          — session expired or hotel gave up
  currentStep        Int                  @default(0)
  stepsJson          Json                 @default("[]")
  harvestedData      Json?                // scraped from IBE: hotel info, rooms, rate plan types, taxes & fees
  enrichedData       Json?                // user-confirmed/edited version of harvestedData + credentials
  hgPropertyCode     String?
  approvedAt         DateTime?
  approvedByAdminId  Int?
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt
  helpRequests       OnboardingHelpRequest[]
}

model OnboardingHelpRequest {
  id        Int               @id @default(autoincrement())
  sessionId Int
  session   OnboardingSession @relation(fields: [sessionId], references: [id])
  message   String
  status    String            @default("open") // open | resolved
  createdAt DateTime          @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && pnpm db:migrate
```

When prompted for migration name, enter: `add_onboarding_models`

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify generated client has the new models**

```bash
cd apps/api && node -e "import('./src/db/client.js').then(m => console.log(Object.keys(m.default)))"
```

Expected: output includes `onboardingInvitation`, `onboardingSession`, `onboardingHelpRequest`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(onboarding): add DB models for invitation, session, help request"
```

---

## Task 2: packages/onboarding-flows

**Files:**
- Create: `packages/onboarding-flows/package.json`
- Create: `packages/onboarding-flows/tsconfig.json`
- Create: `packages/onboarding-flows/src/types.ts`
- Create: `packages/onboarding-flows/src/factory.ts`
- Create: `packages/onboarding-flows/src/vendors/siteminder.ts`
- Create: `packages/onboarding-flows/src/registry.ts`
- Create: `packages/onboarding-flows/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/onboarding-flows/src/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getVendorFlow } from '../registry.js';

describe('vendor registry', () => {
  it('returns SiteMinder flow for its pmsId', () => {
    const flow = getVendorFlow(siteMinderPmsId);
    expect(flow).toBeDefined();
    expect(flow!.pmsName).toBe('SiteMinder');
    expect(flow!.dataFlow).toBe('blank');
    expect(flow!.steps.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown pmsId', () => {
    expect(getVendorFlow(999999)).toBeUndefined();
  });

  it('SiteMinder credentials schema requires propertyId', () => {
    const flow = getVendorFlow(siteMinderPmsId)!;
    expect(flow.credentialsSchema.safeParse({ propertyId: 'SM-12345' }).success).toBe(true);
    expect(flow.credentialsSchema.safeParse({ propertyId: '' }).success).toBe(false);
  });

  it('SiteMinder has a user_action step for channel connection', () => {
    const flow = getVendorFlow(siteMinderPmsId)!;
    expect(flow.steps.some(s => s.kind === 'user_action')).toBe(true);
  });

  it('validateVendorFlow passes for SiteMinder', () => {
    const flow = getVendorFlow(siteMinderPmsId)!;
    expect(() => validateVendorFlow(flow)).not.toThrow();
  });
});
```

- [ ] **Step 2: Create package.json**

Create `packages/onboarding-flows/package.json`:

```json
{
  "name": "@ibe/onboarding-flows",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "devDependencies": {
    "vitest": "^1.5.0",
    "typescript": "^5.4.0",
    "zod": "^3.22.0"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `packages/onboarding-flows/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create types.ts**

Create `packages/onboarding-flows/src/types.ts`:

```typescript
import { z } from 'zod';

export type StepKind =
  | 'automated'          // runs server-side, streams SSE progress
  | 'candidate_search'   // hotel picks their IBE from candidate cards (self-reg only)
  | 'data_review'        // shows enriched data for user to confirm/edit; room code entry for blank flow
  | 'ari_source_selection' // hotel picks their CM/PMS/CRS from a dropdown; "not listed" → free-text → pending_ari_source
  | 'credentials'        // collects ARI credentials via schema-driven form; skipped when credentialsSchema has no keys
  | 'cm_settings'        // collects pricing model, rate config, per-tax relations; dataFlowOverride toggle for canOverrideDataFlow CMs
  | 'user_action'        // shows instructions user must follow manually (e.g. connect HG in CM dashboard)
  | 'pending_ibe'        // IBE URL not recognised — hotel waits while HG staff add IBE pattern; session status = pending_ibe_review
  | 'pending_ari_source';// CM not in registry — hotel typed the name; waits while HG staff add VendorFlow; session status = pending_ari_source

export interface StepDefinition {
  id: string;
  kind: StepKind;
  title: string;
  description: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface OnboardingContext {
  sessionId: number;
  pmsId: number;
  organizationId: number;
  credentials: Record<string, string>;
  cmSettings?: CmSettings;       // set after cm_settings step; used when creating rate plans + taxes
  enrichedData: Record<string, unknown>;
  hgPropertyCode?: string;
  completedSteps: StepResult[];
  /**
   * Per-session override of VendorFlow.dataFlow, set during cm_settings when
   * VendorFlow.canOverrideDataFlow=true (e.g. STAAH V2).
   * When set, this takes precedence over VendorFlow.dataFlow for all subsequent steps.
   */
  dataFlowOverride?: DataFlow;
}

/** One penalty tier in a custom cancellation policy — e.g. "cancel 7+ days before: 0%, 3–7 days: 50%, <3 days: 100%". */
export interface CancellationPolicyFrame {
  daysBeforeCheckin: number;   // penalty applies when cancellation is made ≥ this many days before arrival
  penaltyValue: number;        // numeric penalty amount
  chargeType: 'percent' | 'currency';  // percent of total stay or fixed currency amount
}

/**
 * Structured representation of HG's two-type cancellation policy model.
 * Scraped from IBE free text and parsed into this structure; hotel confirms in DataReviewStep.
 * Created via POST /policies then linked via PUT /rateplans/{code}/policies/{policyCode}.
 *
 * Non-Refundable: 100% penalty, no configuration needed.
 * Custom: tiered frames (ascending daysBeforeCheckin = increasing penalty as arrival approaches)
 *   + no-show penalty (applied if guest doesn't arrive).
 *
 * Source: HG BO "Edit Cancellation Policy" dialog (c08e8268-c02f-4e34-9167-d21e9cccd36e.png).
 */
export type HarvestedCancellationPolicy =
  | { type: 'non_refundable' }
  | {
      type: 'custom';
      /** Days before check-in after which cancellation penalty begins (deadline). */
      deadlineDays: number;
      /** Penalty if guest no-shows entirely. */
      noShowPenalty: { value: number; chargeType: 'percent' | 'currency' };
      /** Ordered penalty tiers (by daysBeforeCheckin descending = farthest-out first). */
      frames: CancellationPolicyFrame[];
    };

/**
 * One occupancy combination seen for a room type in an IBE search.
 * Collected by running searches with different guest counts.
 */
export interface HarvestedOccupancy {
  adults: number;
  children: number;
}

/**
 * A board-type × refundability combination discovered across all occupancy searches.
 * The IBE cannot expose the hotel's actual CM rate plan codes — this is a discovery of
 * what *options* exist, not a list of rate plans. The hotel confirms and maps these to
 * actual CM rate plans (with codes + pricing) in the cm_settings wizard step.
 *
 * HG minimum requirement: RO+BB × R+NR = 4 combinations must be present.
 * DataReviewStep warns if any of the 4 are missing.
 *
 * IBE display name conventions — harvester must normalise all variants:
 *
 * Board codes:
 *   RO → "Room Only", "No Meals", "Accommodation Only", "Bed Only", "No Board", "Room"
 *   BB → "Bed & Breakfast", "Bed and Breakfast", "B&B", "Breakfast Included",
 *         "With Breakfast", "Including Breakfast", "Breakfast"
 *   HB → "Half Board", "Half-Board", "Breakfast and Dinner", "Breakfast & Dinner",
 *         "Demi-Pension", "MAP" (Modified American Plan)
 *   FB → "Full Board", "Full-Board", "All Meals", "Breakfast Lunch and Dinner",
 *         "Pension Complete", "AP" (American Plan)
 *   AI → "All Inclusive", "All-Inclusive", "All Incl.", "Everything Included", "Ultra All Inclusive"
 *
 * Cancellation policy:
 *   Non-Refundable → "Non-Refundable", "Non Refundable", "Fully Non-Refundable", "NR"
 *   Refundable     → "Refundable", "Flexible", "0 Flexible", "Free Cancellation", "Fully Flexible"
 *
 * `refundableExampleName` and `nonRefundableExampleName` store the exact IBE text for display.
 * `boardCodeRawName` stores the exact IBE board label for display in the review step.
 */
export interface DiscoveredRatePlanType {
  boardCode: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  /** Exact board label as shown in the IBE (e.g. "Bed & Breakfast", "Room Only"). */
  boardCodeRawName: string;
  hasRefundable: boolean;
  hasNonRefundable: boolean;
  /** Policy structure parsed from IBE text for the refundable option; null if parsing failed. */
  refundableCancellationPolicy: HarvestedCancellationPolicy | null;
  /** Exact IBE display name for the refundable option (e.g. "Flexible", "0 Flexible"). */
  refundableExampleName: string | null;
  /** Exact IBE display name for the non-refundable option (e.g. "Non-Refundable"). */
  nonRefundableExampleName: string | null;
}

export interface HarvestedRoom {
  name: string;
  description: string;
  images: string[];               // absolute URLs
  bedConfiguration: string | null; // e.g. "1 King bed", "2 Twin beds"
  amenities: string[];
  /**
   * Occupancy combinations this room appeared for, collected across all search patterns.
   * e.g. [{adults:1,children:0}, {adults:2,children:0}, {adults:2,children:1}]
   * Used to build the occupancy matrix in the data-review step.
   * maxAdults and maxOccupancy are derived from this list.
   */
  supportedOccupancies: HarvestedOccupancy[];
  maxAdults: number | null;       // highest adult count seen for this room
  maxOccupancy: number | null;    // highest adults+children total seen for this room
}

export interface HarvestedFee {
  name: string;                   // e.g. "Resort fee", "City tax", "Service charge"
  amount: string | null;          // e.g. "$25/night", "10%" — kept as string, no numeric parsing
  notes: string | null;
  source: 'ibe' | 'lookup';       // 'ibe' = scraped from payment page; 'lookup' = from curated country/city dataset (payment page unreachable)
}

/**
 * General hotel policy scraped from the IBE (hotel info page / policies section).
 * If a policy type was not found during scraping, it is absent from the array.
 * The DataReviewStep shows scraped policies for confirmation and offers common-default
 * options for any policy types not found, so the user can select/fill them before
 * the data is sent to HG.
 *
 * Policy types and example values:
 *   check_in_time      "15:00"
 *   check_out_time     "11:00"
 *   pets               "not_allowed" | "allowed" | "allowed_with_fee"
 *   smoking            "not_allowed" | "smoking_rooms_available" | "allowed_everywhere"
 *   min_checkin_age    "18"  (numeric string)
 *   parking            "free" | "paid" | "not_available"
 *   extra_bed          "available_on_request" | "not_available"
 *   other              free text (any other policy found in the IBE)
 *
 * Common defaults offered in DataReviewStep for missing types:
 *   check_in_time=15:00, check_out_time=11:00, pets=not_allowed,
 *   smoking=not_allowed, min_checkin_age=18
 *
 * HG mapping: check_in_time/check_out_time → property.settings.checkIn/checkOut;
 * remaining policies → stored in enrichedData and passed in property settings/notes
 * (exact HG BO API fields to be verified against spec at implementation time).
 */
export type PolicyType =
  | 'check_in_time'
  | 'check_out_time'
  | 'pets'
  | 'smoking'
  | 'min_checkin_age'
  | 'parking'
  | 'extra_bed'
  | 'other';

export interface HarvestedPolicy {
  type: PolicyType;
  value: string;          // normalised value (see PolicyType docs above)
  rawText: string | null; // original text from IBE — shown in review UI for verification
}

/**
 * One age bracket as the hotel defines it — e.g. Infant (0-1), Child (2-11), Adult (12+).
 * Age definitions vary per hotel; discovered via age sweep (see DiscoveredAgePolicy).
 */
export interface AgeCategory {
  name: string;      // e.g. "Infant", "Child", "Teen", "Adult" — from IBE text or inferred
  minAge: number;    // inclusive
  maxAge: number;    // inclusive (use 99 for adult upper bound)
}

/**
 * Property-level age policy discovered during the harvest age-sweep phase.
 *
 * Discovery strategy (in priority order):
 * 1. Explicit age selector/dropdown in the IBE guest picker — parse directly.
 * 2. Policy text on the IBE (e.g. "Children 0-11 stay free") — parse with regex.
 * 3. Age sweep: run 2A + 1C(age 0..17) searches; detect price changes at each age
 *    boundary → bracket boundaries = ages where price changes.
 *
 * hasTieredChildPricing: true when child bracket itself has multiple price tiers
 * (e.g. age 2-5 ≠ age 6-11). Relevant for cm_settings — if true, the CM may push
 * separate rates per child age group and the hotel should confirm this.
 */
export interface DiscoveredAgePolicy {
  categories: AgeCategory[];
  hasTieredChildPricing: boolean;
  /** How the policy was determined — drives confidence shown in the data-review step. */
  source: 'dropdown' | 'text' | 'price_sweep' | 'unknown';
  /** Raw text from IBE if found explicitly — shown in review UI for hotel to verify. */
  rawText: string | null;
}

export interface HarvestedHotelData {
  name: string;
  starRating: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string;
  images: string[];
  amenities: string[];
  /** Room types deduplicated across all occupancy searches. */
  rooms: HarvestedRoom[];
  /**
   * Board-type × refundability combinations discovered across all occupancy searches.
   * NOT the same as CM rate plans — this is what the IBE revealed the hotel offers.
   * Hotel confirms in DataReviewStep; actual rate plan codes + pricing collected in cm_settings.
   */
  discoveredRatePlanTypes: DiscoveredRatePlanType[];
  /**
   * General hotel policies scraped from the IBE (check-in time, pets, smoking, etc.).
   * Only types found during scraping are present. DataReviewStep offers common-default
   * options for any type not in this array so the user can fill them before submission.
   */
  policies: HarvestedPolicy[];
  /**
   * Age bracket policy discovered via age sweep (2A + 1C age 0..17) or IBE text/dropdown.
   * null = IBE does not accept child guests or sweep produced no useful signal.
   * Used in DataReviewStep to confirm infant/child/adult thresholds.
   * Relevant for cm_settings if hasTieredChildPricing=true (CM pushes per-age-group rates).
   */
  agePolicy: DiscoveredAgePolicy | null;
  /** Property-level taxes & fees from one booking/payment page (or tax-lookup fallback). */
  taxesAndFees: HarvestedFee[];
}

export type PricingModel = 'per_room' | 'per_occupancy' | 'per_person';

export type TaxRelation = 'included' | 'add' | 'display' | 'optional' | 'ignore';

/** Per-rate-plan settings declared by hotel in the cm_settings wizard step */
export interface RatePlanCmSettings {
  ratePlanName: string;           // matches harvested rate plan name
  /**
   * priceType: does the CM push the guest-facing sell price (gross) or a net-of-commission price (net)?
   * Preferred: gross (sell price). Net unlocks pay-at-hotel distribution.
   * Maps to CreateRatePlanDto.priceType.
   */
  priceType: 'gross' | 'net';
  /**
   * Always required. The gap between sell (BAR) and net price.
   * gross: net = sell × (1 - commissionPercent/100) — HG derives net to distribute to agents.
   * net:   sell = net / (1 - commissionPercent/100) — HG knows the hotel's BAR/sell price and
   *        communicates it to demands so their markup doesn't exceed it and cause rate parity issues.
   */
  commissionPercent: number;
  /**
   * charge: who pays for this booking?
   * agent: B2B demand pays via VCC (standard HG model).
   * customer: guest pays at property (pay-at-hotel, requires net price to be known).
   * Maps to CreateRatePlanDto.charge.
   * NOTE: adjustments and allow-any-price are HG-side only — not set during wizard.
   */
  charge: 'agent' | 'customer';
  /**
   * Per-rate-plan currency override (ISO 4217). Most CMs use the same currency for all rate plans
   * so this is typically undefined (falls back to CmSettings.currency).
   * Some ARI sources do push per-rate-plan currencies — collected here for future HG support.
   * Currently stored in enrichedData; ignored when creating rate plans until HG supports it.
   */
  currencyOverride?: string;
  /**
   * Per-rate-plan pricing model. Defaults to CmSettings.pricingModel if not set.
   * Not rare — HG supports this now. Applied when creating the rate plan in HG.
   * Wizard shows property-level default pre-selected; hotel can change per rate plan.
   */
  pricingModel?: PricingModel;
  /**
   * Board type for this rate plan entry.
   * Pre-populated from DiscoveredRatePlanType.boardCode (discovered via multi-search harvest).
   * Hotel adds the actual CM rate plan name/code in this step.
   * Maps to CreateRatePlanDto.boardCode.
   *
   * HG minimum requirement: at least 4 entries covering RO+BB × NR+R.
   * cm_settings step pre-fills one entry per DiscoveredRatePlanType × R/NR combination
   * and warns if any of the 4 minimum combinations are absent.
   */
  boardCode: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  /**
   * Cancellation policy for this rate plan — structured to match HG's policy model.
   * Pre-populated from DiscoveredRatePlanType.refundableCancellationPolicy (parsed during harvest).
   * Non-refundable entries get { type: 'non_refundable' } automatically.
   * Hotel reviews and confirms.
   * Created via POST /policies then linked via PUT /rateplans/{code}/policies/{policyCode}.
   */
  cancellationPolicy: HarvestedCancellationPolicy;
}

/** Hotel's CM settings — declared by hotel in the cm_settings wizard step */
export interface CmSettings {
  /**
   * ISO 4217 currency code of the rates pushed by the CM (e.g. "USD", "EUR", "THB").
   * Property-level — all rate plans use the same currency.
   * Maps to CreatePropertyBodyDto.settings.currency.
   */
  currency: string;
  /**
   * How the CM sends rates.
   * per_room: one flat rate per room per night, extra pax surcharges defined separately.
   * per_occupancy: different rates per occupancy level (1 adult=$80, 2=$140, etc.).
   * per_person: rate × number of guests.
   */
  pricingModel: PricingModel;
  /** Per-rate-plan pricing model and charge settings */
  ratePlans: RatePlanCmSettings[];
  /**
   * Per-tax relation for each harvested tax/fee (pre-populated from IBE scrape, confirmed by hotel).
   * Key = tax name (e.g. "VAT"), value = relation to the pushed rate.
   * included: tax baked into rate. add: tax on top. display: shown but collected at property.
   */
  taxRelations: Record<string, TaxRelation>;
}

/**
 * How static hotel data (rooms, rate plans, content) flows between HG and the CM.
 *
 * hg_pulls     — CM pushes static data via ARI; HG reads it. propertySource.hasStaticData=true.
 *                Examples: Mews, eZee, 5stelle*, Phobs. Wizard: credentials → create property → ARI sync.
 *                Hotel only needs to provide CM credentials.
 *
 * blank        — CM pushes ARI only; no static data. propertySource.hasStaticData=false.
 *                Rooms + rate plans must be pre-created in HG with exact CM codes before ARI sync.
 *                Mismatch = silent ARI failure. Examples: SiteMinder, D-EDGE, Roomcloud.
 *                Wizard adds: room code entry + rate plan code entry + rooms/rateplans creation steps.
 *
 * reverse_pull — HG creates property with content from IBE harvest; CM pulls static data FROM HG.
 *                propertySource.hasStaticData=false in API but wizard is simplest of the three:
 *                no room code entry needed (CM adapts to HG's codes), often no credentials needed.
 *                Examples: Bookito, Q2B Solutions, 5starDesk, OneHotel, Vioma, STAAH V2 (sometimes).
 */
export type DataFlow = 'hg_pulls' | 'blank' | 'reverse_pull';

export interface VendorFlow {
  pmsId: number;
  pmsName: string;

  /**
   * Drives wizard step sequence and HG BO API calls. See DataFlow type above.
   */
  dataFlow: DataFlow;

  /**
   * STAAH V2 and similar: dataFlow can be chosen per-session by HG staff during cm_settings.
   * When true, cm_settings shows a toggle: "Pull rooms/rates from CM" vs "Create content manually".
   * The chosen value is stored in OnboardingContext.dataFlowOverride.
   */
  canOverrideDataFlow?: boolean;

  // ── Staff coordination ───────────────────────────────────────────────────

  /**
   * true → HG staff must coordinate with the CM on the hotel's behalf (email, form, activation).
   * Examples: Cloudbeds (HG emails CM to get MyAllocator ID), Eviivo (CM must activate HG first),
   *           SynXis CCX (4-party PRS form flow), RateTiger/eRevMax (hotel fills content form).
   * When true: hotel wizard ends at pending_review with staffChannelSetupNote shown.
   * Admin queue shows a "Contact CM" action item for these sessions.
   */
  requiresStaffChannelSetup: boolean;

  /** Shown to hotel at wizard completion: explains what HG staff will do next. */
  staffChannelSetupNote?: string;

  /**
   * true → room/rate plan codes are sent by the CM to HG via email (not entered by hotel).
   * Examples: D-EDGE (sends codes after hotel requests mapping), RateTiger/eRevMax.
   * When true: cm_settings hides pmsRateplanCode input fields; HG staff fill these post-connection.
   */
  ratePlanCodesProvidedByStaff?: boolean;

  /**
   * true → HG uses its own auto-generated default codes (e.g. ROOM-01, FLEX-AI).
   * Hotel does NOT enter CM codes. CM adapts to HG's codes.
   * Examples: TravelClick ("no need to match unless hotel requests it").
   * Incompatible with ratePlanCodesProvidedByStaff.
   */
  useDefaultCodes?: boolean;

  // ── CM-specific constraints ──────────────────────────────────────────────

  /**
   * Tax relations that are forced by the CM regardless of hotel input.
   * Pre-filled AND locked (non-editable) in the cm_settings tax-relations UI.
   * Examples: eZee (always 'add' — pushes tax-exclusive rates),
   *           NextPax, Shiji, SynXis CCX, TravelClick (confirm with client first).
   * Key = tax name (e.g. "VAT"), value = forced relation.
   */
  mandatoryTaxRelations?: Record<string, TaxRelation>;

  /**
   * If set, only these pricing models are offered in cm_settings.
   * Example: Phobs — cannot mix per_room and per_occupancy on the same property.
   * If only one value, pricing model selection is hidden (auto-set).
   */
  supportedPricingModels?: PricingModel[];

  /**
   * false → CM does not support child/infant guests. DataReview hides child occupancy
   * fields and forces maxChildren=0 on all rooms. Example: LobbyPMS.
   * Default: true.
   */
  childrenSupported?: boolean;

  /**
   * Room code format constraint validated in DataReview when hotel enters room codes.
   * Example: RoomRaccoon — no underscores allowed (causes ARI failures); use hyphens.
   * pattern: JS RegExp source string (e.g. '^[^_]+$').
   */
  roomCodeFormat?: { pattern: string; errorMessage: string };

  /**
   * true → property is region-aware and HG staff must verify/set the correct region
   * after property creation. Example: SiteMinder — Asia/Pacific vs Rest of World;
   * wrong setting = booking failures.
   * When true: admin queue shows a "Verify region" action item after property is created.
   */
  regionAware?: boolean;

  // ── Credential and code transformations (applied server-side, not shown to hotel) ─

  /**
   * Transform credentials before passing to HG BO API calls.
   * Example: Phobs — hotel enters their Phobs ID; HG must prepend "HG" before API call.
   * Applied in getHGPropertyPayload and all subsequent room/rateplan API calls.
   */
  credentialTransform?: (creds: Record<string, string>) => Record<string, string>;

  /**
   * Transform rate plan code before creating it in HG BO API.
   * Example: Prestige — hotel enters "Flex", HG stores "Flex-BB" (appends "-{boardCode}").
   * Hotel always sees the untransformed code; transformation is server-side only.
   */
  ratePlanCodeTransform?: (code: string, boardCode: string) => string;

  // ── Core interface ───────────────────────────────────────────────────────

  steps: StepDefinition[];

  /**
   * Zod schema for credentials the hotel must enter.
   * Use z.object({}) (empty schema) for CMs that need no credentials (e.g. reverse_pull CMs
   * like Bookito, Q2B Solutions). The credentials step is skipped when schema has no keys.
   */
  credentialsSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;

  validateConnection: (ctx: OnboardingContext) => Promise<{ valid: boolean; message?: string }>;
  getHGPropertyPayload: (ctx: OnboardingContext) => Record<string, unknown>;
}
```

- [ ] **Step 5: Create factory.ts**

Create `packages/onboarding-flows/src/factory.ts`:

```typescript
import type { VendorFlow, StepDefinition, DataFlow } from './types.js';

/**
 * Standard step sequences per data flow type.
 * createVendorFlow() uses this to fill steps when none are provided.
 * Override by passing steps[] explicitly.
 */
export function defaultStepsFor(dataFlow: DataFlow): StepDefinition[] {
  const common = [
    { id: 'candidate_search', kind: 'candidate_search' as const, title: 'Find Your Hotel Online', description: 'We\'ll search for your hotel\'s booking engine. Pick the correct result or paste your URL directly.' },
    { id: 'harvest_data', kind: 'automated' as const, title: 'Collecting Property Information', description: 'Pulling your hotel details, rooms, and policies from your booking engine.' },
    { id: 'review_data', kind: 'data_review' as const, title: 'Review Your Property Information', description: 'Check the details we collected and edit anything that needs updating.' },
  ];

  const credentialsStep: StepDefinition = { id: 'collect_credentials', kind: 'credentials', title: 'Connect Your Channel Manager', description: 'Enter your channel manager credentials to enable live availability and rates.' };
  const cmSettingsStep: StepDefinition = { id: 'cm_settings', kind: 'cm_settings', title: 'Rate & Tax Configuration', description: 'Tell us how your channel manager sends rates so prices display correctly.' };
  const createPropertyStep: StepDefinition = { id: 'create_hg_property', kind: 'automated', title: 'Creating Your HyperGuest Profile', description: 'Setting up your property in the HyperGuest system.' };
  const ariSyncStep: StepDefinition = { id: 'trigger_ari_sync', kind: 'automated', title: 'Syncing Availability & Rates', description: 'Triggering your first availability and rate sync.' };

  if (dataFlow === 'hg_pulls') {
    return [...common, credentialsStep, cmSettingsStep, createPropertyStep, ariSyncStep];
  }

  if (dataFlow === 'blank') {
    // blank: room codes entered in data_review; rate plan codes entered in cm_settings
    return [...common, credentialsStep, cmSettingsStep, createPropertyStep, ariSyncStep];
  }

  // reverse_pull: CM pulls content from HG; often no credentials needed (schema keys = 0 → step skipped)
  return [...common, credentialsStep, cmSettingsStep, createPropertyStep, ariSyncStep];
}

/**
 * Validates a VendorFlow object at registration time. Throws on config errors so
 * misconfigurations surface at startup (or test run) rather than at wizard runtime.
 *
 * Checks:
 * - pmsId and pmsName are set
 * - steps array is non-empty
 * - no duplicate step ids
 * - useDefaultCodes and ratePlanCodesProvidedByStaff are not both true
 * - childrenSupported=false only on dataFlow='blank' (would be odd on reverse_pull)
 * - credentialTransform / ratePlanCodeTransform are functions if provided
 */
export function validateVendorFlow(flow: VendorFlow): void {
  if (!flow.pmsId) throw new Error(`VendorFlow missing pmsId`);
  if (!flow.pmsName) throw new Error(`VendorFlow ${flow.pmsId} missing pmsName`);
  if (!flow.steps.length) throw new Error(`VendorFlow ${flow.pmsId} (${flow.pmsName}) has no steps`);

  const ids = flow.steps.map(s => s.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`VendorFlow ${flow.pmsName} has duplicate step ids: ${dupes.join(', ')}`);

  if (flow.useDefaultCodes && flow.ratePlanCodesProvidedByStaff) {
    throw new Error(`VendorFlow ${flow.pmsName}: useDefaultCodes and ratePlanCodesProvidedByStaff are mutually exclusive`);
  }

  if (flow.credentialTransform && typeof flow.credentialTransform !== 'function') {
    throw new Error(`VendorFlow ${flow.pmsName}: credentialTransform must be a function`);
  }
  if (flow.ratePlanCodeTransform && typeof flow.ratePlanCodeTransform !== 'function') {
    throw new Error(`VendorFlow ${flow.pmsName}: ratePlanCodeTransform must be a function`);
  }
}

/**
 * Factory for vendor plugins. Fills steps via defaultStepsFor(dataFlow) when not provided.
 * Validates the result before returning — misconfigurations throw at import time.
 *
 * Usage:
 *   export const myFlow = createVendorFlow({ pmsId: 999, pmsName: 'My CM', dataFlow: 'blank', ... });
 */
export function createVendorFlow(config: Omit<VendorFlow, 'steps'> & { steps?: StepDefinition[] }): VendorFlow {
  const flow: VendorFlow = {
    ...config,
    steps: config.steps ?? defaultStepsFor(config.dataFlow),
  };
  validateVendorFlow(flow);
  return flow;
}
```

- [ ] **Step 6: Create mews.ts**

Create `packages/onboarding-flows/src/vendors/mews.ts`:

```typescript
import { z } from 'zod';
import { createVendorFlow } from '../factory.js';

export const mewsFlow = createVendorFlow({
  pmsId: 4,
  pmsName: 'Mews',
  dataFlow: 'hg_pulls',
  requiresStaffChannelSetup: false,
  credentialsSchema: z.object({
    channelManagerCode: z.string().min(1, 'Channel Manager Code is required'),
  }),
  // steps auto-generated by defaultStepsFor('hg_pulls'); override the credentials title for Mews
  steps: [
    { id: 'candidate_search', kind: 'candidate_search', title: 'Find Your Hotel Online', description: 'We\'ll search for your hotel\'s booking engine online. Pick the correct result or paste your booking URL directly.' },
    { id: 'harvest_data', kind: 'automated', title: 'Collecting Your Property Information', description: 'We\'re pulling your hotel details — rooms, descriptions, images, and amenities — from your booking engine.' },
    { id: 'review_data', kind: 'data_review', title: 'Review Your Property Information', description: 'Check the details we collected. Edit anything that needs updating before we create your HyperGuest profile.' },
    { id: 'collect_credentials', kind: 'credentials', title: 'Connect Your Mews Account', description: 'Enter your Mews Channel Manager Code. Find it in Mews Operations → Settings → Integrations → Channel Managers.' },
    { id: 'cm_settings', kind: 'cm_settings', title: 'Rate & Tax Configuration', description: 'Tell us how your channel manager sends rates — this ensures prices and taxes display correctly to guests.' },
    { id: 'create_hg_property', kind: 'automated', title: 'Creating Your HyperGuest Profile', description: 'Setting up your property in the HyperGuest system.' },
    { id: 'trigger_ari_sync', kind: 'automated', title: 'Syncing Availability & Rates', description: 'Triggering your first availability and rate sync from Mews.' },
  ],
  async validateConnection(ctx) {
    if (!ctx.credentials.channelManagerCode) {
      return { valid: false, message: 'Channel Manager Code is required' };
    }
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched.hotelName as string) || 'My Hotel',
        pmsId: 4,
        location: { city: { name: (enriched.city as string) || 'Unknown', countryCode: (enriched.countryCode as string) || 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { channelManagerCode: ctx.credentials.channelManagerCode, pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials.channelManagerCode,
        hasStaticData: true,
      },
    };
  },
});
```

- [ ] **Step 7: Create registry.ts**

Create `packages/onboarding-flows/src/registry.ts`:

```typescript
import type { VendorFlow } from './types.js';
import { validateVendorFlow } from './factory.js';
import { mewsFlow } from './vendors/mews.js';

// All flows are validated by createVendorFlow() at import time.
// Registry validates them again at startup to catch any raw VendorFlow objects
// that bypass the factory (should not happen, but defensive).
const registry = new Map<number, VendorFlow>([
  [4, mewsFlow],
]);

// Startup validation — throws if any registered flow is misconfigured
for (const flow of registry.values()) {
  validateVendorFlow(flow);
}

export function getVendorFlow(pmsId: number): VendorFlow | undefined {
  return registry.get(pmsId);
}
```

- [ ] **Step 8: Create index.ts**

Create `packages/onboarding-flows/src/index.ts`:

```typescript
export * from './types.js';
export * from './factory.js';
export * from './registry.js';
```

- [ ] **Step 9: Run the failing test to confirm it fails**

```bash
cd packages/onboarding-flows && pnpm vitest run src/__tests__/registry.test.ts
```

Expected: FAIL (modules not found yet)

- [ ] **Step 10: Install deps and run tests**

```bash
cd /home/nir/ibe && pnpm install
cd packages/onboarding-flows && pnpm vitest run
```

Expected: 4 tests PASS

- [ ] **Step 11: Commit**

```bash
git add packages/onboarding-flows/
git commit -m "feat(onboarding): add onboarding-flows package with Mews vendor plugin and createVendorFlow factory"
```

---

## Task 3: apps/onboarding-api scaffold

**Files:**
- Create: `apps/onboarding-api/package.json`
- Create: `apps/onboarding-api/tsconfig.json`
- Create: `apps/onboarding-api/src/env.ts`
- Create: `apps/onboarding-api/src/db/client.ts`
- Create: `apps/onboarding-api/src/app.ts`
- Create: `apps/onboarding-api/src/server.ts`
- Create: `apps/onboarding-api/.env.example`

- [ ] **Step 1: Create package.json**

Create `apps/onboarding-api/package.json`:

```json
{
  "name": "@ibe/onboarding-api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "node --env-file=.env --watch --import /home/nir/ibe/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/esm/index.mjs src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cookie": "^9.4.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/sensible": "^5.0.0",
    "@ibe/onboarding-flows": "workspace:*",
    "@prisma/client": "^5.12.0",
    "fastify": "^4.27.0",
    "pino": "^9.0.0",
    "undici": "^6.0.0",
    "zod": "^3.22.0"
  },
  "prisma": {
    "schema": "../api/prisma/schema.prisma"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "pino-pretty": "^13.1.3",
    "prisma": "^5.12.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `apps/onboarding-api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create .env.example**

Create `apps/onboarding-api/.env.example`:

```
PORT=3003
DATABASE_URL=postgresql://...
HG_BO_API_BASE=https://back-office.dev.hyperguest.io
HG_BO_API_KEY=geniegeniesecret
SESSION_COOKIE_SECRET=change-me-in-prod
ONBOARDING_APP_URL=http://localhost:3002
INTERNAL_API_SECRET=change-me-in-prod
IBE_API_CALLBACK_URL=http://localhost:3000
```

- [ ] **Step 4: Create src/env.ts**

Create `apps/onboarding-api/src/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3003'),
  DATABASE_URL: z.string(),
  HG_BO_API_BASE: z.string().url(),
  HG_BO_API_KEY: z.string(),
  SESSION_COOKIE_SECRET: z.string().min(16),
  ONBOARDING_APP_URL: z.string().url().default('http://localhost:3002'),
  INTERNAL_API_SECRET: z.string().min(16),
  IBE_API_CALLBACK_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 5: Create src/db/client.ts**

Create `apps/onboarding-api/src/db/client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export default prisma;
```

- [ ] **Step 6: Create src/app.ts**

Create `apps/onboarding-api/src/app.ts`:

```typescript
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, {
    origin: env.ONBOARDING_APP_URL,
    credentials: true,
  });
  await app.register(cookie, { secret: env.SESSION_COOKIE_SECRET });
  await app.register(sensible);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
```

- [ ] **Step 7: Create src/server.ts**

Create `apps/onboarding-api/src/server.ts`:

```typescript
import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();
await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
```

- [ ] **Step 8: Install deps**

```bash
cd /home/nir/ibe && pnpm install
```

- [ ] **Step 9: Type check**

```bash
cd apps/onboarding-api && pnpm type-check
```

Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add apps/onboarding-api/
git commit -m "feat(onboarding): scaffold onboarding-api Fastify app"
```

---

## Task 4: Invitation service + admin routes in apps/api

**Key behaviour:**
- `POST /admin/hotel-onboarding/invitations` requires `ibeUrl` for staff invitations. After creating the DB record, it immediately kicks off a **background harvest** (fire-and-forget async call to `onboarding-api /internal/harvest`). The HTTP response returns the invitation immediately; harvest runs in background.
- When harvest completes → `harvestStatus = 'complete'`, `harvestedData` populated → invitation email sent to hotel via configured email service.
- When harvest fails → `harvestStatus = 'failed'`, `failureReason` set → admin "needs attention" queue surfaced in admin UI + email notification sent to `HG_STAFF_NOTIFICATION_EMAIL` env var.
- `POST /admin/hotel-onboarding/invitations/:id/retry-harvest` — retries a failed harvest.
- When hotel opens the invitation link and `harvestedData` is already populated on the invitation → session is created with that data pre-loaded and the harvest wizard step is marked complete automatically.
- Self-registration invitations: `harvestStatus` stays `pending`; harvest runs live in the hotel's wizard session.

**New env vars needed in apps/api:**
- `ONBOARDING_API_INTERNAL_URL` — base URL of onboarding-api for internal harvest trigger (e.g. `http://localhost:3003`)
- `HG_STAFF_NOTIFICATION_EMAIL` — fixed HG address for harvest failure alerts

**Files:**
- Create: `apps/api/src/services/onboarding-invitation.service.ts`
- Create: `apps/api/src/services/onboarding-email.service.ts`
- Create: `apps/api/src/services/__tests__/onboarding-invitation.service.test.ts`
- Create: `apps/api/src/routes/onboarding-admin.route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/__tests__/onboarding-invitation.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => ({
  default: {
    onboardingInvitation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../../db/client.js';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  getInvitationByToken,
} from '../onboarding-invitation.service.js';

beforeEach(() => vi.clearAllMocks());

describe('createInvitation', () => {
  it('creates an invitation with 7-day expiry', async () => {
    const mockInv = { id: 1, token: 'abc', expiresAt: new Date() };
    vi.mocked(prisma.onboardingInvitation.create).mockResolvedValue(mockInv as any);

    const result = await createInvitation({
      organizationId: 5,
      pmsId: 4,
      pmsName: 'Mews',
      createdByAdminId: 10,
    });

    expect(prisma.onboardingInvitation.create).toHaveBeenCalledOnce();
    const callArg = vi.mocked(prisma.onboardingInvitation.create).mock.calls[0][0];
    const expiry = callArg.data.expiresAt as Date;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime() - Date.now()).toBeGreaterThan(sevenDays - 5000);
    expect(result).toBe(mockInv);
  });
});

describe('revokeInvitation', () => {
  it('sets revokedAt', async () => {
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
    await revokeInvitation(1);
    expect(prisma.onboardingInvitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('getInvitationByToken', () => {
  it('returns invitation for valid token', async () => {
    const mockInv = { id: 1, token: 'tok', revokedAt: null, usedAt: null, expiresAt: new Date(Date.now() + 10000) };
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue(mockInv as any);
    const result = await getInvitationByToken('tok');
    expect(result).toBe(mockInv);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/api && pnpm vitest run src/services/__tests__/onboarding-invitation.service.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the service**

Create `apps/api/src/services/onboarding-invitation.service.ts`:

```typescript
import prisma from '../db/client.js';

interface CreateInvitationInput {
  organizationId: number;
  pmsId: number;
  pmsName: string;
  hotelName?: string;
  websiteUrl?: string;
  contactEmail?: string;
  createdByAdminId?: number;
}

export async function createInvitation(input: CreateInvitationInput) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await prisma.onboardingInvitation.create({
    data: { ...input, expiresAt },
  });

  // For staff/CRM invitations that have an IBE URL, kick off background harvest immediately.
  // Self-registration invitations have no ibeUrl at creation time — harvest runs in hotel's session.
  if (invitation.ibeUrl && invitation.source !== 'self_registration') {
    triggerBackgroundHarvest(invitation.id, invitation.ibeUrl).catch((err) => {
      console.error(`Background harvest trigger failed for invitation ${invitation.id}:`, err);
    });
  }

  return invitation;
}

export async function triggerBackgroundHarvest(invitationId: number, ibeUrl: string) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'harvesting' },
  });
  // Fire-and-forget POST to onboarding-api internal endpoint
  const internalUrl = process.env.ONBOARDING_API_INTERNAL_URL ?? 'http://localhost:3003';
  const res = await fetch(`${internalUrl}/internal/harvest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationId, ibeUrl }),
  });
  if (!res.ok) throw new Error(`Internal harvest request failed: ${res.status}`);
}

export async function markHarvestComplete(invitationId: number, harvestedData: unknown) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'complete', harvestedData: harvestedData as any },
  });
  const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } });
  if (invitation?.contactEmail) {
    await sendInvitationEmail(invitation);
  }
}

export async function markHarvestFailed(invitationId: number, reason: string) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'failed', failureReason: reason },
  });
  await notifyHarvestFailure(invitationId, reason);
}

export async function listNeedsAttention() {
  return prisma.onboardingInvitation.findMany({
    where: { harvestStatus: 'failed' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listInvitations(organizationId: number) {
  return prisma.onboardingInvitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: { session: { select: { status: true, currentStep: true } } },
  });
}

export async function revokeInvitation(id: number) {
  return prisma.onboardingInvitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function getInvitationByToken(token: string) {
  return prisma.onboardingInvitation.findUnique({ where: { token } });
}

export function isInvitationValid(inv: {
  revokedAt: Date | null;
  usedAt: Date | null;
  expiresAt: Date;
}): { valid: boolean; reason?: string } {
  if (inv.revokedAt) return { valid: false, reason: 'revoked' };
  if (inv.usedAt) return { valid: false, reason: 'already_used' };
  if (inv.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  return { valid: true };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && pnpm vitest run src/services/__tests__/onboarding-invitation.service.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Create admin route**

Create `apps/api/src/routes/onboarding-admin.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../services/onboarding-invitation.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';

const createInvitationSchema = z.object({
  pmsId: z.number().int().positive(),
  hotelName: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
});

export async function onboardingAdminRoutes(app: FastifyInstance) {
  // All routes require admin session (same JWT guard as other admin routes)
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.unauthorized();
    }
  });

  app.post('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.user as { adminId: number; organizationId: number };
    const body = createInvitationSchema.parse(request.body);
    const flow = getVendorFlow(body.pmsId);
    if (!flow) return reply.badRequest(`Unknown pmsId: ${body.pmsId}`);

    const inv = await createInvitation({
      organizationId: me.organizationId,
      pmsId: body.pmsId,
      pmsName: flow.pmsName,
      hotelName: body.hotelName,
      websiteUrl: body.websiteUrl,
      contactEmail: body.contactEmail,
      createdByAdminId: me.adminId,
    });
    return reply.code(201).send(inv);
  });

  app.get('/admin/hotel-onboarding/invitations', async (request) => {
    const me = request.user as { organizationId: number };
    return listInvitations(me.organizationId);
  });

  app.delete('/admin/hotel-onboarding/invitations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await revokeInvitation(parseInt(id));
    return reply.code(204).send();
  });

  // GET /admin/hotel-onboarding/invitations/needs-attention — failed harvests queue
  app.get('/admin/hotel-onboarding/invitations/needs-attention', async () => {
    return listNeedsAttention();
  });

  // POST /admin/hotel-onboarding/invitations/:id/retry-harvest — retry a failed harvest
  app.post('/admin/hotel-onboarding/invitations/:id/retry-harvest', async (request, reply) => {
    const invitationId = parseInt((request.params as { id: string }).id);
    const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) return reply.notFound('Invitation not found');
    if (!invitation.ibeUrl) return reply.badRequest('No IBE URL on invitation');
    await triggerBackgroundHarvest(invitationId, invitation.ibeUrl);
    return { ok: true };
  });

  // PUT /admin/hotel-onboarding/sessions/:id/approve — approve pending_review session → go live
  app.put('/admin/hotel-onboarding/sessions/:id/approve', async (request, reply) => {
    const me = request.user as { adminId: number };
    const sessionId = parseInt((request.params as { id: string }).id);
    const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } });
    if (!session) return reply.notFound('Session not found');
    if (session.status !== 'pending_review') return reply.badRequest('Session is not pending review');
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { status: 'approved', approvedAt: new Date(), approvedByAdminId: me.adminId },
    });
    return reply.send({ ok: true });
  });
}
```

- [ ] **Step 6: Register route in apps/api**

Open `apps/api/src/app.ts` (or wherever routes are registered — search for where other admin routes are registered):

```bash
grep -n "adminRoutes\|register.*route" apps/api/src/app.ts | head -20
```

Add the import and registration alongside the other admin route registrations:

```typescript
import { onboardingAdminRoutes } from './routes/onboarding-admin.route.js';
// ... inside the route registration block:
await app.register(onboardingAdminRoutes);
```

- [ ] **Step 7: Type check**

```bash
cd apps/api && pnpm type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/onboarding-invitation.service.ts \
        apps/api/src/services/__tests__/onboarding-invitation.service.test.ts \
        apps/api/src/routes/onboarding-admin.route.ts \
        apps/api/src/app.ts
git commit -m "feat(onboarding): invitation service + admin routes"
```

---

## Task 5: Session service in apps/onboarding-api

**Files:**
- Create: `apps/onboarding-api/src/services/session.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/session.service.test.ts`
- Create: `apps/onboarding-api/src/routes/session.route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/session.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => ({
  default: {
    onboardingInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    onboardingSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../../db/client.js';
import { initSession, getSession, advanceStep } from '../session.service.js';

beforeEach(() => vi.clearAllMocks());

const futureDate = new Date(Date.now() + 86400000);

describe('initSession', () => {
  it('throws if token is invalid', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue(null);
    await expect(initSession('bad-token')).rejects.toThrow('invalid');
  });

  it('throws if invitation is expired', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      pmsId: 4, pmsName: 'Mews', organizationId: 5,
      session: null,
    } as any);
    await expect(initSession('tok')).rejects.toThrow('expired');
  });

  it('creates session and marks invitation used', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: futureDate,
      pmsId: 4, pmsName: 'Mews', organizationId: 5,
      session: null,
    } as any);
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
    vi.mocked(prisma.onboardingSession.create).mockResolvedValue({ id: 42 } as any);

    const result = await initSession('valid-token');
    expect(prisma.onboardingInvitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { usedAt: expect.any(Date) },
    });
    expect(result.id).toBe(42);
  });
});

describe('advanceStep', () => {
  it('increments currentStep', async () => {
    vi.mocked(prisma.onboardingSession.update).mockResolvedValue({ currentStep: 2 } as any);
    await advanceStep(1, 1, { stepId: 'collect_credentials', success: true });
    expect(prisma.onboardingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/session.service.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found

- [ ] **Step 3: Create session.service.ts**

Create `apps/onboarding-api/src/services/session.service.ts`:

```typescript
import prisma from '../db/client.js';
import type { StepResult } from '@ibe/onboarding-flows';
import { getVendorFlow } from '@ibe/onboarding-flows';

export class OnboardingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export async function initSession(token: string) {
  const invitation = await prisma.onboardingInvitation.findUnique({
    where: { token },
    include: { session: true },
  });

  if (!invitation) throw new OnboardingError('Invitation not found', 'invalid');
  if (invitation.revokedAt) throw new OnboardingError('Invitation revoked', 'revoked');
  if (invitation.usedAt) throw new OnboardingError('Invitation already used', 'already_used');
  if (invitation.expiresAt < new Date()) throw new OnboardingError('Invitation expired', 'expired');

  if (invitation.harvestStatus === 'failed') {
    throw new OnboardingError('Harvest failed for this invitation — please contact support', 'harvest_failed');
  }
  if (invitation.harvestStatus === 'harvesting') {
    throw new OnboardingError('Your data is still being prepared — please try again in a moment', 'harvest_pending');
  }

  const flow = getVendorFlow(invitation.pmsId);
  if (!flow) throw new OnboardingError(`No flow for pmsId ${invitation.pmsId}`, 'unknown_pms');

  // If harvestedData is already on the invitation (staff/CRM flow), pre-populate session
  // and mark harvest-related steps as completed so the hotel skips straight to Data Review.
  const hasPreHarvestedData = invitation.harvestStatus === 'complete' && invitation.harvestedData != null;
  const initialSteps = flow.steps.map((s) => {
    const isHarvestStep = s.kind === 'automated' && s.id === 'harvest_data';
    const isSearchStep = s.id === 'candidate_search';
    if (hasPreHarvestedData && (isHarvestStep || isSearchStep)) {
      return { ...s, status: 'completed' };
    }
    return { ...s, status: 'pending' };
  });
  // currentStep = index of first non-completed step
  const firstPending = initialSteps.findIndex((s) => s.status === 'pending');
  const currentStep = firstPending === -1 ? initialSteps.length : firstPending;

  const [session] = await Promise.all([
    prisma.onboardingSession.create({
      data: {
        invitationId: invitation.id,
        stepsJson: initialSteps,
        currentStep,
        harvestedData: hasPreHarvestedData ? invitation.harvestedData : undefined,
      },
    }),
    prisma.onboardingInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return session;
}

export async function getSession(sessionId: number) {
  return prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    include: { invitation: true },
  });
}

export async function advanceStep(sessionId: number, currentStep: number, result: StepResult) {
  const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new OnboardingError('Session not found', 'not_found');

  const steps = session.stepsJson as Array<Record<string, unknown>>;
  steps[currentStep] = { ...steps[currentStep], status: result.success ? 'completed' : 'failed', result };

  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      stepsJson: steps,
      currentStep: result.success ? currentStep + 1 : currentStep,
      enrichedData: result.data ? { ...(session.enrichedData as object ?? {}), ...result.data } : undefined,
    },
  });
}

export async function saveCredentials(sessionId: number, credentials: Record<string, string>) {
  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { enrichedData: { credentials } },
  });
}

export async function initSelfRegistration(input: {
  hotelName: string;
  pmsId: number;
  contactEmail: string;
  websiteUrl?: string;
}) {
  const flow = getVendorFlow(input.pmsId);
  if (!flow) throw new OnboardingError(`No flow for pmsId ${input.pmsId}`, 'unknown_pms');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const initialSteps = flow.steps.map((s) => ({ ...s, status: 'pending' }));

  // Create invitation (source=self_registration, no org yet) + session atomically
  const invitation = await prisma.onboardingInvitation.create({
    data: {
      source: 'self_registration',
      pmsId: input.pmsId,
      pmsName: flow.pmsName,
      hotelName: input.hotelName,
      contactEmail: input.contactEmail,
      websiteUrl: input.websiteUrl,
      expiresAt,
      usedAt: new Date(), // immediately consumed
    },
  });

  const session = await prisma.onboardingSession.create({
    data: {
      invitationId: invitation.id,
      stepsJson: initialSteps,
      currentStep: 0,
    },
  });

  return session;
}

export async function completeSession(sessionId: number) {
  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { status: 'pending_review' },
  });
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/session.service.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Create session route**

Create `apps/onboarding-api/src/routes/session.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { initSession, initSelfRegistration } from '../services/session.service.js';

function setSessionCookie(reply: any, sessionId: number) {
  reply.setCookie('onb_session', String(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function sessionRoutes(app: FastifyInstance) {
  // POST /session — exchange invitation token for a session cookie (staff invite flow)
  app.post<{ Body: { token: string } }>('/session', async (request, reply) => {
    const { token } = request.body;
    if (!token) return reply.badRequest('token required');
    try {
      const session = await initSession(token);
      setSessionCookie(reply, session.id);
      return reply.send({ ok: true, sessionId: session.id });
    } catch (err: any) {
      return reply.badRequest(err.message ?? 'Invalid token');
    }
  });

  // POST /register — self-registration (hotel fills public form, no prior invite)
  app.post<{ Body: { hotelName: string; pmsId: number; contactEmail: string; websiteUrl?: string } }>(
    '/register',
    async (request, reply) => {
      const { hotelName, pmsId, contactEmail, websiteUrl } = request.body;
      if (!hotelName || !pmsId || !contactEmail) return reply.badRequest('hotelName, pmsId and contactEmail are required');
      try {
        const session = await initSelfRegistration({ hotelName, pmsId, contactEmail, websiteUrl });
        setSessionCookie(reply, session.id);
        return reply.code(201).send({ ok: true, sessionId: session.id });
      } catch (err: any) {
        return reply.badRequest(err.message ?? 'Registration failed');
      }
    }
  );
}
```

- [ ] **Step 6: Register route in app.ts**

Edit `apps/onboarding-api/src/app.ts` — add imports and registration:

```typescript
import { sessionRoutes } from './routes/session.route.js';
// inside buildApp(), after registering plugins:
await app.register(sessionRoutes);
```

- [ ] **Step 7: Type check**

```bash
cd apps/onboarding-api && pnpm type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/onboarding-api/src/services/ apps/onboarding-api/src/routes/session.route.ts apps/onboarding-api/src/app.ts
git commit -m "feat(onboarding): session service + token exchange route"
```

---

## Task 6: HG Back Office API client

**Files:**
- Create: `apps/onboarding-api/src/services/hg-bo.client.ts`
- Create: `apps/onboarding-api/src/services/__tests__/hg-bo.client.test.ts`

HG BO API base: `https://back-office.dev.hyperguest.io`
Auth: `X-Api-Key: geniegeniesecret` (from env `HG_BO_API_KEY`)
All calls are to `/api/v1/integration/properties`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/hg-bo.client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';
import { HGBoClient } from '../hg-bo.client.js';

const client = new HGBoClient('https://back-office.dev.hyperguest.io', 'test-key');

beforeEach(() => vi.clearAllMocks());

function mockResponse(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);
}

describe('createProperty', () => {
  it('POSTs to /api/v1/integration/properties and returns propertyCode', async () => {
    mockResponse({ property: { propertyCode: 'MEWS-001' } });
    const result = await client.createProperty({
      property: { name: 'Test Hotel', pmsId: 4, location: { city: { name: 'London', countryCode: 'GB' } }, isPilot: true, status: 'Incomplete' },
      propertySource: { data: { channelManagerCode: 'CM-001' }, propertyCode: 'CM-001' },
    });
    expect(result.property.propertyCode).toBe('MEWS-001');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://back-office.dev.hyperguest.io/api/v1/integration/properties/',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }) })
    );
  });
});

describe('triggerAriSync', () => {
  it('POSTs to trigger-update endpoint', async () => {
    mockResponse({ ok: true });
    await client.triggerAriSync('MEWS-001');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://back-office.dev.hyperguest.io/api/v1/integration/properties/MEWS-001/trigger-update',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/hg-bo.client.test.ts 2>&1 | tail -10
```

Expected: FAIL

- [ ] **Step 3: Create hg-bo.client.ts**

Create `apps/onboarding-api/src/services/hg-bo.client.ts`:

```typescript
import { fetch } from 'undici';
import { env } from '../env.js';

export class HGBoClient {
  private base: string;
  private apiKey: string;

  constructor(base: string, apiKey: string) {
    this.base = base.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HG BO API ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async createProperty(payload: Record<string, unknown>) {
    return this.request<{ property: { propertyCode: string } }>(
      'POST',
      '/api/v1/integration/properties/',
      payload
    );
  }

  async getProperty(propertyCode: string) {
    return this.request<Record<string, unknown>>('GET', `/api/v1/integration/properties/${propertyCode}`);
  }

  async triggerAriSync(propertyCode: string) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/trigger-update`
    );
  }

  async listRooms(propertyCode: string) {
    return this.request<unknown[]>('GET', `/api/v1/integration/properties/${propertyCode}/rooms`);
  }

  // --- Tax/fee methods — required for ALL CMs ---
  // Taxes are created once per property, then linked per rate plan with their relation type.
  // priceType ('gross'|'net') is set on each rate plan at creation time.
  // Wrong tax config = failed bookings (confirmed by TravelClick KB article).

  async createTaxFee(propertyCode: string, taxFee: {
    title: string;
    chargeType: 'percent' | 'currency';
    chargeValue: number;
    category: 'tax' | 'fee';
    scope: 'per_stay' | 'per_room' | 'per_person' | 'per_adult' | 'per_child';
    frequency: 'per_stay' | 'per_night' | 'per_week';
    defaultRatePlanRelation: 'included' | 'add' | 'display' | 'optional' | 'ignore';
  }) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/taxes-fees`,
      taxFee
    );
  }

  async createPolicy(propertyCode: string, policy: Record<string, unknown>) {
    return this.request<{ policyCode: string }>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/policies`,
      policy
    );
  }

  async linkPolicyToRatePlan(propertyCode: string, rateplanCode: string, policyCode: string) {
    return this.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/integration/properties/${propertyCode}/rateplans/${rateplanCode}/policies/${policyCode}`,
      {}
    );
  }

  /** Replace all tax relations for a rate plan. key=taxFeeCode, value=relation */
  async setRatePlanTaxes(propertyCode: string, rateplanCode: string, relations: Record<string, 'included' | 'add' | 'display' | 'optional' | 'ignore'>) {
    return this.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/integration/properties/${propertyCode}/rateplans/${rateplanCode}/taxes-fees`,
      relations
    );
  }

  // --- Required for providesStaticData=false CMs (e.g. SiteMinder) ---
  // Rooms + rate plans must be created in HG with the CM's own codes BEFORE ARI sync.
  // Without this, ARI arrives with CM codes that don't match anything in HG → silent failure.

  async createRoom(propertyCode: string, room: { type: string; name: string; code: string }) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/rooms`,
      room
    );
  }

  async createRatePlan(propertyCode: string, ratePlan: {
    name: string;
    pmsRateplanCode: string;
    priceType: 'gross' | 'net'; // gross=rates include taxes; net=taxes added on top. Wrong = failed bookings.
    boardCode?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  }) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/rateplans`,
      ratePlan
    );
  }

  async linkRoomsToRatePlan(propertyCode: string, rateplanCode: string, roomCodes: string[]) {
    return this.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/integration/properties/${propertyCode}/rateplans/${rateplanCode}/rooms`,
      { roomCodes }
    );
  }
}

export const hgBoClient = new HGBoClient(env.HG_BO_API_BASE, env.HG_BO_API_KEY);
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/hg-bo.client.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/hg-bo.client.ts \
        apps/onboarding-api/src/services/__tests__/hg-bo.client.test.ts
git commit -m "feat(onboarding): HG Back Office API client"
```

---

## Task 4b: Email service + internal harvest endpoint

**Files:**
- Create: `apps/api/src/services/onboarding-email.service.ts`
- Create: `apps/onboarding-api/src/routes/internal.route.ts`

**Email service** (`apps/api/src/services/onboarding-email.service.ts`):
Uses the same email provider pattern as the existing IBE email service. The onboarding admin module has its own email config (SMTP/API key) configurable per org in the admin UI — same UX as the IBE communication settings.

```typescript
// Two functions needed:

// 1. Send invitation email to hotel
export async function sendInvitationEmail(invitation: {
  id: number; token: string; hotelName?: string | null; contactEmail: string | null;
  pmsName?: string | null;
}) {
  // Build link: `${ONBOARDING_APP_URL}/start/${invitation.token}`
  // Send via configured email provider (same pattern as existing IBE email service)
  // Subject: "Your HyperGuest onboarding is ready — connect your property"
  // Body: hotel name, link, brief instructions
}

// 2. Notify HG staff of harvest failure
export async function notifyHarvestFailure(invitationId: number, reason: string) {
  const staffEmail = process.env.HG_STAFF_NOTIFICATION_EMAIL;
  if (!staffEmail) return; // skip if not configured
  // Send to fixed staffEmail address
  // Subject: "⚠️ Onboarding harvest failed — invitation #${invitationId}"
  // Body: invitationId, reason, link to admin needs-attention page
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestNotifiedAt: new Date() },
  });
}
```

**Internal harvest endpoint** (`apps/onboarding-api/src/routes/internal.route.ts`):
This is a server-to-server route called by `apps/api` to trigger harvest in the background. Protected by a shared secret (`INTERNAL_API_SECRET` env var).

```typescript
// POST /internal/harvest
// Body: { invitationId: number, ibeUrl: string }
// 1. Validates INTERNAL_API_SECRET header
// 2. Runs ibe-harvester.service.ts against ibeUrl (no SSE — result returned on completion)
// 3. On success: calls apps/api POST /internal/onboarding/harvest-complete { invitationId, harvestedData }
// 4. On failure: calls apps/api POST /internal/onboarding/harvest-failed { invitationId, reason }
```

**Corresponding internal callback routes in apps/api** (`apps/api/src/routes/onboarding-internal.route.ts`):
```typescript
// POST /internal/onboarding/harvest-complete → calls markHarvestComplete(invitationId, harvestedData)
// POST /internal/onboarding/harvest-failed   → calls markHarvestFailed(invitationId, reason)
// Both protected by INTERNAL_API_SECRET header
```

**New env vars:**
- `apps/api`: `HG_STAFF_NOTIFICATION_EMAIL`, `INTERNAL_API_SECRET`, `ONBOARDING_APP_URL`
- `apps/onboarding-api`: `INTERNAL_API_SECRET`, callback URL to `apps/api`

---

## Task 7: Enrichment service

**Files:**
- Create: `apps/onboarding-api/src/services/enrichment.service.ts`

The enrichment service uses data already available (from the invitation + credentials), since Mews Has_Static_Data=1 means HG fetches static data automatically after ARI sync. At enrichment phase we collect what we can from the invite metadata and prompt the user to review.

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/enrichment.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildEnrichedData } from '../enrichment.service.js';

describe('buildEnrichedData', () => {
  it('merges invitation metadata with credentials', () => {
    const result = buildEnrichedData({
      hotelName: 'Grand Hotel',
      websiteUrl: 'https://grand.com',
      contactEmail: 'info@grand.com',
      credentials: { channelManagerCode: 'CM-123' },
    });
    expect(result.hotelName).toBe('Grand Hotel');
    expect(result.websiteUrl).toBe('https://grand.com');
    expect(result.credentials.channelManagerCode).toBe('CM-123');
  });

  it('provides defaults when invitation metadata is missing', () => {
    const result = buildEnrichedData({
      hotelName: undefined,
      websiteUrl: undefined,
      contactEmail: undefined,
      credentials: { channelManagerCode: 'X' },
    });
    expect(result.hotelName).toBe('');
    expect(result.city).toBe('');
    expect(result.countryCode).toBe('');
  });
});
```

- [ ] **Step 2: Create enrichment.service.ts**

Create `apps/onboarding-api/src/services/enrichment.service.ts`:

```typescript
export interface EnrichedHotelData {
  hotelName: string;
  websiteUrl: string;
  contactEmail: string;
  city: string;
  countryCode: string;
  starRating?: number;
  roomCount?: number;
  credentials: Record<string, string>;
}

export function buildEnrichedData(input: {
  hotelName?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  credentials: Record<string, string>;
}): EnrichedHotelData {
  return {
    hotelName: input.hotelName ?? '',
    websiteUrl: input.websiteUrl ?? '',
    contactEmail: input.contactEmail ?? '',
    city: '',
    countryCode: '',
    credentials: input.credentials,
  };
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/enrichment.service.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/onboarding-api/src/services/enrichment.service.ts \
        apps/onboarding-api/src/services/__tests__/enrichment.service.test.ts
git commit -m "feat(onboarding): enrichment service"
```

---

## Task 7b: Tax lookup service (fallback for payment-page scraping)

**Files:**
- Create: `apps/onboarding-api/src/services/tax-lookup.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/tax-lookup.service.test.ts`

When the Playwright harvester cannot navigate to the booking/payment page (too many redirect steps, captcha, login wall), this service returns standard accommodation taxes for the hotel's country and city from a curated static dataset. Taxes returned have `source: 'lookup'` so the data-review UI can warn the user.

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/tax-lookup.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { lookupTaxes } from '../tax-lookup.service.js';
import type { HarvestedFee } from '@ibe/onboarding-flows';

describe('lookupTaxes', () => {
  it('returns VAT + city tax for a known country+city', () => {
    const fees = lookupTaxes('Netherlands', 'Amsterdam');
    expect(fees.length).toBeGreaterThan(0);
    fees.forEach((f: HarvestedFee) => expect(f.source).toBe('lookup'));
    const vat = fees.find((f: HarvestedFee) => f.name.toLowerCase().includes('vat'));
    expect(vat).toBeDefined();
    const city = fees.find((f: HarvestedFee) => f.name.toLowerCase().includes('city') || f.name.toLowerCase().includes('tourist'));
    expect(city).toBeDefined();
  });

  it('returns at least country-level VAT for an unknown city', () => {
    const fees = lookupTaxes('Netherlands', 'Zutphen');
    expect(fees.length).toBeGreaterThan(0);
    const vat = fees.find((f: HarvestedFee) => f.name.toLowerCase().includes('vat'));
    expect(vat).toBeDefined();
  });

  it('returns empty array for a completely unknown country', () => {
    const fees = lookupTaxes('Atlantis', 'Lost City');
    expect(fees).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/tax-lookup.service.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found

- [ ] **Step 3: Create tax-lookup.service.ts**

Create `apps/onboarding-api/src/services/tax-lookup.service.ts`:

```typescript
import type { HarvestedFee } from '@ibe/onboarding-flows';

interface CountryTaxEntry {
  vatRate: string;          // e.g. "21%"
  vatName: string;          // e.g. "VAT", "GST", "TVA"
  cities?: Record<string, { name: string; amount: string; notes: string }>;
}

// Curated accommodation tax data — country-level VAT/GST + known city/tourist taxes.
// Sources: EU VAT rules, local tourism board publications.
const TAX_DATA: Record<string, CountryTaxEntry> = {
  'Netherlands': {
    vatRate: '9%', vatName: 'VAT',
    cities: {
      'Amsterdam': { name: 'Tourist tax', amount: '12.5% of room rate', notes: 'City tourist tax (toeristenbelasting), applied per night' },
      'Rotterdam': { name: 'Tourist tax', amount: '8% of room rate', notes: 'City tourist tax' },
      'The Hague': { name: 'Tourist tax', amount: '5.5% of room rate', notes: 'City tourist tax' },
    },
  },
  'France': {
    vatRate: '10%', vatName: 'TVA',
    cities: {
      'Paris': { name: 'Tourist tax (Taxe de séjour)', amount: '€5.20–€14.95/person/night', notes: 'Varies by star rating; applies to all guests' },
      'Nice': { name: 'Tourist tax (Taxe de séjour)', amount: '€3.30/person/night', notes: 'Applies to all guests' },
    },
  },
  'Germany': {
    vatRate: '7%', vatName: 'VAT',
    cities: {
      'Berlin': { name: 'City tax (Kurtaxe / Übernachtungsteuer)', amount: '5% of net room rate', notes: 'Applies per night; business travellers can be exempt with employer invoice' },
      'Hamburg': { name: 'City tax (Kulturförderabgabe)', amount: '5% of net room rate', notes: 'Exempt for business stays with employer invoice' },
      'Munich': { name: 'Kurtaxe', amount: '€3.50/person/night', notes: 'Applies per guest per night' },
    },
  },
  'United Kingdom': {
    vatRate: '20%', vatName: 'VAT',
  },
  'Spain': {
    vatRate: '10%', vatName: 'IVA',
    cities: {
      'Barcelona': { name: 'Tourist tax (Taxa turística)', amount: '€4.40/person/night', notes: '€2.25 city tax + €2.15 Catalonia regional tax; varies by hotel category' },
    },
  },
  'Italy': {
    vatRate: '10%', vatName: 'IVA',
    cities: {
      'Rome': { name: 'Tourist tax (Tassa di soggiorno)', amount: '€3–€7/person/night', notes: 'Varies by hotel category; exempt for children under 10' },
      'Venice': { name: 'Tourist tax (Contributo di accesso)', amount: '€3–€10/person/night', notes: 'Higher rates for peak dates' },
      'Florence': { name: 'Tourist tax', amount: '€4/person/night', notes: 'Per adult per night' },
      'Milan': { name: 'Tourist tax', amount: '€2–€5/person/night', notes: 'Varies by hotel category' },
    },
  },
  'Greece': {
    vatRate: '13%', vatName: 'VAT',
    cities: {},
  },
  'Portugal': {
    vatRate: '6%', vatName: 'IVA',
    cities: {
      'Lisbon': { name: 'Tourist tax', amount: '€2/person/night', notes: 'Max 7 nights; exempt for children under 13' },
      'Porto': { name: 'Tourist tax', amount: '2% of stay (min €2, max €2/night)', notes: 'Applied per stay' },
    },
  },
  'Austria': {
    vatRate: '13%', vatName: 'MwSt',
    cities: {
      'Vienna': { name: 'Ortstaxe', amount: '3.2% of room rate', notes: 'Municipal accommodation tax' },
    },
  },
  'Switzerland': {
    vatRate: '3.8%', vatName: 'MWST',
    cities: {
      'Zurich': { name: 'Tourist tax (Kurtaxe)', amount: 'CHF 2.50–7.00/person/night', notes: 'Varies by area within the city' },
      'Geneva': { name: 'Tourist tax', amount: 'CHF 3.30/person/night', notes: 'Applies per adult guest per night' },
    },
  },
  'United States': {
    vatRate: 'N/A', vatName: 'Sales tax varies by state',
    cities: {
      'New York City': { name: 'Hotel tax', amount: '14.75% + $3.50/night', notes: '8.875% sales tax + 5.875% city tax + $3.50 NYC tax per night' },
      'Las Vegas': { name: 'Hotel tax', amount: '13.38%', notes: 'State + county lodging tax; resort fees extra' },
      'Los Angeles': { name: 'Transient occupancy tax', amount: '14%', notes: 'City tax; plus sales tax ~10%' },
      'Miami': { name: 'Hotel tax', amount: '13%', notes: 'State + county; resort fees charged separately' },
    },
  },
  'United Arab Emirates': {
    vatRate: '5%', vatName: 'VAT',
    cities: {
      'Dubai': { name: 'Tourism Dirham fee', amount: 'AED 7–20/room/night', notes: 'AED 7/night (hotel), AED 10 (4-star), AED 20 (5-star); plus 5% VAT and 10% municipality fee' },
      'Abu Dhabi': { name: 'Tourist facility tax', amount: '4% of room rate', notes: 'Plus VAT; charged by municipality' },
    },
  },
  'Thailand': {
    vatRate: '7%', vatName: 'VAT',
  },
  'Indonesia': {
    vatRate: '11%', vatName: 'PPN',
    cities: {
      'Bali': { name: 'Hotel and restaurant tax (PHRI)', amount: '10% of room rate', notes: 'Plus VAT; regional accommodation tax' },
    },
  },
  'Australia': {
    vatRate: '10%', vatName: 'GST',
  },
  'Singapore': {
    vatRate: '9%', vatName: 'GST',
    cities: {
      'Singapore': { name: 'Tourism cess', amount: '1% of room rate', notes: 'Replaced CESS; plus GST' },
    },
  },
};

function normalise(s: string) {
  return s.toLowerCase().trim();
}

export function lookupTaxes(country: string, city: string): HarvestedFee[] {
  const entry = Object.entries(TAX_DATA).find(([k]) => normalise(k) === normalise(country));
  if (!entry) return [];

  const [, data] = entry;
  const fees: HarvestedFee[] = [];

  // Country-level VAT/GST
  if (data.vatRate !== 'N/A') {
    fees.push({
      name: data.vatName,
      amount: data.vatRate,
      notes: `Standard accommodation tax rate for ${country}`,
      source: 'lookup',
    });
  }

  // City/tourist tax
  if (data.cities) {
    const cityEntry = Object.entries(data.cities).find(([k]) => normalise(k) === normalise(city));
    if (cityEntry) {
      const [, cityTax] = cityEntry;
      fees.push({
        name: cityTax.name,
        amount: cityTax.amount,
        notes: cityTax.notes,
        source: 'lookup',
      });
    }
  }

  return fees;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/tax-lookup.service.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/tax-lookup.service.ts \
        apps/onboarding-api/src/services/__tests__/tax-lookup.service.test.ts
git commit -m "feat(onboarding): curated tax lookup service (fallback for payment-page scraping)"
```

---

## Task 8: Step executor + wizard SSE route

**Files:**
- Create: `apps/onboarding-api/src/services/step-executor.service.ts`
- Create: `apps/onboarding-api/src/routes/wizard.route.ts`

SSE pattern from `apps/api/src/routes/manual.route.ts`: use `reply.raw.write('data: ...\n\n')` and keep the response open until done.

**Step executor must handle all three data flows:**

```
Effective dataFlow = ctx.dataFlowOverride ?? flow.dataFlow

hg_pulls:     create_property (hasStaticData=true) → trigger_ari_sync → pending_review
blank:        create_property (hasStaticData=false) → create_rooms (with credentialTransform)
              → create_rateplans (with ratePlanCodeTransform if set; skip if ratePlanCodesProvidedByStaff)
              → create_policies → create_taxes → [connect_channel if !requiresStaffChannelSetup]
              → trigger_ari_sync → pending_review
reverse_pull: create_property (hasStaticData=false) → trigger_ari_sync → pending_review
              (CM pulls content from HG autonomously; no room/rateplan creation needed)
```

**Flag-driven behavior:**
- `useDefaultCodes=true` → generate codes (ROOM-01, FLEX-AI etc.) instead of using hotel-entered codes
- `credentialTransform` → apply before any HG BO API call that uses credentials
- `ratePlanCodeTransform` → apply per rate plan before POST /rateplans
- `regionAware=true` → after create_property, add admin queue item "Verify SiteMinder region"
- `childrenSupported=false` → enforce maxChildren=0 on all rooms during create_rooms
- `requiresStaffChannelSetup=true` → skip connect_channel step; show staffChannelSetupNote at completion

- [ ] **Step 1: Create step-executor.service.ts**

Create `apps/onboarding-api/src/services/step-executor.service.ts`:

```typescript
import type { FastifyReply } from 'fastify';
import { getVendorFlow, type OnboardingContext } from '@ibe/onboarding-flows';
import { hgBoClient } from './hg-bo.client.js';
import { advanceStep, getSession, completeSession } from './session.service.js';
import { buildEnrichedData } from './enrichment.service.js';
import prisma from '../db/client.js';

function sseEvent(reply: FastifyReply, data: Record<string, unknown>) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function executeAutomatedStep(sessionId: number, stepIndex: number, reply: FastifyReply) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const session = await getSession(sessionId);
  if (!session) {
    sseEvent(reply, { type: 'error', message: 'Session not found' });
    reply.raw.end();
    return;
  }

  const invitation = session.invitation;
  const flow = getVendorFlow(invitation.pmsId);
  if (!flow) {
    sseEvent(reply, { type: 'error', message: 'Unknown vendor' });
    reply.raw.end();
    return;
  }

  const enrichedData = (session.enrichedData as Record<string, unknown>) ?? {};
  const credentials = (enrichedData.credentials as Record<string, string>) ?? {};

  const ctx: OnboardingContext = {
    sessionId,
    pmsId: invitation.pmsId,
    organizationId: invitation.organizationId,
    credentials,
    enrichedData,
    hgPropertyCode: session.hgPropertyCode ?? undefined,
    completedSteps: [],
  };

  const step = flow.steps[stepIndex];
  sseEvent(reply, { type: 'start', stepId: step.id });

  try {
    if (step.id === 'enrich_data') {
      sseEvent(reply, { type: 'progress', message: 'Building enriched data...' });
      const enriched = buildEnrichedData({
        hotelName: invitation.hotelName,
        websiteUrl: invitation.websiteUrl,
        contactEmail: invitation.contactEmail,
        credentials,
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: enriched });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: enriched });
    }

    else if (step.id === 'create_hg_property') {
      sseEvent(reply, { type: 'progress', message: 'Creating property in HyperGuest...' });
      const payload = flow.getHGPropertyPayload({ ...ctx, enrichedData: { ...enrichedData } });
      const result = await hgBoClient.createProperty(payload);
      const propertyCode = result.property.propertyCode;
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { hgPropertyCode: propertyCode },
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: { propertyCode } });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: { propertyCode } });
    }

    else if (step.id === 'trigger_ari_sync') {
      sseEvent(reply, { type: 'progress', message: 'Triggering ARI sync...' });
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code — create_hg_property must run first');
      await hgBoClient.triggerAriSync(propertyCode);
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      // Last automated step — move session to pending_review
      const updatedSession = await getSession(sessionId);
      if (updatedSession && updatedSession.currentStep >= flow.steps.length - 1) {
        await completeSession(sessionId);
      }
      sseEvent(reply, { type: 'complete', stepId: step.id });
    }

    else {
      sseEvent(reply, { type: 'error', message: `Step ${step.id} is not an automated step` });
    }
  } catch (err: any) {
    await advanceStep(sessionId, stepIndex, { stepId: step.id, success: false, error: err.message });
    sseEvent(reply, { type: 'error', message: err.message });
  }

  reply.raw.end();
}
```

- [ ] **Step 2: Create wizard.route.ts**

Create `apps/onboarding-api/src/routes/wizard.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { getSession, advanceStep, saveCredentials } from '../services/session.service.js';
import { executeAutomatedStep } from '../services/step-executor.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';

function getSessionIdFromCookie(request: any): number | null {
  const raw = request.cookies?.onb_session;
  if (!raw) return null;
  const parsed = parseInt(raw);
  return isNaN(parsed) ? null : parsed;
}

export async function wizardRoutes(app: FastifyInstance) {
  // GET /wizard/state — returns current session state for the wizard UI
  app.get('/wizard/state', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) return reply.unauthorized('No session');

    const session = await getSession(sessionId);
    if (!session) return reply.notFound('Session not found');

    const flow = getVendorFlow(session.invitation.pmsId);
    return {
      sessionId: session.id,
      pmsId: session.invitation.pmsId,
      pmsName: session.invitation.pmsName,
      currentStep: session.currentStep,
      totalSteps: flow?.steps.length ?? 0,
      steps: session.stepsJson,
      enrichedData: session.enrichedData,
      hgPropertyCode: session.hgPropertyCode,
      status: session.status,
    };
  });

  // POST /wizard/submit-credentials — saves credentials and advances past credential step
  app.post<{ Body: { credentials: Record<string, string> } }>(
    '/wizard/submit-credentials',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');

      const session = await getSession(sessionId);
      if (!session) return reply.notFound('Session not found');

      const flow = getVendorFlow(session.invitation.pmsId);
      if (!flow) return reply.badRequest('Unknown vendor');

      const parsed = flow.credentialsSchema.safeParse(request.body.credentials);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);

      await saveCredentials(sessionId, parsed.data);
      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep].id,
        success: true,
        data: { credentials: parsed.data },
      });

      return { ok: true };
    }
  );

  // POST /wizard/confirm-review — user confirms enriched data (with any edits)
  app.post<{ Body: { enrichedData: Record<string, unknown> } }>(
    '/wizard/confirm-review',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');

      const session = await getSession(sessionId);
      if (!session) return reply.notFound('Session not found');

      const flow = getVendorFlow(session.invitation.pmsId);
      if (!flow) return reply.badRequest('Unknown vendor');

      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep].id,
        success: true,
        data: request.body.enrichedData,
      });

      return { ok: true };
    }
  );

  // GET /wizard/execute — SSE stream for automated step execution
  app.get('/wizard/execute', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) {
      reply.code(401).send('No session');
      return;
    }

    const session = await getSession(sessionId);
    if (!session) {
      reply.code(404).send('Session not found');
      return;
    }

    await executeAutomatedStep(sessionId, session.currentStep, reply);
  });
}
```

- [ ] **Step 3: Register wizard routes in app.ts**

Edit `apps/onboarding-api/src/app.ts`:

```typescript
import { wizardRoutes } from './routes/wizard.route.js';
// inside buildApp():
await app.register(wizardRoutes);
```

- [ ] **Step 4: Type check**

```bash
cd apps/onboarding-api && pnpm type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/step-executor.service.ts \
        apps/onboarding-api/src/routes/wizard.route.ts \
        apps/onboarding-api/src/app.ts
git commit -m "feat(onboarding): step executor + wizard SSE route"
```

---

## Task 9: apps/onboarding Next.js scaffold

**Files:**
- Create: `apps/onboarding/package.json`
- Create: `apps/onboarding/tsconfig.json`
- Create: `apps/onboarding/next.config.mjs`
- Create: `apps/onboarding/src/app/layout.tsx`
- Create: `apps/onboarding/src/app/page.tsx`
- Create: `apps/onboarding/src/lib/api.ts`

- [ ] **Step 1: Create package.json**

Create `apps/onboarding/package.json`:

```json
{
  "name": "@ibe/onboarding",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `apps/onboarding/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "incremental": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.mjs**

Create `apps/onboarding/next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ONBOARDING_API_URL: process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003',
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create layout.tsx**

Create `apps/onboarding/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HyperGuest Onboarding',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f9fa' }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create root page.tsx (self-registration form)**

Create `apps/onboarding/src/app/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const PMS_OPTIONS = [{ id: 4, name: 'Mews' }];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ hotelName: '', pmsId: 4, contactEmail: '', websiteUrl: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.register(form);
      router.push('/wizard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Connect Your Property</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>Join HyperGuest in a few simple steps.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Name</label>
            <input type="text" required value={form.hotelName} onChange={(e) => setForm((p) => ({ ...p, hotelName: e.target.value }))}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Property Management System</label>
            <select value={form.pmsId} onChange={(e) => setForm((p) => ({ ...p, pmsId: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem' }}>
              {PMS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Contact Email</label>
            <input type="email" required value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Website <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span></label>
            <input type="url" value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))}
              placeholder="https://" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Starting...' : 'Get Started →'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Have an invitation link? <a href="#" onClick={(e) => { e.preventDefault(); /* handled by /start/[token] */ }} style={{ color: '#2563eb' }}>Click here</a>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create src/lib/api.ts**

Create `apps/onboarding/src/lib/api.ts`:

```typescript
const BASE = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  initSession: (token: string) => request<{ ok: boolean; sessionId: number }>('POST', '/session', { token }),
  register: (data: { hotelName: string; pmsId: number; contactEmail: string; websiteUrl?: string }) =>
    request<{ ok: boolean; sessionId: number }>('POST', '/register', data),
  getState: () => request<WizardState>('GET', '/wizard/state'),
  submitCredentials: (credentials: Record<string, string>) =>
    request<{ ok: boolean }>('POST', '/wizard/submit-credentials', { credentials }),
  confirmReview: (enrichedData: Record<string, unknown>) =>
    request<{ ok: boolean }>('POST', '/wizard/confirm-review', { enrichedData }),
};

export interface WizardState {
  sessionId: number;
  pmsId: number;
  pmsName: string;
  currentStep: number;
  totalSteps: number;
  steps: Array<{ id: string; kind: string; title: string; description: string; status: string }>;
  enrichedData: Record<string, unknown> | null;
  hgPropertyCode: string | null;
  status: string;
}
```

- [ ] **Step 7: Install deps**

```bash
cd /home/nir/ibe && pnpm install
```

- [ ] **Step 8: Type check**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/onboarding/
git commit -m "feat(onboarding): Next.js 14 onboarding app scaffold"
```

---

## Task 10: /start/[token] page

**Files:**
- Create: `apps/onboarding/src/app/start/[token]/page.tsx`

This page is a Server Component that calls the onboarding-api to exchange the token for a session cookie, then redirects to the wizard.

- [ ] **Step 1: Create the page**

Create `apps/onboarding/src/app/start/[token]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

interface Props {
  params: { token: string };
}

export default async function StartPage({ params }: Props) {
  const { token } = params;

  if (!token) redirect('/');

  const apiUrl = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';

  try {
    const res = await fetch(`${apiUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return (
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
          <h2>Invalid or Expired Invitation</h2>
          <p style={{ color: '#666' }}>{text || 'This invitation link is no longer valid. Please contact your HyperGuest representative.'}</p>
        </main>
      );
    }

    // The session cookie is set by onboarding-api via Set-Cookie header.
    // Next.js Server Components can forward Set-Cookie headers automatically
    // when using credentials: 'include' — but since this is server-to-server,
    // we need to manually forward the cookie.
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const cookieStore = cookies();
      const match = setCookie.match(/onb_session=([^;]+)/);
      if (match) {
        cookieStore.set('onb_session', match[1], {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }
    }
  } catch {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h2>Something went wrong</h2>
        <p>Please try again or contact support.</p>
      </main>
    );
  }

  redirect('/wizard');
}
```

- [ ] **Step 2: Type check**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/onboarding/src/app/start/
git commit -m "feat(onboarding): token exchange page /start/[token]"
```

---

## Task 11: Wizard page + WizardLayout

**Files:**
- Create: `apps/onboarding/src/app/wizard/page.tsx`
- Create: `apps/onboarding/src/components/WizardLayout.tsx`

- [ ] **Step 1: Create WizardLayout.tsx**

Create `apps/onboarding/src/components/WizardLayout.tsx`:

```tsx
'use client';

import type { WizardState } from '@/lib/api';

interface Props {
  state: WizardState;
  children: React.ReactNode;
}

export function WizardLayout({ state, children }: Props) {
  const progress = state.totalSteps > 0 ? (state.currentStep / state.totalSteps) * 100 : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e' }}>HyperGuest</span>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Hotel Onboarding — {state.pmsName}</span>
      </header>

      {/* Progress bar */}
      <div style={{ background: '#e0e0e0', height: '4px' }}>
        <div style={{ background: '#2563eb', height: '100%', width: `${progress}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Step indicator */}
      <div style={{ textAlign: 'center', padding: '0.75rem', color: '#666', fontSize: '0.85rem' }}>
        Step {state.currentStep + 1} of {state.totalSteps}
      </div>

      {/* Content */}
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem 1rem' }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create wizard page.tsx**

Create `apps/onboarding/src/app/wizard/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type WizardState } from '@/lib/api';
import { WizardLayout } from '@/components/WizardLayout';
import { AutomatedStep } from '@/components/steps/AutomatedStep';
import { CredentialsStep } from '@/components/steps/CredentialsStep';
import { DataReviewStep } from '@/components/steps/DataReviewStep';
import { UserActionStep } from '@/components/steps/UserActionStep';

export default function WizardPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadState() {
    try {
      const s = await api.getState();
      setState(s);
    } catch (err: any) {
      if (err.message.includes('401') || err.message.includes('No session')) {
        router.push('/');
      } else {
        setError(err.message);
      }
    }
  }

  useEffect(() => { loadState(); }, []);

  if (error) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666' }}>{error}</p>
          <button onClick={loadState}>Retry</button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (state.status === 'pending_review' || state.status === 'approved') {
    router.push('/pending');
    return null;
  }

  const currentStepDef = state.steps[state.currentStep];

  function renderStep() {
    if (!currentStepDef) return null;
    switch (currentStepDef.kind) {
      case 'automated':
        return <AutomatedStep step={currentStepDef} onComplete={loadState} />;
      case 'credentials':
        return <CredentialsStep step={currentStepDef} pmsId={state!.pmsId} onComplete={loadState} />;
      case 'data_review':
        return <DataReviewStep step={currentStepDef} enrichedData={state!.enrichedData ?? {}} onComplete={loadState} />;
      case 'user_action':
        return <UserActionStep step={currentStepDef} />;
      default:
        return <p>Unknown step type</p>;
    }
  }

  return (
    <WizardLayout state={state}>
      {renderStep()}
    </WizardLayout>
  );
}
```

- [ ] **Step 3: Create pending page**

Create `apps/onboarding/src/app/pending/page.tsx`:

```tsx
export default function PendingPage() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
      <h1 style={{ marginBottom: '0.5rem' }}>You&apos;re all set!</h1>
      <p style={{ color: '#444', fontSize: '1.05rem', maxWidth: '480px', lineHeight: 1.6 }}>
        Your property has been successfully connected. Our team will review your setup and reach out within 24 hours to confirm you&apos;re live on HyperGuest.
      </p>
      <div style={{ marginTop: '2rem', padding: '1rem 1.5rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', maxWidth: '400px' }}>
        <p style={{ color: '#15803d', fontWeight: 600, margin: 0 }}>What happens next?</p>
        <p style={{ color: '#166534', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          HyperGuest will verify your connection, activate your listing, and notify you when buyers can start booking.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Type check**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: errors about missing step components (will be fixed in Task 12)

- [ ] **Step 5: Commit skeleton (components will be stubs)**

We'll create stub components in Task 12 before running type-check clean.

---

## Task 12: Step renderer components

**Files:**
- Create: `apps/onboarding/src/components/steps/AutomatedStep.tsx`
- Create: `apps/onboarding/src/components/steps/CredentialsStep.tsx`
- Create: `apps/onboarding/src/components/steps/DataReviewStep.tsx`
- Create: `apps/onboarding/src/components/steps/UserActionStep.tsx`

- [ ] **Step 1: Create AutomatedStep.tsx**

Create `apps/onboarding/src/components/steps/AutomatedStep.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  step: { id: string; title: string; description: string };
  onComplete: () => void;
}

interface SseEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export function AutomatedStep({ step, onComplete }: Props) {
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const apiUrl = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';
    const es = new EventSource(`${apiUrl}/wizard/execute`, { withCredentials: true });

    es.onmessage = (e) => {
      const event: SseEvent = JSON.parse(e.data);
      if (event.type === 'progress' && event.message) {
        setMessages((prev) => [...prev, event.message!]);
      } else if (event.type === 'complete') {
        setStatus('done');
        es.close();
        setTimeout(onComplete, 800);
      } else if (event.type === 'error') {
        setMessages((prev) => [...prev, `Error: ${event.message}`]);
        setStatus('error');
        es.close();
      }
    };

    es.onerror = () => {
      setStatus('error');
      setMessages((prev) => [...prev, 'Connection lost']);
      es.close();
    };

    return () => es.close();
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      {status === 'running' && (
        <div style={{ marginBottom: '1rem', color: '#2563eb' }}>Working...</div>
      )}
      {status === 'done' && (
        <div style={{ color: '#16a34a', fontWeight: 600 }}>Done ✓</div>
      )}
      {status === 'error' && (
        <div style={{ color: '#dc2626' }}>Something went wrong. Please try again.</div>
      )}

      <ul style={{ textAlign: 'left', listStyle: 'none', padding: 0, marginTop: '1rem' }}>
        {messages.map((m, i) => (
          <li key={i} style={{ padding: '0.25rem 0', color: status === 'error' && i === messages.length - 1 ? '#dc2626' : '#374151', fontSize: '0.9rem' }}>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create CredentialsStep.tsx**

For Mews, `pmsId=4`, the schema has one field: `channelManagerCode`. The component renders fields based on what the schema requires (for now Mews only, additional vendors added when their flows are implemented).

Create `apps/onboarding/src/components/steps/CredentialsStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  pmsId: number;
  onComplete: () => void;
}

const CREDENTIAL_FIELDS: Record<number, Array<{ key: string; label: string; placeholder: string; hint?: string }>> = {
  4: [
    {
      key: 'channelManagerCode',
      label: 'Channel Manager Code',
      placeholder: 'e.g. CM-12345',
      hint: 'Find this in Mews Operations → Settings → Integrations → Channel Managers',
    },
  ],
};

export function CredentialsStep({ step, pmsId, onComplete }: Props) {
  const fields = CREDENTIAL_FIELDS[pmsId] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.submitCredentials(values);
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {fields.map((field) => (
          <div key={field.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>{field.label}</label>
            <input
              type="text"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              required
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }}
            />
            {field.hint && <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>{field.hint}</p>}
          </div>
        ))}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create DataReviewStep.tsx**

Create `apps/onboarding/src/components/steps/DataReviewStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  enrichedData: Record<string, unknown>;
  onComplete: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'hotelName', label: 'Hotel Name', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'countryCode', label: 'Country Code (2-letter)', type: 'text' },
  { key: 'websiteUrl', label: 'Website URL', type: 'url' },
  { key: 'contactEmail', label: 'Contact Email', type: 'email' },
  { key: 'starRating', label: 'Star Rating (1-5)', type: 'number' },
  { key: 'roomCount', label: 'Number of Rooms', type: 'number' },
];

export function DataReviewStep({ step, enrichedData, onComplete }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.key, String(enrichedData[f.key] ?? '')]))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.hotelName?.trim()) { setError('Hotel name is required'); return; }
    if (!values.city?.trim()) { setError('City is required'); return; }
    if (!values.countryCode?.trim() || values.countryCode.length !== 2) { setError('Country code must be 2 letters (e.g. GB, US)'); return; }

    setError(null);
    setLoading(true);
    try {
      await api.confirmReview({ ...enrichedData, ...values });
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {EDITABLE_FIELDS.map((field) => (
          <div key={field.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>{field.label}</label>
            <input
              type={field.type}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              style={{ width: '100%', padding: '0.7rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Saving...' : 'Confirm & Continue'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create UserActionStep.tsx**

Create `apps/onboarding/src/components/steps/UserActionStep.tsx`:

```tsx
interface Props {
  step: { id: string; title: string; description: string };
}

export function UserActionStep({ step }: Props) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#444', fontSize: '1.05rem', lineHeight: 1.6 }}>{step.description}</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
        <p style={{ color: '#15803d', fontWeight: 600, margin: 0 }}>What happens next?</p>
        <p style={{ color: '#166534', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          Your HyperGuest team will review your connection and reach out within 24 hours to confirm your first booking is ready.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type check everything**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/onboarding/src/
git commit -m "feat(onboarding): wizard UI — step renderers and layout"
```

---

## Task 13: Admin module in apps/web

**Files:**
- Create: `apps/web/src/app/admin/hotel-onboarding/page.tsx`
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

### onboarding_staff role

`onboarding_staff` is a new role value on `AdminUser.role` (existing values: `super`, `admin`, `observer`, `user`, `affiliate`). No DB migration needed — it's a plain string column.

**What onboarding_staff can do:** all hotel-onboarding functionality (create invitations, monitor harvest status, retry failed harvests, view session queue, assist hotels through the wizard, approve hotels to go live).

**What they cannot do:** access any other admin section (bookings, design, config, payments, etc.).

**Who assigns the role:** full super-admins, via the existing admin user management UI.

**Nav changes in `_layout-client.tsx`:**

```typescript
// Add onboardingOnly to types:
type NavItem = { ...; onboardingOnly?: boolean }
type Section = { ...; onboardingOnly?: boolean }

// Add hotel-onboarding section:
{
  title: 'Hotel Onboarding',
  onboardingOnly: true,
  items: [
    { href: '/admin/hotel-onboarding', label: 'Invitations & Queue', onboardingOnly: true },
  ],
}

// In the section/item filter logic — hide non-onboarding sections from onboarding_staff:
// A section is visible to onboarding_staff ONLY if it has onboardingOnly: true
// All other sections are hidden (same way sellerOnly hides sections from buyers)
const isOnboardingStaff = me.role === 'onboarding_staff'
const sectionVisible = isOnboardingStaff ? section.onboardingOnly === true : /* existing logic */
```

**API route guard (in onboarding-admin.route.ts):**

```typescript
// Replace the existing super-only check with:
const isAllowed = (role: string) => role === 'super' || role === 'onboarding_staff'
if (!isAllowed(me.role)) return reply.forbidden()
```

This adds an admin page with three tabs:
1. **New Invitation** — form to create invitation (requires `ibeUrl` for staff flow; harvest kicks off immediately in background)
2. **All Sessions** — table of all sessions with status badge per row; "Copy Link" available only when `harvestStatus=complete`; "Approve" button for `pending_review` sessions
3. **Needs Attention** — filtered view of all sessions requiring HG staff action, with distinct labels and actions per issue type:

| Issue | Session status | Label shown | Staff action |
|-------|---------------|-------------|-------------|
| IBE URL not recognised | `pending_ibe_review` | 🔴 Unknown IBE — [url] | Add IBE pattern (admin UI hostname entry or Claude Code session) then click "Resume" |
| CM not in registry | `pending_ari_source` | 🔴 Unknown CM — "[hotel-typed name]" | Add VendorFlow (Claude Code session) then click "Resume" |
| Harvest failed | `in_progress` + `harvestStatus=failed` | 🔴 Harvest Failed — [error] | Fix and click "Retry Harvest" |
| Pending approval | `pending_review` | 🟡 Awaiting Approval | Review and click "Approve" |

When staff resolves a `pending_ibe_review` or `pending_ari_source` session, they click "Resume" — this re-runs detection/validation and moves the session forward automatically, then sends the hotel an email: "Great news — we've added support for your [IBE/CM]. Click here to continue."

`harvestStatus` badges: `pending`=grey, `harvesting`=blue spinner, `complete`=green, `failed`=red.
Session status badges: `in_progress`=blue, `pending_ibe_review`=red, `pending_ari_source`=red, `pending_review`=amber, `approved`=green, `abandoned`=grey.

The page follows the same patterns as other admin pages in the codebase.

- [ ] **Step 1: Find where admin pages live and how they authenticate**

```bash
ls apps/web/src/app/admin/ | head -20
head -30 apps/web/src/app/admin/layout.tsx 2>/dev/null || head -30 apps/web/src/app/admin/bookings/page.tsx 2>/dev/null
```

This step is read-only — confirm the pattern before writing the page.

- [ ] **Step 2: Create the admin page**

Create `apps/web/src/app/admin/hotel-onboarding/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api'; // same helper used by all admin pages

interface Invitation {
  id: number;
  token: string;
  pmsName: string;
  hotelName?: string;
  contactEmail?: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  session?: { status: string; currentStep: number } | null;
}

const PMS_OPTIONS = [
  { id: 4, name: 'Mews' },
];

export default function HotelOnboardingPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ pmsId: 4, hotelName: '', contactEmail: '', websiteUrl: '' });
  const [newLink, setNewLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingAppUrl = process.env.NEXT_PUBLIC_ONBOARDING_APP_URL ?? 'http://localhost:3002';

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<Invitation[]>('GET', '/admin/hotel-onboarding/invitations');
      setInvitations(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNewLink(null);
    try {
      const inv = await apiRequest<Invitation>('POST', '/admin/hotel-onboarding/invitations', form);
      setNewLink(`${onboardingAppUrl}/start/${inv.token}`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!confirm('Revoke this invitation?')) return;
    await apiRequest('DELETE', `/admin/hotel-onboarding/invitations/${id}`);
    await load();
  }

  function statusBadge(inv: Invitation) {
    if (inv.revokedAt) return <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Revoked</span>;
    if (inv.session?.status === 'completed') return <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Completed</span>;
    if (inv.usedAt) return <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>In Progress (step {inv.session?.currentStep ?? 0})</span>;
    if (new Date(inv.expiresAt) < new Date()) return <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Expired</span>;
    return <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Pending</span>;
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Hotel Onboarding</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Generate invitation links for hotels to self-onboard onto HyperGuest.</p>

      {/* Create form */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>New Invitation</h2>
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>System / PMS</label>
            <select
              value={form.pmsId}
              onChange={(e) => setForm((p) => ({ ...p, pmsId: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              {PMS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Name</label>
            <input type="text" value={form.hotelName} onChange={(e) => setForm((p) => ({ ...p, hotelName: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Website</label>
            <input type="url" value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://..." style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            {error && <p style={{ color: '#dc2626', marginBottom: '0.5rem' }}>{error}</p>}
            <button type="submit" disabled={creating} style={{ padding: '0.7rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating...' : 'Generate Invitation Link'}
            </button>
          </div>
        </form>

        {newLink && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
            <p style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.25rem' }}>Invitation link created:</p>
            <code style={{ wordBreak: 'break-all', fontSize: '0.875rem', color: '#166534' }}>{newLink}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newLink)}
              style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem', border: '1px solid #16a34a', borderRadius: '4px', background: 'transparent', color: '#16a34a', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Invitations table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Invitations</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : invitations.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No invitations yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Hotel</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>PMS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Expires</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{inv.hotelName || '—'}</div>
                    {inv.contactEmail && <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{inv.contactEmail}</div>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{inv.pmsName}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(inv)}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {!inv.usedAt && !inv.revokedAt && (
                      <>
                        <button
                          onClick={() => navigator.clipboard.writeText(`${onboardingAppUrl}/start/${inv.token}`)}
                          style={{ marginRight: '0.5rem', padding: '0.25rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent' }}
                        >
                          Copy Link
                        </button>
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent', color: '#dc2626' }}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add to admin navigation**

Find where admin nav items are defined:

```bash
grep -rn "hotel-onboarding\|onboarding" apps/web/src/ --include="*.tsx" --include="*.ts" | head -5
grep -rn '"Config"\|"config"\|adminNavItems\|navItems' apps/web/src/components/ --include="*.tsx" | head -10
```

Add a nav item pointing to `/admin/hotel-onboarding` in the appropriate config file (follow the existing pattern for nav items in this codebase).

- [ ] **Step 4: Type check**

```bash
cd apps/web && pnpm type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/hotel-onboarding/
git commit -m "feat(onboarding): admin hotel-onboarding page (invitations + status)"
```

---

## End-to-End Manual Test Checklist

After all tasks are complete, test all three entry points:

**Entry Point 1 — Self-registration:**
- [ ] Start `apps/onboarding-api` and `apps/onboarding` dev servers
- [ ] Open `http://localhost:3002` — name + city + country form appears
- [ ] Fill in hotel name, city, country → click "Find My Hotel"
- [ ] Candidate cards appear — pick the correct one (or paste a URL)
- [ ] AutomatedStep: "Collecting your property information" — Playwright harvests IBE data via SSE
- [ ] DataReview: harvested rooms/descriptions/images shown — confirm/edit
- [ ] CredentialsStep: enter Mews Channel Manager Code → click Connect
- [ ] AutomatedStep: "Creating HyperGuest Profile" → calls HG BO API
- [ ] AutomatedStep: "Syncing Availability & Rates" → triggers ARI sync
- [ ] Redirects to `/pending` — "Our team will review within 24h"
- [ ] In IBE admin, session shows `pending_review` → click Approve → `approved`

**Entry Point 2 — Staff invitation:**
- [ ] In IBE admin, go to `/admin/hotel-onboarding`
- [ ] Fill hotel name + city + country → click "Generate Invitation Link"
- [ ] Copy link → open in browser → redirects to wizard with fields pre-filled
- [ ] Same wizard steps as Entry Point 1
- [ ] Redirects to `/pending` → admin Approve button visible

**Unknown IBE path:**
- [ ] Pick a URL whose IBE is not in the registry
- [ ] Wizard shows `PendingIbeStep` — "Our team is adding support, we'll email you"
- [ ] In IBE admin, session shows `pending_ibe_review` flag
- [ ] HG staff adds IBE pattern → clicks "Resolve" → session resumes

---

## Self-Review

**Spec coverage:**
- Token-based invite: Task 4 ✓
- Session state machine: Task 5 ✓
- Mews vendor flow (pmsId=4, Form_Type=ID): Tasks 2 + 8 ✓
- HG BO API integration: Task 6 ✓
- SSE step streaming: Task 8 ✓
- Wizard UI: Tasks 9–12 ✓
- Admin module: Task 13 ✓
- DB models: Task 1 ✓

**Gaps / Phase 2 scope (not in this plan):**
- Zoho CRM/Desk trigger (Entry Point 3) — DB field `source='zoho'` reserved
- AI assistant bubble in wizard
- Help request flow (OnboardingHelpRequest model is in place)
- Email sending of invitation link (self-registration currently relies on browser redirect; staff invite link is copy-pasted manually)
- Additional vendor flows beyond Mews
- Subdomain routing for `onboard.hyperguest.com`
- Render.com deployment config for the two new apps
