# Flexible Dates — Design Spec

**Date:** 2026-05-23
**Status:** Approved
**Scope:** Feature 1 of 3 (Flexible Dates). Inter-city and Multi-city are out of scope; they appear as placeholder tabs in the UI only.

---

## Overview

When a guest searches and the primary result has zero rooms, the system automatically fires additional searches for nearby date windows (±N days, configurable) and displays each non-empty result as a collapsible section below a "no availability" message. This is a pure frontend fan-out — no new backend search logic, all calls go to the existing `/api/v1/search` endpoint.

---

## 1. DB & Config Layer

### Prisma Models

Three new models following the exact pattern of `SystemPricingConfig` / `OrgPricingConfig` / `PropertyPricingConfig`.

```prisma
model SystemFlexibleDatesConfig {
  id          Int     @id @default(1)
  enabled     Boolean @default(false)
  daysBefore  Int     @default(1)
  daysAfter   Int     @default(1)
}

model OrgFlexibleDatesConfig {
  orgId      Int     @id
  enabled    Boolean?
  daysBefore Int?
  daysAfter  Int?
  org        Organization @relation(fields: [orgId], references: [organizationId])
}

model PropertyFlexibleDatesConfig {
  propertyId Int     @id
  enabled    Boolean?
  daysBefore Int?
  daysAfter  Int?
  property   Property @relation(fields: [propertyId], references: [propertyId])
}
```

### Service — `flexible-dates-config.service.ts`

Functions mirroring the pricing config service:

- `getSystemFlexibleDatesConfig()` → upserts the singleton row with defaults if missing
- `upsertSystemFlexibleDatesConfig(data)` → updates the singleton
- `getOrgFlexibleDatesConfig(orgId)` → returns org row (nullable fields) + `effective` merged values
- `upsertOrgFlexibleDatesConfig(orgId, data)`
- `getPropertyFlexibleDatesConfig(propertyId)` → returns property row + `effective` merged values
- `upsertPropertyFlexibleDatesConfig(propertyId, data)`
- `resolveEffectiveFlexibleDatesConfig(propertyId)` → returns `{ enabled: boolean, daysBefore: number, daysAfter: number }` by merging system → org → property

Merge rule: system provides base values; org nullable fields override if non-null; property nullable fields override if non-null.

### Shared Types (`packages/shared/src/types/api.ts`)

```ts
interface FlexibleDatesEffective {
  enabled: boolean
  daysBefore: number
  daysAfter: number
}

interface SystemFlexibleDatesConfigResponse extends FlexibleDatesEffective {}

interface OrgFlexibleDatesConfigResponse {
  enabled: boolean | null
  daysBefore: number | null
  daysAfter: number | null
  effective: FlexibleDatesEffective
}

interface PropertyFlexibleDatesConfigResponse {
  enabled: boolean | null
  daysBefore: number | null
  daysAfter: number | null
  effective: FlexibleDatesEffective
}
```

---

## 2. API Routes

### Admin routes (`flexible-dates.route.ts`, registered under `pricingAdminRoutes` pattern)

```
GET  /api/v1/admin/flexible-dates/config/system
PUT  /api/v1/admin/flexible-dates/config/system

GET  /api/v1/admin/flexible-dates/config/org/:orgId
PUT  /api/v1/admin/flexible-dates/config/org/:orgId

GET  /api/v1/admin/flexible-dates/config/property/:propertyId
PUT  /api/v1/admin/flexible-dates/config/property/:propertyId
```

All PUT bodies are partial — unset fields leave the DB value unchanged.

### Public route

```
GET  /api/v1/flexible-dates/config/:propertyId
```

Returns `FlexibleDatesEffective` (resolved effective config for the property). No auth required. Used by the search page to decide whether to fan out.

---

## 3. Admin UI

### Tab bar

The Offers page (`/admin/config/offers/page.tsx`) gains a tab bar immediately below the page title:

```
General | Flexible Dates | Inter-city | Multi-city
```

Tab state is stored in the `?tab=` URL search param (`general` | `flexible-dates` | `inter-city` | `multi-city`). Default: `general`.

**General** — all existing content, unchanged.

**Inter-city / Multi-city** — render a single "Coming soon" placeholder card. No config, no DB changes.

### Flexible Dates tab

Renders three collapsible `<Section>` cards, conditional on admin role:

| Section | Visible to |
|---|---|
| System Defaults | super-admin only |
| Chain Override | org-level admin + super-admin |
| Hotel Settings | property-level admin + super-admin |

Each section contains:

- **Enabled** — `<Toggle>` (super-admin: direct bool; org/property: nullable with Reset button + "(inherited)" label when null)
- **Days before** — number input, range 0–3; shows inherited value as placeholder + Reset when null at org/property level
- **Days after** — number input, range 0–3; same pattern

SaveBar appears when the form is dirty (same pattern as Pricing config page).

---

## 4. Frontend Search Fan-out

### New hook: `useFlexibleDateSearch`

Location: `apps/web/src/hooks/use-flexible-date-search.ts`

```ts
interface FlexibleDateResult {
  label: string        // e.g. "1 day before" / "2 days after"
  checkIn: string
  checkOut: string
  data: SearchResponse | undefined
  isLoading: boolean
}

function useFlexibleDateSearch(
  baseParams: SearchParams | null,
  config: FlexibleDatesEffective | undefined,
  primaryHasResults: boolean,
): FlexibleDateResult[]
```

**Activation condition:** `config?.enabled === true && !primaryHasResults && baseParams !== null`

**Date pair derivation:** For `daysBefore=1, daysAfter=1`, deltas are `[-1, +1]`. Each delta shifts both `checkIn` and `checkOut` by the same number of days, preserving the original stay length. Order: negative deltas first (ascending), then positive (ascending) — so −2, −1, +1, +2.

**Execution:** One `useSearch(params)` call per date pair, all running in parallel via React Query. Results with `allRooms.length === 0` (after the hook resolves) are excluded from the returned array.

**Error handling:** A search that throws is treated as zero results — silently excluded.

### New public API client method

```ts
getFlexibleDatesConfig(propertyId: number): Promise<FlexibleDatesEffective>
```

Fetched once per search page load via `useQuery(['flexible-dates-config', propertyId])`.

### Changes to `_content.tsx`

1. Fetch the effective config: `const { data: flexConfig } = useQuery(...)`.
2. Compute `primaryHasResults = !isLoading && !isError && data !== undefined && allRooms.length > 0`.
3. Call `useFlexibleDateSearch(searchParams, flexConfig, primaryHasResults)`.
4. Replace the current "no rooms available" block (line 280) with:
   - If `flexResults.length > 0`: show the two-part message ("Unfortunately… however…") then the flexible result sections.
   - If `flexResults.length === 0` and at least one flexible search is still loading: show the existing message + a subtle loading indicator.
   - If all flexible searches resolved with zero results (or feature is disabled): show the existing "no rooms available" message unchanged.

Each flexible result section:
- Header: collapsible button showing label + date range + "from {price}" (lowest rate across all rooms in that result, formatted in display currency)
- Body: the same `<RoomCard>` / `<RoomCardGrid>` components used for primary results, wired with the alternative date params so booking navigates with the correct checkIn/checkOut

---

## 5. Translation Keys

New keys in `apps/web/src/translations/en.json` under the `search` namespace:

```json
"flexibleUnavailable": "Unfortunately, we do not have availability for your selected dates.",
"flexibleNearby": "However, we do have availability for nearby dates:",
"flexibleDayBefore": "1 day before",
"flexibleDaysBefore": "{n} days before",
"flexibleDayAfter": "1 day after",
"flexibleDaysAfter": "{n} days after"
```

---

## 6. Out of Scope

- Inter-city and Multi-city logic — placeholder tabs only
- Flexible dates in the AI / WhatsApp search channels
- Flexible dates in the B2B channel (inherits same config but B2B search flow unchanged for now)
- Any caching changes — flexible searches reuse the existing per-endpoint Redis/in-memory cache

---

## Implementation Order

1. DB migration + Prisma models
2. `flexible-dates-config.service.ts` + shared types
3. API routes (admin + public)
4. `api-client.ts` methods
5. Admin UI — Offers page tab bar + Flexible Dates tab
6. `useFlexibleDateSearch` hook
7. `_content.tsx` integration + translation keys
