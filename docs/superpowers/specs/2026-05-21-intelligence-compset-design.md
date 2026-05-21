# Intelligence — CompSet Sub-project 1: Foundation + Collection Engine

**Date:** 2026-05-21  
**Scope:** Sub-project 1 of 2. Covers nav restructure, search config inheritance, competitor CRUD, data model, and the Playwright-based collection engine. Sub-project 2 (results display UI, position metrics, Excel export, cron scheduling) follows once the data model is validated.

---

## Overview

The **Intelligence** module gives hotel admins competitive market intelligence by collecting rate and availability data from competitor booking engines and comparing it against their own rates. Competitors are grouped per property into a **CompSet** (Competitive Set). Searches are run against each competitor's booking engine using Playwright (same mechanism as External IBE scraping), and results are stored for comparison.

---

## 1. Navigation & Module Structure

A new top-level **Intelligence** item is added to the admin navigation alongside Bookings, Design, Config, etc. It has two sub-menus:

- **Data Provider** — moved from `/admin/config/data-provider` → `/admin/intelligence/data-provider`. No logic changes, relocation only.
- **CompSet** — new at `/admin/intelligence/compset`.

The CompSet page responds to the property selector in the admin header:

- **No property selected, system context (super admin):** system config panel (max competitors, cron, enabled) + system search param management
- **No property selected, chain context:** inherited system params (read-only) + chain search param management
- **Property selected:** inherited system + chain params (read-only) + hotel search param management + competitor list for that property

---

## 2. Data Model

Four new Prisma models added to `apps/api/prisma/schema.prisma`.

### `SystemCompSetConfig`
Singleton. Super admin only.

```prisma
model SystemCompSetConfig {
  id                        Int      @id @default(autoincrement())
  maxCompetitorsPerProperty Int      @default(5)
  cronSchedule              String   @default("0 3 * * *")
  enabled                   Boolean  @default(false)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
}
```

### `CompSetSearchParam`
One table for all three tiers. Scope is determined by which foreign key is populated:
- Both null → system
- `orgId` only → chain
- `propertyId` only → hotel

```prisma
model CompSetSearchParam {
  id          Int      @id @default(autoincrement())
  orgId       Int?
  propertyId  Int?
  offsetDays  Int
  nights      Int
  adults      Int
  countryCode String   @default("US")
  label       String   // auto-generated: "Today+7 · 5 Nights · 2 Adults · US"
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  organization Organization?      @relation(fields: [orgId], references: [id])
  property     Property?          @relation(fields: [propertyId], references: [propertyId])
  results      CompSetResult[]
}
```

### `CompSetCompetitor`
Per-property competitor list.

```prisma
model CompSetCompetitor {
  id          Int       @id @default(autoincrement())
  propertyId  Int
  name        String
  searchUrl   String?   // URL template: {checkIn}, {checkOut}, {adults}, etc.
  sortOrder   Int       @default(0)
  status      String    @default("idle")  // idle | fetching | done | error
  lastFetchAt DateTime?
  errorMsg    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  property    Property        @relation(fields: [propertyId], references: [propertyId])
  results     CompSetResult[]
}
```

### `CompSetResult`
Collected rate rows. Replaced entirely on each collection run (delete all for `propertyId` + insert fresh). No historical runs in Sub-project 1.

```prisma
model CompSetResult {
  id            Int       @id @default(autoincrement())
  propertyId    Int
  competitorId  Int?      // null = own hotel rates
  searchParamId Int
  fetchedAt     DateTime
  checkIn       String    // YYYY-MM-DD resolved date
  checkOut      String
  nights        Int
  adults        Int
  countryCode   String
  searchStatus  String    // found | not_found | error
  roomName      String?
  board         String?   // RO, BB, HB, FB, AI
  cancellation  String?   // NR, Flexi
  pricePerNight Float?
  total         Float?
  currency      String?
  createdAt     DateTime  @default(now())

  property     Property           @relation(fields: [propertyId], references: [propertyId])
  competitor   CompSetCompetitor? @relation(fields: [competitorId], references: [id])
  searchParam  CompSetSearchParam @relation(fields: [searchParamId], references: [id])
}
```

**Property model additions:** `compSetCompetitors CompSetCompetitor[]`, `compSetResults CompSetResult[]`, `compSetSearchParams CompSetSearchParam[]`  
**Organization model addition:** `compSetSearchParams CompSetSearchParam[]`

---

## 3. Search Config Inheritance

Search params are **purely additive** — a hotel uses all system params + all chain params + its own. There is no mechanism to disable inherited params.

**Effective set resolution** for a given property:
1. All `CompSetSearchParam` rows where `orgId IS NULL AND propertyId IS NULL` (system)
2. All rows where `orgId = property.organizationId` (chain)
3. All rows where `propertyId = propertyId` (hotel)

Returned merged, ordered system → chain → hotel, each group sorted by `sortOrder`. Each row includes a `tier: 'system' | 'chain' | 'hotel'` field for display purposes.

**Admin UI per tier:**
- System params are shown as read-only "inherited" rows at chain and hotel levels
- Chain params are shown as read-only "inherited" rows at hotel level
- Each tier's own params have full add / edit / delete CRUD

**Label auto-generation:** computed from the four fields at save time:  
`offsetDays=7, nights=5, adults=2, countryCode='US'` → `"Today+7 · 5 Nights · 2 Adults · US"`

---

## 4. CompSet Competitor Management UI

Visible only when a property is selected.

**Competitor list** — each competitor displayed as a card showing:
- Name and truncated URL template
- Status badge: Idle / Fetching / Done (with last fetch time) / Error (with message)
- Per-competitor **Run** button

**Run All** button at the top triggers collection for all competitors simultaneously.

**Adding a competitor:**
1. Admin clicks "Add Competitor" → inline form appears
2. Admin pastes a real search URL (with actual dates/adults filled in)
3. Admin clicks **Analyse URL** → calls existing `POST /admin/config/external-ibe/analyze` endpoint, which detects the IBE type and returns a URL template
4. Admin enters a competitor name
5. Save

If analysis fails or the IBE is unknown, the admin can manually type/edit the URL template directly.

**Enforcement:** "Add Competitor" is disabled with a tooltip when the property has reached `SystemCompSetConfig.maxCompetitorsPerProperty`.

**Editing / removing:** each card has edit (pencil) and delete (trash) actions. Edit reopens the inline form pre-filled.

---

## 5. Collection Engine

**File:** `apps/api/src/services/compset-collect.service.ts`  
**Entry point:** `runPropertyCompSet(propertyId: number): Promise<void>`

### Flow

1. Mark all competitors for this property as `status: 'fetching'`
2. Resolve effective search params (system + chain + hotel)
3. Delete all existing `CompSetResult` rows for this property
4. For each search param:
   - Resolve concrete dates: `checkIn = today + offsetDays`, `checkOut = checkIn + nights`
   - **Fetch own hotel rates** via the existing HyperGuest availability API (same call used by the IBE search). Store each room as a `CompSetResult` with `competitorId = null`
   - **For each competitor:**
     - Build the search URL using `buildExternalUrl()` from `external-ibe.service.ts` (reused as-is)
     - Launch Playwright, navigate to the built URL
     - Detect IBE type using the existing known-IBE registry
     - If known IBE type → use dedicated rate extractor for that IBE (extracts room name, board, cancellation, price from the DOM)
     - If unknown IBE → AI fallback: send page visible text to the configured AI provider with a structured extraction prompt, parse the JSON response as `Array<{ roomName, board, cancellation, pricePerNight, total, currency }>`
     - Store each extracted room as a `CompSetResult` with `competitorId = competitor.id`
     - Update `competitor.status`, `competitor.lastFetchAt`, `competitor.errorMsg`
5. Competitor errors are isolated — one failure does not abort the others

### Rate extractors

A rate extractor is a function `(page: Page) => Promise<RoomRate[]>` specific to one IBE type. Built incrementally — start with the most commonly occurring IBE types in real CompSets, add others over time. The AI fallback covers all unknown IBEs from day one.

### Triggering

- **Manual:** `POST /admin/intelligence/compset/run?propertyId=N` — fires `runPropertyCompSet` as a background Promise (non-blocking), returns `{ started: true }` immediately. Frontend polls competitor status via `GET /admin/intelligence/compset/competitors`.
- **Cron:** registered in `server.ts` at startup, runs on `SystemCompSetConfig.cronSchedule`. When `SystemCompSetConfig.enabled = true`, iterates all properties that have at least one competitor. There is no per-property enable/disable — removing all competitors from a property effectively opts it out. Uses the same `runPropertyCompSet` call.

---

## 6. API Routes

All routes under `/admin/intelligence/compset/`, auth-guarded, scoped per existing admin auth patterns.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/intelligence/compset/system-config` | Get `SystemCompSetConfig` (super only) |
| `PUT` | `/admin/intelligence/compset/system-config` | Update max competitors, cron schedule, enabled (super only) |
| `GET` | `/admin/intelligence/compset/search-params` | Effective param set for caller's scope, with `tier` field |
| `POST` | `/admin/intelligence/compset/search-params` | Create param at caller's tier |
| `PUT` | `/admin/intelligence/compset/search-params/:id` | Update (own tier only) |
| `DELETE` | `/admin/intelligence/compset/search-params/:id` | Delete (own tier only) |
| `GET` | `/admin/intelligence/compset/competitors` | List competitors for `?propertyId=N` |
| `POST` | `/admin/intelligence/compset/competitors` | Add competitor |
| `PUT` | `/admin/intelligence/compset/competitors/:id` | Edit name / URL template |
| `DELETE` | `/admin/intelligence/compset/competitors/:id` | Remove competitor |
| `POST` | `/admin/intelligence/compset/run` | Manual trigger for `?propertyId=N` |
| `GET` | `/admin/intelligence/compset/results` | Latest results for `?propertyId=N` (own + competitors) |

**Reused without change:** `POST /admin/config/external-ibe/analyze` — existing endpoint for AI-based URL template detection, called from the Add Competitor form.

---

## 7. What This Sub-project Does NOT Include

The following are deferred to Sub-project 2:

- Results display UI (comparison table, side-by-side my hotel vs competitors)
- Position metrics ("you are X% cheaper than average")
- Excel export
- Historical run tracking (Sub-project 1 keeps only the latest results)
