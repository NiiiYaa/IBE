# Airport Display — Design Spec

**Date:** 2026-05-16  
**Status:** Approved

## Overview

Decouple the "nearest airports" display feature from the Amadeus WL integration. Airport display (showing a hotel's nearest airports with distances) is general-purpose hotel information, not specific to Amadeus WL. It gets its own config models, service, admin card (in the Design tab), and inheritance chain (system→org→property).

The Amadeus WL feature continues to read the nearest airport IATA code for building WL URLs, but sources it from the airport service rather than owning the data itself.

## Data Models

Three new Prisma models:

```prisma
model SystemAirportConfig {
  id                      Int       @id @default(autoincrement())
  enabled                 Boolean   @default(false)
  radiusKm                Int       @default(100)
  maxCount                Int       @default(3)
  airportDataset          Json?     // AirportEntry[]
  airportDatasetUpdatedAt DateTime?
}

model OrgAirportConfig {
  id             Int          @unique @default(autoincrement())
  organizationId Int          @unique
  organization   Organization @relation(fields: [organizationId], references: [id])
  enabled        Boolean?     // null = inherit from system
  radiusKm       Int?         // null = inherit from system
  maxCount       Int?         // null = inherit from system
}

model PropertyAirportConfig {
  id         Int      @unique @default(autoincrement())
  propertyId Int      @unique
  property   Property @relation(fields: [propertyId], references: [propertyId])
  enabled    Boolean? // null = inherit from org → system
  radiusKm   Int?     // null = inherit from org → system
  maxCount   Int?     // null = inherit from org → system
}
```

**Removed from `SystemWLConfig`:** `airportDataset`, `airportDatasetUpdatedAt`, `airportRadiusKm`, `airportMaxCount`.

**Migration:** Prisma migration creates the new tables, copies existing data from `SystemWLConfig` into `SystemAirportConfig` via raw SQL, then drops the four columns from `SystemWLConfig`. `enabled` defaults to `false` on the new system model.

## Shared Types

New file: `packages/shared/src/types/airport-config.ts`

```ts
export interface AirportConfigResponse {
  enabled: boolean
  radiusKm: number          // effective value (system default if not overridden)
  maxCount: number          // effective value
  hasOwnConfig: boolean
  datasetUpdatedAt: string | null  // system tier only; null at org/property
}

export interface AirportConfigUpdate {
  enabled?: boolean | null   // null = revert to inherit
  radiusKm?: number | null   // null = revert to inherit
  maxCount?: number | null   // null = revert to inherit
}

export interface ResolvedAirportConfig {
  enabled: boolean
  radiusKm: number
  maxCount: number
}
```

`NearestAirport` and `NearestAirportsResponse` remain in `wl-config.ts` for now but move to `airport-config.ts` as part of this work.

## Service

New file: `apps/api/src/services/airport-config.service.ts`

Functions:
- `getSystemAirportConfig()` → `AirportConfigResponse`
- `upsertSystemAirportConfig(data: AirportConfigUpdate)` → `AirportConfigResponse`
- `refreshAirportDataset()` → `{ count: number; updatedAt: string }` (moved from `wl-config.service.ts`)
- `getOrgAirportConfig(orgId)` → `AirportConfigResponse`
- `upsertOrgAirportConfig(orgId, data)` → `AirportConfigResponse`
- `getPropertyAirportConfig(propertyId)` → `AirportConfigResponse`
- `upsertPropertyAirportConfig(propertyId, data)` → `AirportConfigResponse`
- `getResolvedAirportConfig(propertyId)` → `ResolvedAirportConfig` — walks system→org→property, resolves `enabled` and effective `radiusKm`/`maxCount`
- `getNearestAirports(propertyId)` → `NearestAirportsResponse` — returns `[]` if `resolved.enabled` is false

**Inheritance resolution for radiusKm/maxCount:** property value if non-null, else org value if non-null, else system default.

**`wl-config.service.ts` changes:**
- Remove `refreshAirportDataset`, `getNearestAirports`, `getSystemDataset`, `getPropertyLatLng` functions
- Remove airport fields from `systemRowToResponse`
- In `getResolvedWLConfig`: replace inline airport lookup with a call to `getNearestAirports(propertyId)` from the airport service to get `iataCode`

## API Routes

New file: `apps/api/src/routes/airport-config.route.ts`

Endpoints:
- `GET /api/v1/airports/nearest?propertyId=N` — guest-facing, no auth
- `GET /api/v1/admin/airport-config/system` — system admin
- `PUT /api/v1/admin/airport-config/system` — system admin
- `POST /api/v1/admin/airport-config/system/refresh-dataset` — system admin
- `GET /api/v1/admin/airport-config/org/:orgId` — org/system admin
- `PUT /api/v1/admin/airport-config/org/:orgId` — org/system admin
- `GET /api/v1/admin/airport-config/property/:propertyId` — org/system admin
- `PUT /api/v1/admin/airport-config/property/:propertyId` — org/system admin

Remove `/airports/nearest` and the dataset refresh endpoint from `wl-config.route.ts`.

## Admin UI

New file: `apps/web/src/app/admin/config/design/airport-config-card.tsx`

Card title: **"Nearest Airports"** with a plane icon. Placed in the Design tab alongside existing design cards at all three tiers (system, org, property).

**System tier:** enabled toggle + radius slider (1–300 km, default 100) + max count slider (1–5, default 3) + "Refresh Dataset" button showing last updated date.

**Org tier:** enabled toggle with inherit indicator when null + optional radius override (shows system value as placeholder) + optional max count override.

**Property tier:** same as org tier, inheriting from org→system.

**`amadeus-wl-card.tsx` changes:** Remove the radius/max count sliders and the dataset refresh button. The WL card is left with: channel UUID input, enabled toggle, enforce child creds toggle, system-service-disabled toggle.

## Guest Component

`NearestAirports` component has no visual changes. The `/api/v1/airports/nearest` endpoint now gates on `ResolvedAirportConfig.enabled`. If disabled, returns `{ airports: [] }` and the component renders nothing.

Component is used on:
- Search page: `apps/web/src/app/(main)/search/_content.tsx:184`
- Property detail modal: `apps/web/src/components/home/PropertyDetailModal.tsx:104`

No changes needed at these call sites.

## Testing

- Unit tests for `airport-config.service.ts`: inheritance resolution for all three tiers, `getNearestAirports` respects `enabled` flag
- Existing `iata-lookup.test.ts` unchanged
- Verify WL `iataCode` still resolves correctly after the service change
