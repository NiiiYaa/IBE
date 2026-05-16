# Amadeus Discover White Label — Design Spec

**Date:** 2026-05-16 (revised)

## Overview

Two related features sharing one airport dataset:

1. **Amadeus WL CTA** — "Explore Activities & Tours →" button on search and cross-sell pages, linking to the Amadeus Discover standalone White Label URL. System→Chain→Hotel inheritance for the Channel UUID.
2. **Nearest Airports display** — show the closest airports (code + full name + distance) below the hotel hero image on the search page and in the hotel detail modal header. Configurable radius and count.

Both features use a bundled + DB-refreshable OpenFlights airport dataset.

---

## Airport Dataset

**Source:** `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat`

**Format (14 CSV fields):**
`id, name, city, country, iata, icao, lat, lng, alt, tz_offset, dst, tz_name, type, source`

**Filter:** `type === "airport"` AND `iata.length === 3` AND valid lat/lng → ~6,000–7,000 entries.

**Stored format:**
```ts
interface AirportEntry { code: string; name: string; lat: number; lng: number }
```

**Storage strategy:**
- A base dataset JSON (`apps/api/src/data/iata-cities.json`) is committed to the repo (generated once by a script).
- `SystemWLConfig.airportDataset` (JSON field, nullable) holds a refreshed version stored by an admin action.
- The lookup function checks `SystemWLConfig.airportDataset` first; falls back to the bundled JSON.
- `SystemWLConfig.airportDatasetUpdatedAt` records when the DB version was last refreshed.

**Lookup function:** `findNearestAirports(lat, lng, maxKm, maxCount)` → `NearestAirport[]` sorted by distance ascending.

**WL iataCode:** uses `result[0]?.code` (nearest airport only).

---

## Inheritance Model (WL Channel UUID)

Each config level has:
- `channelUuid` — AES-256-CBC encrypted
- `enabled` — whether the WL CTA is shown
- `enforceChildCreds` — if true, downstream levels cannot use their own UUID

**Resolution for a property:**
1. Load `SystemWLConfig`, `OrgWLConfig` (property's org), `PropertyWLConfig` (property)
2. If system `enforceChildCreds = true` → use system UUID + system `enabled`
3. Else if org `systemServiceDisabled = true` and org has no UUID → return disabled
4. Else if org `enforceChildCreds = true` → use org UUID (system UUID fallback) + org `enabled`
5. Else if property has own UUID → use property UUID + property `enabled`
6. Else → org UUID (system fallback) + org `enabled` (system fallback)

---

## Database

### `SystemWLConfig` (extended)
```prisma
model SystemWLConfig {
  id                       Int       @id @default(autoincrement())
  channelUuid              String?   // AES-256-CBC encrypted
  enabled                  Boolean   @default(false)
  enforceChildCreds        Boolean   @default(false)
  airportDataset           Json?     // AirportEntry[] refreshed from OpenFlights
  airportDatasetUpdatedAt  DateTime?
  airportRadiusKm          Int       @default(100)
  airportMaxCount          Int       @default(3)
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt
}
```

### `OrgWLConfig`
```prisma
model OrgWLConfig {
  id                    Int          @id @default(autoincrement())
  organizationId        Int          @unique
  organization          Organization @relation(fields: [organizationId], references: [id])
  channelUuid           String?
  enabled               Boolean      @default(false)
  enforceChildCreds     Boolean      @default(false)
  systemServiceDisabled Boolean      @default(false)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
}
```

### `PropertyWLConfig`
```prisma
model PropertyWLConfig {
  id          Int      @id @default(autoincrement())
  propertyId  Int      @unique
  property    Property @relation(fields: [propertyId], references: [propertyId])
  channelUuid String?
  enabled     Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`Organization` model: add `orgWLConfig OrgWLConfig?`
`Property` model: add `propertyWLConfig PropertyWLConfig?`

---

## Shared Types

New file `packages/shared/src/types/wl-config.ts`:

```ts
export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
}

export interface WLConfigResponse {
  channelUuidSet: boolean
  channelUuidMasked: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  airportRadiusKm: number       // system only
  airportMaxCount: number       // system only
  airportDatasetUpdatedAt: string | null  // system only
}

export interface WLConfigUpdate {
  channelUuid?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
  airportRadiusKm?: number
  airportMaxCount?: number
}

export interface ResolvedWLConfig {
  channelUuid: string | null
  enabled: boolean
  iataCode: string | null       // nearest airport code, for WL URL
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
}
```

---

## API Routes

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/wl/config/system` | super | Get system WL + airport config |
| PUT | `/admin/wl/config/system` | super | Upsert system WL + airport config |
| POST | `/admin/wl/config/system/refresh-airports` | super | Re-download OpenFlights data, save to DB |
| GET | `/admin/wl/config?orgId=X` | super/admin | Get org WL config |
| PUT | `/admin/wl/config` | super/admin | Upsert org WL config |
| GET | `/admin/wl/config/property/:id` | super/admin | Get property WL config |
| PUT | `/admin/wl/config/property/:id` | super/admin | Upsert property WL config |

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/wl/config?propertyId=X` | Resolved WL config (channelUuid + iataCode) |
| GET | `/api/v1/airports/nearest?propertyId=X` | Nearest airports list for guest display |

---

## Admin UI

In `apps/web/src/app/admin/config/events/page.tsx`, a third card "Amadeus WL (Activities Booking)" added below "Amadeus Discover". New component: `amadeus-wl-card.tsx`.

**System level shows additionally:**
- Airport dataset section: last-updated timestamp + "Refresh Dataset" button (calls `POST /admin/wl/config/system/refresh-airports`)
- Radius slider (1–300 km, default 100)
- Max airports count slider (1–5, default 3)

---

## Guest UI

### Nearest Airports component (`apps/web/src/components/hotel/NearestAirports.tsx`)
- Fetches `GET /api/v1/airports/nearest?propertyId=X`
- Renders a horizontal row of chips: `✈ LHR London Heathrow 12 km · LGW Gatwick 45 km`
- Hidden when no airports within radius or endpoint returns empty

**Placement:**
1. **Search page** — below the hotel hero image (above room list)
2. **Hotel detail modal header** — below hotel name/address

### WL CTA Button (`apps/web/src/components/amadeus/AmadeusWLButton.tsx`)
- Fetches `GET /api/v1/wl/config?propertyId=X`
- Builds URL: `https://experiences.amadeus-discover.com/{uuid}?lang={lang}&currency={currency}&iataCode={iataCode}`
- `lang`: IBE locale mapped to WL supported set (`en/fr/es/de/it/pl`), default `en`
- `currency`: passed only if in WL supported set (`EUR/USD/GBP/NZD/AUD/AED/CHF/CNY/CAD`)
- Hidden when WL disabled or no UUID

**Placement:**
1. Search page — below the EventsStrip
2. Cross-sell page — below Activities & Tours section

### Translation keys
- `search.exploreActivities`: "Explore Activities & Tours →"
- `crossSell.exploreActivities`: "Explore Activities & Tours →"
- `search.nearestAirports`: "Nearest airports"

---

## Files Changed / Created

| File | Action |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add 3 models + relations + airport fields on SystemWLConfig |
| `apps/api/prisma/migrations/20260516000000_add_wl_config.sql` | Migration |
| `packages/shared/src/types/wl-config.ts` | New shared types |
| `packages/shared/src/index.ts` | Export new types |
| `apps/api/src/data/iata-cities.json` | Bundled airport dataset (generated) |
| `apps/api/scripts/generate-iata-dataset.mts` | One-time generator script |
| `apps/api/src/utils/iata-lookup.ts` | Haversine nearest-airports lookup |
| `apps/api/src/services/wl-config.service.ts` | WL config + resolution + airport refresh |
| `apps/api/src/routes/wl-config.route.ts` | All WL admin + public routes |
| `apps/api/src/app.ts` | Register new routes |
| `apps/web/src/lib/api-client.ts` | Add WL + airports api-client methods |
| `apps/web/src/components/hotel/NearestAirports.tsx` | Guest nearest-airports display |
| `apps/web/src/components/amadeus/AmadeusWLButton.tsx` | Guest WL CTA button |
| `apps/web/src/app/(main)/search/_content.tsx` | Add NearestAirports + WL CTA |
| `apps/web/src/app/(main)/booking/cross-sell/[bookingId]/page.tsx` | Add WL CTA |
| `apps/web/src/app/admin/config/events/amadeus-wl-card.tsx` | New WL admin card |
| `apps/web/src/app/admin/config/events/page.tsx` | Add WL card |
| `apps/api/src/translations/en.json` | Add translation keys |
