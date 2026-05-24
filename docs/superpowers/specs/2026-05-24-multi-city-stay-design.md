# Multi-City Stay — Design Spec

## Overview

Allow guests on a chain's booking page to plan a multi-destination trip across chain hotels. A "Multi-city trip" checkbox transforms the search form into a tabbed cart-like interface: each tab represents one city leg (city selector + dates + guests → inline search results). Selecting an offer per leg adds it to a Summary tab from which each leg is booked sequentially.

## Eligibility

The feature is only surfaced when **all three conditions** are true:
1. Tenant is an org context (`tenant.type === 'org'`)
2. The org has `multiCities > 1` (existing chain-page logic)
3. Effective `MultiCityConfig.enabled === true`

## Config Model — System → Org Inheritance

No property-level config (chain-level feature only).

```
SystemMultiCityConfig  (singleton, id = 1)
  enabled      Boolean  default false
  maxLegs      Int      default 3

OrgMultiCityConfig  (one row per org, sparse)
  organizationId  Int  @id (FK → Organization)
  enabled         Boolean?
  maxLegs         Int?
```

Effective value = org override if non-null, else system value.

## Shared Types (`packages/shared/src/types/api.ts`)

```ts
export interface MultiCityEffective {
  enabled: boolean
  maxLegs: number
}

export interface SystemMultiCityConfigResponse extends MultiCityEffective {}

export interface OrgMultiCityConfigResponse {
  enabled: boolean | null
  maxLegs: number | null
  effective: MultiCityEffective
}
```

## API Routes

### Public (no auth)
- `GET /api/v1/multi-city/config/org/:orgId/effective` → `MultiCityEffective`

### Admin (auth required)
- `GET /api/v1/admin/multi-city/config/system` → `SystemMultiCityConfigResponse`
- `PUT /api/v1/admin/multi-city/config/system` body: `Partial<MultiCityEffective>`
- `GET /api/v1/admin/multi-city/config/org/:orgId` → `OrgMultiCityConfigResponse`
- `PUT /api/v1/admin/multi-city/config/org/:orgId` body: `Partial<OrgMultiCityConfigResponse>`

## Frontend Components

### `MultiCityPanel` (`apps/web/src/components/home/MultiCityPanel.tsx`)

Manages an array of `MultiCityLeg` items:

```ts
type MultiCityLeg = {
  id: string           // nanoid for React key
  city: string
  propertyId: number | null
  checkIn: string
  checkOut: string
  rooms: GuestRoom[]
  selectedOffer: MultiCitySelectedOffer | null
}

type MultiCitySelectedOffer = {
  roomId: string
  roomName: string
  rateId: string
  rateName: string
  fromPrice: number
  currency: string
}
```

Tab bar: one tab per leg (city name or "City N") + Summary tab.

Each leg tab renders `MultiCityLegForm`. The Summary tab renders `MultiCitySummary`.

### `MultiCityLegForm`

- **City picker**: dropdown over `allPropertyOptions` unique cities (same data as existing `cities` array in SearchBar)
- When city changes → clear `propertyId`, show hotel picker (dropdown of properties in that city)
- **Date range**: check-in / check-out (reuse `CalendarDropdown`)
- **Guests**: room configuration (reuse `GuestsDropdown`)
- **Search button**: triggers query via `useQuery` → `/search?hotelId=N&checkIn=...`
- **Inline results**: simplified room/rate list (name + from-price + "Select" button)
- When "Select" → updates `leg.selectedOffer`, marks tab with checkmark indicator

### `MultiCitySummary`

- Lists each leg that has a `selectedOffer`:
  - Hotel name + city
  - Check-in → Check-out
  - Selected room name + from-price
  - "Book" button → `router.push('/search?' + encodeSearchParams(leg))` (navigates to standard search page pre-filled for that leg)
- Legs without a selected offer shown as grey placeholders
- "Complete your stay across all cities by booking each leg."

### Integration in `HomePageClient.tsx`

When eligible (org + multiCities > 1 + `multiCityConfig.data?.enabled`):
- Render a "Multi-city trip" toggle below/beside the `SearchBar`
- When toggled on: render `MultiCityPanel` instead of the `SearchBar`
- When toggled off: revert to normal `SearchBar`

### Hook: `useMultiCityConfig(orgId: number | null)`

```ts
useQuery({
  queryKey: ['multi-city-config', orgId],
  queryFn: () => apiClient.getOrgMultiCityEffective(orgId!),
  enabled: orgId != null,
  staleTime: 5 * 60 * 1000,
})
```

## Admin UI (`apps/web/src/app/admin/config/offers/page.tsx`)

Replace `ComingSoonCard` for the `multi-city` tab with:

- **System section** (super-admin only): Enable toggle + Max Legs number field
- **Org section** (when org context): Enable toggle (nullable/inherited) + Max Legs (nullable/inherited)

Same UI pattern as InterHotel Stay config sections (`IhToggle`, `IhNumberField`, etc.).

## Translation Keys (in `apps/api/src/translations/en.json`, under `"search"`)

```json
"multiCityTrip": "Multi-city Trip",
"multiCityAddCity": "Add city",
"multiCityRemoveCity": "Remove",
"multiCityLeg": "City {n}",
"multiCitySummary": "Summary",
"multiCitySelectHotel": "Select hotel",
"multiCityBook": "Book this leg",
"multiCityEmpty": "Select your stays for each city, then review the summary here.",
"multiCitySelectCity": "Select city",
"multiCitySearchResults": "Available rooms"
```
