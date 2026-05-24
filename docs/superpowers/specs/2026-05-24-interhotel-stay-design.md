# InterHotel Stay — Design Spec

**Date:** 2026-05-24
**Status:** Draft
**Scope:** Web channel only. AI/WhatsApp and cross-organization groups are out of scope.

---

## Overview

When a guest searches and the primary hotel has no full-stay availability, the system searches for split-stay combinations across nearby participating hotels in the same chain. Results appear as collapsible "InterHotel Stay" packages — each showing hotel segments, transfer type, and total starting price — displayed above Flexible Date alternatives.

Unlike Flexible Dates (which shifts the whole stay by ±N days), InterHotel Stay keeps the exact requested dates and splits the nights across multiple hotels.

---

## 1. DB & Config Layer

### Prisma Models

Three config models following the exact pattern of `SystemFlexibleDatesConfig` / `OrgFlexibleDatesConfig` / `PropertyFlexibleDatesConfig`:

```prisma
model SystemInterHotelConfig {
  id                Int     @id @default(1)
  enabled           Boolean @default(false)
  maxRadiusKm       Int     @default(50)
  maxHotels         Int     @default(3)
  transferType      String  @default("self")
  sponsoredAmount   Float   @default(0)
  sponsoredCurrency String  @default("USD")
}

model OrgInterHotelConfig {
  organizationId    Int          @id
  enabled           Boolean?
  maxRadiusKm       Int?
  maxHotels         Int?
  transferType      String?
  sponsoredAmount   Float?
  sponsoredCurrency String?
  org               Organization @relation(fields: [organizationId], references: [id])
}

model PropertyInterHotelConfig {
  propertyId        Int      @id
  enabled           Boolean?
  maxRadiusKm       Int?
  maxHotels         Int?
  transferType      String?
  sponsoredAmount   Float?
  sponsoredCurrency String?
  property          Property @relation(fields: [propertyId], references: [propertyId])
}
```

One pre-calculated nearby pairs model:

```prisma
model NearbyHotel {
  id               Int      @id @default(autoincrement())
  propertyId       Int
  nearbyPropertyId Int
  distanceKm       Float
  updatedAt        DateTime @updatedAt
  property         Property @relation("PropertyNearby", fields: [propertyId], references: [propertyId])
  nearbyProperty   Property @relation("NearbyHotelProperty", fields: [nearbyPropertyId], references: [propertyId])

  @@unique([propertyId, nearbyPropertyId])
}
```

Add to `Organization` model:
```prisma
orgInterHotelConfig OrgInterHotelConfig?
```

Add to `Property` model:
```prisma
propertyInterHotelConfig PropertyInterHotelConfig?
nearbyHotels             NearbyHotel[] @relation("PropertyNearby")
nearbyOfHotels           NearbyHotel[] @relation("NearbyHotelProperty")
```

### Shared Types (`packages/shared/src/types/api.ts`)

```ts
export type TransferType = 'self' | 'hotel' | 'sponsored_self'

export interface InterHotelEffective {
  enabled: boolean
  maxRadiusKm: number
  maxHotels: number
  transferType: TransferType
  sponsoredAmount: number
  sponsoredCurrency: string
}

export interface SystemInterHotelConfigResponse extends InterHotelEffective {}

export interface OrgInterHotelConfigResponse {
  enabled: boolean | null
  maxRadiusKm: number | null
  maxHotels: number | null
  transferType: TransferType | null
  sponsoredAmount: number | null
  sponsoredCurrency: string | null
  effective: InterHotelEffective
}

export interface PropertyInterHotelConfigResponse {
  enabled: boolean | null
  maxRadiusKm: number | null
  maxHotels: number | null
  transferType: TransferType | null
  sponsoredAmount: number | null
  sponsoredCurrency: string | null
  effective: InterHotelEffective
}

export interface InterHotelPackageResponse {
  segments: {
    checkIn: string
    checkOut: string
    result: PropertySearchResult   // existing type — has propertyId, propertyName, rooms
  }[]
  transferType: TransferType
  sponsoredAmount: number
  sponsoredCurrency: string
  totalFromPrice: number
  currency: string
}

export interface InterHotelSearchResponse {
  packages: InterHotelPackageResponse[]
}
```

### Service — `interhotel-config.service.ts`

Functions mirroring `flexible-dates-config.service.ts`:
- `getSystemInterHotelConfig()` → upserts singleton row with defaults
- `upsertSystemInterHotelConfig(data)`
- `getOrgInterHotelConfig(orgId)` → org row (nullable fields) + `effective` merged values
- `upsertOrgInterHotelConfig(orgId, data)`
- `getPropertyInterHotelConfig(propertyId)` → property row + `effective` merged values
- `upsertPropertyInterHotelConfig(propertyId, data)`
- `resolveEffectiveInterHotelConfig(propertyId)` → `InterHotelEffective`

Merge rule identical to Flexible Dates: system provides base; org nullable fields override if non-null; property nullable fields override if non-null.

`transferType` is stored as a `String` in the DB. Validate at service layer: accepted values are `'self' | 'hotel' | 'sponsored_self'`; unknown values fall back to `'self'`.

### Service — `interhotel-nearby.service.ts`

- `refreshNearbyHotels(orgId: number): Promise<{ count: number }>` — recalculates all nearby pairs for the org
- `getNearbyHotels(propertyId: number): Promise<{ nearbyPropertyId: number; distanceKm: number }[]>`

**Haversine distance** (km):
```ts
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
```

**Refresh logic:**
1. Get all active (`status: 'active'`) properties in the org that have `PropertyDataProviderConfig.lat` and `.lng` non-null
2. Resolve `maxRadiusKm` for each property A via `resolveEffectiveInterHotelConfig(A.propertyId)`
3. For every ordered pair (A, B) where A ≠ B:
   - `d = haversineKm(A.lat, A.lng, B.lat, B.lng)`
   - `d <= maxRadiusKm(A)`: upsert `NearbyHotel { propertyId: A.propertyId, nearbyPropertyId: B.propertyId, distanceKm: d }`
   - `d > maxRadiusKm(A)`: delete existing `NearbyHotel` row if any
4. Return `{ count }` = number of upserted rows

Note: pairs are directional. (A→B) and (B→A) are stored separately because A's radius config may differ from B's.

### Service — `interhotel-search.service.ts`

```ts
async function searchInterHotel(params: {
  propertyId: number
  checkIn: string
  checkOut: string
  rooms: { adults: number; childAges?: number[] }[]
  nationality?: string
  currency?: string
}): Promise<InterHotelSearchResponse>
```

**Algorithm:**

1. Resolve effective config for `params.propertyId`. If `!config.enabled`, return `{ packages: [] }`.
2. Fetch nearby hotels: `getNearbyHotels(propertyId)` → nearby list from DB.
3. Filter nearby to: active properties (`status: 'active'`), same `organizationId` as primary hotel, also have interhotel enabled (`resolveEffectiveInterHotelConfig(nearbyId).enabled`). Cap at `config.maxHotels - 1` candidates.
4. **Find Hotel A's split point** using binary search over stay nights:
   - `lo = 1`, `hi = totalNights - 1` (where `totalNights = dayDiff(checkIn, checkOut)`)
   - Binary search: find the largest `n` in `[1, totalNights-1]` where Hotel A has rooms for `[checkIn, checkIn+n]`
   - Each iteration: call `searchAvailability({ hotelId: propertyId, checkIn, checkOut: addDays(checkIn, mid), rooms })`
   - Result: `splitDate = addDays(checkIn, bestN)` or `null` if Hotel A has no availability at all
5. If `splitDate === null`: return `{ packages: [] }`.
6. **2-hotel packages**: for each nearby Hotel B, call `searchAvailability({ hotelId: B.nearbyPropertyId, checkIn: splitDate, checkOut: params.checkOut, rooms })`. If has rooms → record package `[A: checkIn→splitDate, B: splitDate→checkOut]`.
7. **3-hotel packages** (only if `config.maxHotels >= 3`): for each nearby Hotel B that had NO full coverage of `[splitDate, checkOut]`, apply the same binary-search split to Hotel B for `[splitDate, checkOut]`, then search each remaining nearby hotel C for the remainder. Record 3-hotel packages.
8. Assemble `InterHotelPackageResponse` for each valid package:
   - `segments`: array of `{ checkIn, checkOut, result: PropertySearchResult }` (the HG response for each segment)
   - `totalFromPrice`: sum of `Math.min(...segment.result.rooms.flatMap(r => r.rates).map(r => r.prices.sell.amount))` across all segments
   - `currency`: from the first segment's rate currency
   - `transferType`, `sponsoredAmount`, `sponsoredCurrency`: from effective config
9. Sort packages: fewest segments first, then by longest first-segment stay (descending).
10. Return `{ packages }`.

---

## 2. API Routes

All routes in `apps/api/src/routes/interhotel.route.ts`.

### Admin routes (authenticated)

```
GET  /api/v1/admin/interhotel/config/system
PUT  /api/v1/admin/interhotel/config/system

GET  /api/v1/admin/interhotel/config/org/:orgId
PUT  /api/v1/admin/interhotel/config/org/:orgId

GET  /api/v1/admin/interhotel/config/property/:propertyId
PUT  /api/v1/admin/interhotel/config/property/:propertyId

POST /api/v1/admin/interhotel/refresh/org/:orgId
```

The refresh endpoint calls `refreshNearbyHotels(orgId)` and returns `{ count: number }`.

All PUT bodies are partial — unset fields leave DB value unchanged.
All admin GET/PUT routes with path params validate `isNaN` and return 400 on invalid input.

### Public routes (no auth)

```
GET  /api/v1/interhotel/config/:propertyId   → InterHotelEffective
POST /api/v1/interhotel/search               → InterHotelSearchResponse
```

`POST /api/v1/interhotel/search` body:
```ts
{ propertyId: number; checkIn: string; checkOut: string; rooms: { adults: number }[]; nationality?: string; currency?: string }
```

Returns 400 if `propertyId` is missing or not a number.

---

## 3. Admin UI

### InterHotel Stay tab (Offers page)

Replace the "Coming soon" card on the `inter-city` tab (rename tab label from "Inter-city" to "InterHotel Stay") with three collapsible `<Section>` cards — same role-gated pattern as Flexible Dates:

| Section | Visible to |
|---|---|
| System Defaults | super-admin only |
| Chain Override | org-level admin + super-admin |
| Hotel Settings | property-level admin + super-admin |

Each section contains:
- **Enabled** — toggle (nullable with inherited label at org/property level)
- **Max Radius (km)** — number input, min 1, max 500
- **Max Hotels** — number input, min 2, max 5
- **Transfer Type** — `<select>`: Self / Hotel / Sponsored Self (nullable at org/property)
- **Sponsored Amount** — number input, shown only when `transferType === 'sponsored_self'`
- **Sponsored Currency** — 3-char text input, shown alongside Sponsored Amount

SaveBar appears when form is dirty.

**Refresh Nearby Hotels button** — shown at System and Chain sections. Calls `POST /api/v1/admin/interhotel/refresh/org/:orgId`. Shows spinner during call; shows `"X nearby hotel pairs refreshed"` on success.

---

## 4. Frontend Search Integration

### New hook: `useInterHotelSearch`

Location: `apps/web/src/hooks/use-interhotel-search.ts`

```ts
function useInterHotelSearch(
  baseParams: SearchUrlParams | null,
  config: InterHotelEffective | undefined,
  primaryHasResults: boolean,
): { packages: InterHotelPackageResponse[]; isLoading: boolean }
```

**Activation:** `config?.enabled === true && !primaryHasResults && baseParams !== null`

When active: fetches `apiClient.searchInterHotel(params)` via `useQuery(['interhotel-search', baseParams])`.
When inactive: returns `{ packages: [], isLoading: false }`.

Error handling: on fetch error, returns `{ packages: [], isLoading: false }` silently.

### Changes to `_content.tsx`

1. Fetch interhotel effective config: `useQuery(['interhotel-config', propertyId], () => apiClient.getInterHotelConfig(propertyId))`.
2. Call `useInterHotelSearch(searchParams, interHotelConfig, primaryHasResults)`.
3. When `!primaryHasResults`, display logic:
   - **Loading**: if `interHotelResult.isLoading` OR any flex result still loading → show the existing "no rooms" message + loading indicator (same Case B as Flexible Dates).
   - **Has InterHotel packages**: show `t('interHotelUnavailable')` + `t('interHotelOffer')` header, then one `<InterHotelPackageSection>` per package. Below the packages, if flex results also has resolved results → show the Flexible Dates section with its own header.
   - **No packages, has flex results**: show existing flexible dates UI (unchanged from current `_content.tsx`).
   - **Nothing**: show existing "no rooms" message.

`<InterHotelPackageSection>` (collapsible):
- Header: hotel names joined by " + ", date range, transfer type badge, "Starting from {totalFromPrice}"
- Body (expanded): for each segment, show segment label ("Hotel Stay 1", "Hotel Stay 2") + hotel name + dates + `<RoomCardGrid>` / `<RoomCard>` components wired with that segment's `checkIn`, `checkOut`, and `propertyId` for booking navigation

Booking from a segment navigates to the existing booking page using that segment's `checkIn`, `checkOut`, and `propertyId` — same as primary search, same URL format.

---

## 5. Translation Keys

New keys in `apps/api/src/translations/en.json` under `"search"`:

```json
"interHotelUnavailable": "Unfortunately, we do not have availability for your entire stay at our hotel for the selected dates.",
"interHotelOffer": "However, we can offer you an InterHotel Stay combining our hotel with nearby participating hotels:",
"interHotelStaySegment": "Hotel Stay {n}",
"interHotelTransferSelf": "Self Transfer",
"interHotelTransferHotel": "Free transfer arranged by the hotel",
"interHotelTransferSponsored": "Sponsored Self Transfer (up to {amount} {currency})",
"interHotelFrom": "Starting from"
```

Also rename the tab label in the Offers page from `"Inter-city"` to `"InterHotel Stay"` (no new translation key needed — update the hardcoded label string in `offers/page.tsx`).

---

## 6. Out of Scope

- AI / WhatsApp / B2B channels (web only; hook signature designed for extension)
- Cross-organization hotel groups
- Auto-trigger refresh when radius config changes (manual refresh only)
- Unified multi-hotel booking (each segment books independently via existing flow)
- Guest-facing transfer payment integration

---

## Implementation Order

1. DB migration + Prisma models (3 config models + NearbyHotel)
2. Shared types
3. Config service + tests (`interhotel-config.service.ts`)
4. Nearby hotel service + tests (`interhotel-nearby.service.ts`)
5. InterHotel search service + tests (`interhotel-search.service.ts`)
6. API routes + registration (`interhotel.route.ts` + `app.ts`)
7. API client methods (`api-client.ts`)
8. Admin UI — replace "Coming soon" on InterHotel Stay tab (`offers/page.tsx`)
9. `useInterHotelSearch` hook
10. `_content.tsx` integration + translation keys
