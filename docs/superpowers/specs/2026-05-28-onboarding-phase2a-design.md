# Self-Onboarding Phase 2-A Design

**Date:** 2026-05-28  
**Scope:** Area A — Core wizard completeness (Approach B: harvester → cm_settings → steps 9–12 → candidate search)  
**Excludes:** Zoho CRM trigger, additional vendor flows, Render.com deployment, subdomain routing

---

## Overview

Phase 1 delivered the full wizard skeleton: DB models, session state machine, HG BO API client, SiteMinder vendor flow, and the admin invitation UI. Every automated step that touches HG BO API either stubs out or runs with no real data.

Phase 2-A makes the wizard functional end-to-end for SiteMinder hotels:

| What | Phase 1 state | Phase 2-A delivers |
|------|--------------|-------------------|
| Harvest (step 4) | `null` stub | SynXis Playwright harvester, balanced multi-pass strategy |
| Candidate search (step 2) | Missing | DuckDuckGo search → resolver → IBE detection with screenshots |
| IBE URL resolver | `detectKnownIBE()` only | Full resolver: detection + booking-button follower, up to 5 hops |
| cm_settings (step 5) | Missing | Full UI: currency, pricing model, rate plan mapping table, tax relations |
| Steps 9–12 | Missing | create_rooms → create_rateplans → create_policies → create_taxes |
| SiteMinder step sequence | 8 steps | 13 steps (4 new blank-flow steps inserted) |

**Implementation order (Approach B):** SynXis harvester → cm_settings → steps 9–12 → candidate search. Candidate search is last because the wizard already works without it (staff invitations always supply the IBE URL; self-reg hotels can paste it manually).

---

## Section 1: IBE URL Resolver

### Purpose

Replaces the current single-tier `detectKnownIBE()` call with a multi-tier resolver that can start from any hotel-related URL — including the hotel's main WordPress/CMS website — and work its way through to the actual booking engine.

### Problem it solves

Many hotels have a main website (e.g. `grandhotel.com`) separate from their IBE (e.g. `reservations.grandhotel.com/?chain=XXXXX&hotel=YYY`). Passing the main website URL directly to `detectKnownIBE()` finds nothing. The resolver bridges this by following booking-intent links automatically.

### New file

`apps/onboarding-api/src/services/ibe-resolver.service.ts`

### Resolution pipeline (in order)

```
Input URL
  │
  ├─ Tier 1: detectKnownIBE(url) from @ibe/shared        ← fast, no browser
  │   match → return { ibeName, ibeUrl, hotelId }
  │
  ├─ Tier 2: IBERegistry DB hostname lookup               ← fast, no browser
  │   match → return { ibeName, ibeUrl, hotelId }
  │
  └─ Tier 3: Stealth browser — booking-button follower
       Navigate to URL
       Loop (max 5 hops, breadth-first):
         a. Run Tier 1 + 2 on current URL → match → done
         b. Scan page for booking-intent links:
              <a href> and <button> whose visible text or aria-label
              matches /book|reserv|check.?avail|rooms?.?rates?|availability/i
         c. Prioritise <a href> candidates (have destination URL without navigating)
         d. Run Tier 1 + 2 on each href candidate before navigating
         e. Navigate to best candidate → repeat
       Exhausted → return { status: 'unresolved' }
```

### Outcomes

| Outcome | Next step |
|---------|-----------|
| `{ ibeName, ibeUrl, hotelId }` | Proceed to harvest |
| `{ status: 'unresolved' }` in self-reg | Show "paste your direct booking URL" prompt; if that also fails → `pending_ibe_review` |
| `{ status: 'unresolved' }` in staff invite | `harvestStatus = 'failed'` → needs-attention queue |

### Notes

- HTTP redirects and JS navigation are handled automatically by Playwright (browser follows them)
- Maximum 5 hops prevents infinite loops on sites with circular navigation
- Breadth-first: tries all booking-intent links at the current page level before going deeper

---

## Section 2: SynXis Harvester

### Architecture

```
apps/onboarding-api/src/services/
  playwright-browser.service.ts      (copied from apps/api — stealth Chromium)
  ibe-harvester.service.ts           orchestrator: resolver → pick harvester → run
  ibe-harvester-map.ts               Map<ibeName, IbeHarvester>
  harvesters/
    synxis-harvester.ts              SynXis Playwright implementation
```

`playwright` added to `apps/onboarding-api/package.json` dependencies.

### Harvester interface

```typescript
interface IbeHarvester {
  harvest(
    ibeUrl: string,
    ctx: { checkIn: string; checkOut: string },  // dummy dates ~30 days out
    onProgress: (msg: string) => void
  ): Promise<HarvestedHotelData>;
}
```

`ibe-harvester-map.ts` registers `['Sabre SynXis', new SynXisHarvester()]`.

### Search strategy — balanced multi-pass

Two date windows × core occupancy matrix, early-stop when no new rooms found:

| Pass | Dates | Duration | Occupancy patterns |
|------|-------|----------|--------------------|
| Near baseline | 7d out | 1 night | 1A, 2A, 3A, 4A, 2A+1C(age 8), 2A+2C(age 8) |
| Mid baseline | 30d out | 1 night | same 6 patterns |
| Age sweep | 30d out | 1 night | 2A+1C at child ages 0→17 |

**Early-stop rule:** halt occupancy passes within a date window if 3 consecutive searches find zero new room types.

**Extended harvest** (triggered from Data Review if hotel says rooms are missing):
- Additional passes: 90d/3-night, occupancy up to 5A, 3A+1C, 2A+3C
- Same early-stop rule

### SynXis harvest sequence (5 pass types)

1. **Hotel info pass** — navigate search URL (1A, 30d), extract from SynXis header/banner:
   - Name, star rating, address, city, country
   - Property images (hero + gallery)
   - Description text
   - Amenity list (pool, gym, spa, etc.)

2. **Policies pass** — attempt `/?...&type=about` URL:
   - Regex-parse check-in/out times, pets, smoking, min check-in age, parking, extra bed policy
   - If page 404s → mark all policy types as missing (DataReviewStep shows defaults for hotel to confirm)

3. **Occupancy passes** — for each occupancy × date window combination:
   - Build URL from `searchTemplate` (already in shared registry)
   - Wait for room cards to render (`waitForSelector('[data-testid="room-card"]')` or equivalent)
   - Per room card: name, description, images, bed configuration, amenities
   - Accumulate `supportedOccupancies` per room across all searches
   - Per rate option on each card: extract board type label + R/NR label

4. **Age sweep** — 2A+1C at child ages 0→17:
   - Track board type labels and visible price across ages
   - Age boundaries where price or board type changes → `AgeCategory[]`
   - Source tagged `'price_sweep'`; if IBE shows explicit age selector → parse directly (`'dropdown'`)

5. **Taxes** — `lookupTaxes(country, city)` from `tax-lookup.service.ts`:
   - All results tagged `source: 'lookup'`
   - DataReviewStep shows a "please verify" warning on lookup-sourced taxes

### Rate plan discovery and cancellation policy parsing

Each rate option visible in the IBE has:
- Board type label → normalised to `RO | BB | HB | FB | AI` using lookup table
- Refundability label → `hasRefundable` / `hasNonRefundable`
- Cancellation policy text → parsed to `HarvestedCancellationPolicy`

**Cancellation policy parser** (`harvesters/cancellation-policy-parser.ts`):

| IBE text pattern | Parsed result |
|-----------------|---------------|
| "Non-Refundable", "Non Refundable", "Fully Non-Refundable" | `{ type: 'non_refundable' }` |
| "Free cancellation until N days before" | `{ type: 'custom', deadlineDays: N, noShowPenalty: { value: 100, chargeType: 'percent' }, frames: [] }` |
| "Cancel until Xh before with no penalty" | Convert hours to days (ceil), same structure |
| "50% charge if cancelled within N days" | `{ type: 'custom', deadlineDays: N, frames: [{ daysBeforeCheckin: N, penaltyValue: 50, chargeType: 'percent' }] }` |
| Unrecognised text | `null` — raw text saved; hotel edits in cm_settings |

### Wire-up

**`internal.route.ts`** — replaces `null` stub:
```typescript
const harvestedData = await ibeHarvesterService.harvest(ibeUrl, ctx, onProgress);
```

**`step-executor.service.ts`** — adds `harvest_data` case:
- Sets SSE headers, streams progress events via `onProgress`
- Saves `HarvestedHotelData` to `session.harvestedData`
- Marks step complete, advances session

### Data Review additions

**Room code entry (blank flow only)** — `DataReviewStep.tsx` gains a "Room Codes" section shown only when `flow.dataFlow === 'blank'`. For each room discovered by the harvester, the hotel enters the exact code their CM uses for that room type:

```
Room types discovered:
  Standard Double    CM code: [__________]
  Superior King      CM code: [__________]
  Junior Suite       CM code: [__________]
```

These values are saved to `session.enrichedData.roomCodes: Record<roomName, cmCode>` and consumed by `create_rooms`. Required — the step cannot advance without all codes filled in.

**Two additional UI affordances in `DataReviewStep.tsx`:**

**"Did we find all your room types?" section:**
```
Found 3 room types. Does this look complete?
  [Yes, continue]   [Run extended search]
```
- "Run extended search" → `POST /wizard/extend-harvest` → SSE stream (same AutomatedStep spinner) → merges new rooms into `session.harvestedData` → Data Review reloads

**"Add a room manually" fallback:**
```
+ Add a room we didn't find
```
- Opens inline form: room name, max adults, max occupancy, bed configuration
- `POST /wizard/add-room-manually` → appends to `session.harvestedData.rooms`

---

## Section 3: cm_settings Wizard Step

### New files

```
apps/onboarding-api/src/routes/wizard.route.ts    add POST /wizard/submit-cm-settings
apps/onboarding/src/components/steps/CmSettingsStep.tsx
```

### UI structure

**Block 1 — Property-level settings:**
- Currency (text input, pre-suggested from country/harvest context, e.g. "EUR")
- Pricing model: `per_room` / `per_occupancy` / `per_person` (radio group)
- If `flow.supportedPricingModels` has only one value → auto-set, hidden

**Block 2 — Rate plan mapping table:**

One row per `DiscoveredRatePlanType × refundability combination` from `session.harvestedData.discoveredRatePlanTypes`. Pre-populated from harvest data; hotel fills in their CM codes.

Columns:
| Column | Source | Editable |
|--------|--------|----------|
| Board type | `boardCodeRawName` from harvest (e.g. "Bed & Breakfast") | No |
| Cancellation policy | Parsed `HarvestedCancellationPolicy` shown as human text | Edit button (if parse was uncertain) |
| CM rate plan code | Empty — hotel enters their SiteMinder code | Yes |
| Price type | Default `gross` | Yes (gross / net) |
| Commission % | Default `15` | Yes |
| Charge | Default `agent` | Yes (agent / customer) |

**Validation:** HG minimum requirement — at least one row for each of RO+Refundable, RO+NR, BB+Refundable, BB+NR. Warning banner (not blocking) if any are missing.

**`+ Add a rate plan we didn't find`** — appends a blank row with board selector + R/NR toggle.

**Block 3 — Tax relations:**

One row per entry in `session.harvestedData.taxesAndFees`. Taxes tagged `source: 'lookup'` shown with a "⚠ estimated — please verify" label.

| Column | Content |
|--------|---------|
| Tax name + amount | From harvest (read-only) |
| Relation | Dropdown: `included / add / display / optional / ignore` |

**Vendor-driven overrides:**
- `flow.mandatoryTaxRelations` → pre-filled and locked (non-editable)
- `flow.ratePlanCodesProvidedByStaff` → CM code column hidden, replaced with "Codes will be provided by your channel manager"
- `flow.useDefaultCodes` → CM code column hidden, replaced with "HyperGuest will generate codes automatically"

### Backend

`POST /wizard/submit-cm-settings`:
1. Validate: at least one rate plan row, currency non-empty, all CM codes non-empty (unless `ratePlanCodesProvidedByStaff`)
2. Save `CmSettings` to `session.enrichedData.cmSettings`
3. Advance step

**Wizard page** adds `case 'cm_settings': return <CmSettingsStep ... />` to the step router.

---

## Section 4: Steps 9–12 — Blank Flow Automated Steps

### Updated SiteMinder step sequence

```
candidate_search        (candidate_search)
harvest_data            (automated)
review_data             (data_review)
collect_credentials     (credentials)
cm_settings             (cm_settings)
create_hg_property      (automated)   ← existing
create_rooms            (automated)   ← NEW
create_rateplans        (automated)   ← NEW
create_policies         (automated)   ← NEW
create_taxes            (automated)   ← NEW
connect_channel         (user_action) ← existing
trigger_ari_sync        (automated)   ← existing
→ pending_review
```

`buildSiteMinderSteps()` in `siteminder.ts` updated to insert the 4 new steps.

### Step executor logic

**`create_rooms`** — reads `session.harvestedData.rooms` (rooms confirmed/added in Data Review):
```
for each room:
  apply flow.credentialTransform to credentials if set
  POST /properties/{code}/rooms { type: room.name, name: room.name, code: room.cmCode }
  emit SSE progress: "Creating room: {room.name}"
```
`cmCode` comes from `session.enrichedData.roomCodes[roomName]` — entered by hotel in Data Review (blank flow only).

**`create_rateplans`** — reads `session.enrichedData.cmSettings.ratePlans`:
```
for each ratePlan:
  apply flow.ratePlanCodeTransform to code if set
  skip if flow.ratePlanCodesProvidedByStaff
  POST /properties/{code}/rateplans { name, pmsRateplanCode, priceType, boardCode }
  PUT  /properties/{code}/rateplans/{planCode}/rooms { roomCodes: allRoomCodes }
  emit SSE progress: "Creating rate plan: {ratePlan.ratePlanName}"
```

**`create_policies`** — deduplicates cancellation policies across rate plans:
```
group ratePlans by cancellation policy fingerprint
for each unique policy:
  POST /properties/{code}/policies (policy payload)
  for each ratePlan in group:
    PUT /properties/{code}/rateplans/{planCode}/policies/{policyCode}
  emit SSE progress: "Creating cancellation policy..."
```

**`create_taxes`** — reads `session.harvestedData.taxesAndFees` + `cmSettings.taxRelations`:
```
for each tax/fee:
  POST /properties/{code}/taxes-fees (tax payload)
  for each ratePlan:
    PUT /properties/{code}/rateplans/{planCode}/taxes-fees { [taxName]: relation }
  emit SSE progress: "Creating tax: {tax.name}"
```

### Error handling

All HG BO API calls treat HTTP 409 (conflict / already exists) as success — makes each step safely re-runnable if the hotel retries after a partial failure. Any other non-2xx response marks the step `failed` and surfaces a Retry button in the wizard.

### `regionAware` flag

After `create_hg_property` completes, if `flow.regionAware === true`:
- Save `{ adminActions: ['verify_siteminder_region'] }` to `session.enrichedData`
- Admin approval page renders a checklist item: "⚠ Verify SiteMinder region (Asia/Pacific vs Rest of World) in HG BO"

---

## Section 5: Candidate Search Step

### New files

```
apps/onboarding-api/src/services/hotel-search.service.ts
apps/onboarding-api/src/routes/search.route.ts
apps/onboarding/src/components/steps/CandidateSearchStep.tsx
```

### Backend — `hotel-search.service.ts`

Input: `{ hotelName, city, country }`  
Output: up to 5 candidates, each with `{ url, title, detected: boolean, screenshotPath?: string }`

**Search strategy:**
1. Scrape DuckDuckGo HTML (`https://html.duckduckgo.com/html/?q="{hotelName}" {city} book`) via Playwright stealth browser
2. Extract top 10 result URLs + titles
3. Filter out known OTAs: Booking.com, Expedia, Hotels.com, TripAdvisor, Agoda, Airbnb, Google Hotels
4. For each remaining candidate (up to 5):
   - Run `detectKnownIBE(url)` → set `detected: true` if matched
   - Take a viewport screenshot (1280×800): dismiss cookie consent first (`/accept|accept all|agree|continue/i`)
   - Save screenshot to `uploads/screenshots/{uuid}.png`, TTL 1 hour (deleted on next request after expiry)
   - Served at `GET /screenshots/:id.png` — static file route registered in `apps/onboarding-api/src/app.ts`
5. Return candidates sorted: detected-first, then by result ranking

### Backend — `search.route.ts`

```
POST /hotel-search
  Body: { hotelName, city, country }
  Response: { candidates: [{ url, title, detected, screenshotUrl }] }
  (synchronous — runs search + screenshots, responds when done ~10–15s)

POST /select-url
  Body: { url }
  Response: { ok: true }
  (fires IBE resolver async; client polls GET /wizard/state)
```

`POST /select-url` triggers `ibeResolverService.resolve(url)` as a background task:
- On success: saves `ibeUrl` + `ibePattern` to `OnboardingInvitation`, updates session step
- On failure: sets session status to `pending_ibe_review`

`GET /wizard/state` already returns `session.status` — the frontend polls until status changes from `in_progress` or `ibeUrl` appears.

### Frontend — `CandidateSearchStep.tsx`

**Phase 1 — Search form** (shown first):
```
"Let's find your hotel's booking engine."

Hotel name:   [Grand Hotel Paris          ]
City:         [Paris                      ]
Country:      [France                     ]
              [Search →]
```

**Phase 2 — Results** (after search completes, ~10–15s with a spinner):
```
"We found these results:"

┌────────────────────────────────────────────────────────────┐
│  [screenshot 280×160 or skeleton]                          │
│  grandhotel-paris.com          🟢 SynXis detected          │
│  The Grand Hotel Paris — Official Site                     │
│  [Select this →]                          [View site ↗]    │
├────────────────────────────────────────────────────────────┤
│  [screenshot 280×160 or skeleton]                          │
│  grandhotelparisofficial.com                               │
│  Grand Hotel Paris — Rooms & Suites                        │
│  [Select this →]                          [View site ↗]    │
└────────────────────────────────────────────────────────────┘

Or paste your booking URL directly:
[__________________________________________________] [Use this URL →]

None of these look right?  [Search again]
```

Screenshots load asynchronously — cards render immediately with a skeleton placeholder; screenshots fill in as they arrive via `<img src={candidate.screenshotUrl} loading="lazy">`.

**Phase 3 — Resolving** (after hotel selects or pastes a URL):
- Shows `AutomatedStep`-style spinner: "Finding your booking engine…"
- Polls `GET /wizard/state` every 2s
- On `ibeUrl` set → wizard advances to harvest
- On `pending_ibe_review` → shows `PendingIbeStep`: "We don't recognise your booking system yet — our team will email you"

**Wizard page** adds `case 'candidate_search': return <CandidateSearchStep ... />`.

---

## Data Flow Summary

```
[Candidate Search]
  hotel name + city + country
  → hotel-search.service → DuckDuckGo → candidate URLs + screenshots
  → hotel picks / pastes URL
  → ibe-resolver.service → detectKnownIBE + booking-button follower
  → ibeUrl + ibeName saved to invitation

[Harvest]
  ibeUrl → ibe-harvester-map → SynXisHarvester
  → 2 date windows × 6 occupancy patterns + age sweep
  → HarvestedHotelData { rooms, discoveredRatePlanTypes, policies, agePolicy, taxesAndFees }
  → session.harvestedData

[Data Review]
  hotel confirms/edits rooms, policies, room codes (blank flow)
  optional: extend harvest or add rooms manually
  → session.enrichedData updated

[cm_settings]
  hotel maps CM rate plan codes → discovered rate plan types
  sets currency, pricing model, tax relations
  → session.enrichedData.cmSettings: CmSettings

[Steps 9–12]
  create_rooms     → POST /properties/{code}/rooms
  create_rateplans → POST /properties/{code}/rateplans + link rooms
  create_policies  → POST /properties/{code}/policies + link to plans
  create_taxes     → POST /properties/{code}/taxes-fees + set per-plan relations

[connect_channel]  user action: add HyperGuest in SiteMinder dashboard

[trigger_ari_sync] POST /properties/{code}/trigger-update → pending_review
```

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/onboarding-api/src/services/playwright-browser.service.ts` | Create | Copy of apps/api stealth Chromium wrapper |
| `apps/onboarding-api/src/services/ibe-resolver.service.ts` | Create | Multi-tier URL → IBE resolver (detection + booking-button follower) |
| `apps/onboarding-api/src/services/ibe-harvester.service.ts` | Create | Orchestrator: pick harvester from map, run, save |
| `apps/onboarding-api/src/services/ibe-harvester-map.ts` | Create | `Map<ibeName, IbeHarvester>` |
| `apps/onboarding-api/src/services/harvesters/synxis-harvester.ts` | Create | SynXis Playwright harvest implementation |
| `apps/onboarding-api/src/services/harvesters/cancellation-policy-parser.ts` | Create | Regex parser: IBE text → `HarvestedCancellationPolicy` |
| `apps/onboarding-api/src/services/hotel-search.service.ts` | Create | DuckDuckGo scrape → candidate URLs + screenshots |
| `apps/onboarding-api/src/routes/search.route.ts` | Create | POST /hotel-search, POST /select-url |
| `apps/onboarding-api/src/routes/internal.route.ts` | Modify | Replace harvest stub with real harvester call |
| `apps/onboarding-api/src/services/step-executor.service.ts` | Modify | Add harvest_data, create_rooms, create_rateplans, create_policies, create_taxes cases |
| `apps/onboarding-api/src/routes/wizard.route.ts` | Modify | Add POST /wizard/submit-cm-settings, POST /wizard/extend-harvest, POST /wizard/add-room-manually |
| `apps/onboarding-api/src/app.ts` | Modify | Register search routes + static screenshot route |
| `apps/onboarding-api/package.json` | Modify | Add `playwright` dependency |
| `packages/onboarding-flows/src/vendors/siteminder.ts` | Modify | Insert 4 new steps into `buildSiteMinderSteps()` |
| `apps/onboarding/src/components/steps/CandidateSearchStep.tsx` | Create | Candidate cards with screenshots + URL paste |
| `apps/onboarding/src/components/steps/CmSettingsStep.tsx` | Create | Rate plan mapping table + tax relations |
| `apps/onboarding/src/app/wizard/page.tsx` | Modify | Add candidate_search + cm_settings cases to step router |
| `apps/onboarding/src/lib/api.ts` | Modify | Add hotelSearch, selectUrl, submitCmSettings, extendHarvest, addRoomManually API methods |

---

## Testing

Each new service gets a Vitest unit test:
- `ibe-resolver.service.test.ts` — mocks Playwright, tests all 3 tiers + hop limit
- `synxis-harvester.test.ts` — mocks `withStealthPage`, tests board normalisation + cancellation policy parsing
- `cancellation-policy-parser.test.ts` — pure function tests for each regex pattern
- `hotel-search.service.test.ts` — mocks Playwright + DuckDuckGo HTML, tests OTA filtering + screenshot path
- `step-executor.service.test.ts` — extends existing tests with new step cases

`CmSettingsStep.tsx` — no automated tests; verified via manual end-to-end run documented in the plan.

---

## Out of Scope (Phase 2-B)

- Mews harvester and other IBE types
- cm_settings for `hg_pulls` flow (Mews — simpler, no room/rate code entry)
- `ari_source_selection` wizard step (hotel picks their CM from a dropdown)
- `pending_ibe` and `pending_ari_source` wizard step components
- Render.com deployment for `apps/onboarding` and `apps/onboarding-api`
- `onboarding.hyperguest.net` subdomain routing
