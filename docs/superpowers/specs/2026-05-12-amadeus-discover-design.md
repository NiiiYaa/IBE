# Amadeus Discover Integration Design

**Date:** 2026-05-12  
**Feature:** Add Amadeus Discover as a second activities/cross-sell provider alongside Ticketmaster  
**Admin entry point:** `/admin/config/events`

---

## 1. Architecture Overview

Amadeus Discover runs as a **second provider** in the events system, parallel to Ticketmaster. Both providers are independently configured, independently fetched at runtime, and their results are combined at the API layer. The admin controls whether they appear merged in one guest strip or as two separate strips.

Inheritance chain: **System → Org (Chain) → Property (Hotel)**. Rooms level is not applicable.

New additions:
- 3 new DB models: `SystemAmadeusConfig`, `OrgAmadeusConfig`, `PropertyAmadeusConfig`
- 1 new service: `amadeus-config.service.ts`
- 1 new public route: `GET /amadeus/activities`
- 1 new combined route: `GET /activities-and-events`
- Updated admin page: `/admin/config/events` — second card added
- Updated guest component: `EventsStrip.tsx` — merged/separate rendering + bookable flag
- Extended AI tool: `get_nearby_events` merges Amadeus activities alongside Ticketmaster events
- Amadeus OAuth: client-credentials flow with Redis-cached bearer token

---

## 2. DB Schema

### 2.1 `SystemAmadeusConfig`

```prisma
model SystemAmadeusConfig {
  id                  Int      @id @default(autoincrement())
  clientId            String?  // AES-256-CBC encrypted
  clientSecret        String?  // AES-256-CBC encrypted
  enabled             Boolean  @default(false)
  enforceSystemCreds  Boolean  @default(false)  // if true, no org/hotel may use own credentials
  radiusKm            Int      @default(10)
  maxActivities       Int      @default(10)
  stripLabel          String   @default("Activities & Tours")
  stripMode           String   @default("separate")  // "merged" | "separate"
  stripDefaultFolded  Boolean  @default(false)
  stripAutoFoldSecs   Int      @default(15)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

### 2.2 `OrgAmadeusConfig`

```prisma
model OrgAmadeusConfig {
  id                    Int          @id @default(autoincrement())
  organizationId        Int          @unique
  organization          Organization @relation(fields: [organizationId], references: [id])
  clientId              String?      // AES-256-CBC encrypted; null = use system
  clientSecret          String?      // AES-256-CBC encrypted
  enabled               Boolean      @default(false)
  enforceOrgCreds       Boolean      @default(false)  // if true, hotels below cannot use own credentials
  systemServiceDisabled Boolean      @default(false)  // set by super to kill service for this org
  radiusKm              Int          @default(10)
  maxActivities         Int          @default(10)
  stripLabel            String       @default("Activities & Tours")
  stripMode             String       @default("separate")
  stripDefaultFolded    Boolean      @default(false)
  stripAutoFoldSecs     Int          @default(15)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
}
```

### 2.3 `PropertyAmadeusConfig`

```prisma
model PropertyAmadeusConfig {
  id                    Int      @id @default(autoincrement())
  propertyId            Int      @unique
  property              Property @relation(fields: [propertyId], references: [propertyId])
  clientId              String?  // AES-256-CBC encrypted; null = use org/system
  clientSecret          String?  // AES-256-CBC encrypted
  enabled               Boolean  @default(false)
  systemServiceDisabled Boolean  @default(false)  // set by chain/super to kill service for this hotel
  radiusKm              Int?     // null = use org/system value
  maxActivities         Int?     // null = use org/system value
  stripLabel            String?  // null = use org/system value
  stripMode             String?  // null = use org/system value
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

### 2.4 Inheritance Resolution Rules

**Credential resolution** (`getResolvedAmadeusCredentials`):
1. If `SystemAmadeusConfig.enforceSystemCreds = true` → use system clientId/clientSecret, ignore all others
2. Else if `OrgAmadeusConfig.enforceOrgCreds = true` → use org clientId/clientSecret, ignore property's
3. Else walk: property creds → org creds → system creds (first non-null set wins)

**Enable/disable cascade** (most restrictive wins):
- `SystemAmadeusConfig.enabled = false` → service off globally, no override possible
- `OrgAmadeusConfig.enabled = false` OR `OrgAmadeusConfig.systemServiceDisabled = true` → off for all hotels in that org
- `PropertyAmadeusConfig.enabled = false` OR `PropertyAmadeusConfig.systemServiceDisabled = true` → off for this hotel only

**Display settings cascade** (most specific wins):
- Property field non-null → use it
- Else org field → use it
- Else system field → use it

---

## 3. Admin Config UI

### 3.1 Page-level changes

Page at `/admin/config/events`:
- Title changes from "Events" to "Events & Activities"
- Description updated to reference both providers
- Ticketmaster card unchanged
- New "Amadeus Discover" card added below

### 3.2 Amadeus Discover card — fields per level

| Field | System | Org (Chain) | Property (Hotel) |
|---|---|---|---|
| Client ID | ✓ | ✓ | ✓ |
| Client Secret | ✓ | ✓ | ✓ |
| Enforce system/org creds (lock below) | `enforceSystemCreds` (super) | `enforceOrgCreds` (chain) | — |
| Enable / disable | ✓ | ✓ | ✓ |
| `systemServiceDisabled` toggle | super sets on org | super/chain sets on hotel | — |
| Search radius | ✓ | ✓ | ✓ (override, nullable) |
| Max activities | ✓ | ✓ | ✓ (override, nullable) |
| Strip label | ✓ | ✓ | ✓ (override, nullable) |
| Strip mode (merged / separate) | ✓ | ✓ | ✓ (override, nullable) |
| Strip display behaviour (fold / auto-fold) | ✓ | ✓ | — |
| Test Connection button | ✓ | ✓ | — |

### 3.3 Credential inheritance banner

Same pattern as existing Ticketmaster banner:
- Shows whether the level is using its own credentials or inheriting
- If parent has `enforceSystemCreds` / `enforceOrgCreds` set: credential fields are read-only with a banner explaining they are locked by the parent

### 3.4 Property-level "reset to inherited" 

Nullable override fields (radius, maxActivities, stripLabel, stripMode) each have a small "Reset" action that sets the field back to `null` (re-enabling inheritance from org/system).

### 3.5 Visibility rules

- **Super admin**: sees system config card + can view/edit any org or property config
- **Chain admin**: sees own org config + property configs for hotels in their org; cannot see system credentials
- **Hotel admin**: sees only their own property config (credentials + enable/disable + display overrides); cannot see org or system credentials

---

## 4. Amadeus OAuth + API Integration

### 4.1 Authentication

Standard OAuth 2.0 client-credentials flow:
1. POST `client_id` + `client_secret` → Amadeus token endpoint
2. Receive bearer token with expiry
3. Cache in Redis: key = `amadeus:token:<hash(clientId+clientSecret)>`, TTL = token expiry − 60s
4. All activity fetch calls use the cached token; auto-refresh on cache miss

Implemented as `getAmadeusToken(clientId, clientSecret): Promise<string>` in `amadeus-config.service.ts`.

### 4.2 `GET /amadeus/activities`

**Query params:** `propertyId`, `orgId` (fallback), `startDate`, `endDate`

> **Note:** The exact Amadeus Discover endpoint URL and request parameters (location search by lat/lng + radius) must be confirmed during implementation by reviewing the Amadeus Discover Quick Connect API docs / Postman collection. The service layer should isolate this behind a single `fetchAmadeusActivities(token, lat, lng, radiusKm, max)` function so the URL is changed in one place.

**Flow:**
1. Resolve config via `getResolvedAmadeusConfig(propertyId, fallbackOrgId)`
2. If not enabled or no credentials → return `{ enabled: false }`
3. Fetch property coordinates from static cache
4. Get bearer token via `getAmadeusToken`
5. Call Amadeus Recommendation Engine (products near lat/lng + radius)
6. Normalise response to:
```ts
{
  id: string
  name: string
  description: string | null
  category: string | null
  thumb: string | null
  price: number | null
  currency: string | null
  duration: string | null   // e.g. "2 hours"
  bookable: boolean          // from Amadeus per-product flag
  bookingUrl: string | null  // link-out URL; used when bookable = false or Phase 2 not yet live
}
```
7. Return `{ enabled: true, radiusKm, activities[], stripLabel, stripMode, stripDefaultFolded, stripAutoFoldSecs }`

### 4.3 `GET /activities-and-events` (combined)

Calls `/events` (Ticketmaster) and `/amadeus/activities` in parallel, returns:
```ts
{
  ticketmaster: { enabled: boolean, events: TmEvent[], stripDefaultFolded: boolean, stripAutoFoldSecs: number }
  amadeus: { enabled: boolean, activities: AmadeusActivity[], stripLabel: string, stripMode: string, stripDefaultFolded: boolean, stripAutoFoldSecs: number }
}
```
Both results are always present; `enabled: false` indicates that provider is off/unconfigured for this property.

---

## 5. Guest UI — EventsStrip

`EventsStrip.tsx` switches its fetch from `GET /events` to `GET /activities-and-events`.

### 5.1 Strip mode: `separate`

Two collapsible strips rendered sequentially:
- Strip 1: Ticketmaster events (label: "Events", existing card design)
- Strip 2: Amadeus activities (label: from `amadeus.stripLabel`, new activity card)
- If either provider is disabled → that strip is not rendered
- Each strip has its own fold/auto-fold settings from its provider config

### 5.2 Strip mode: `merged`

One collapsible strip:
- Label: `amadeus.stripLabel` (admin-configured; defaults to "Events & Activities")
- Items from both providers interleaved, sorted by date
- Each item carries a small source badge (optional, can be toggled by admin in future)
- Fold settings: use Amadeus strip settings when Amadeus is enabled; fall back to Ticketmaster strip settings if only Ticketmaster is enabled

### 5.3 Activity card

- Thumbnail, name, category, duration, price range (if available)
- `bookable = false` → "View" button (link-out to `bookingUrl`)
- `bookable = true` → "Book" button — **Phase 1**: link-out to `bookingUrl`. **Phase 2**: opens inline booking modal

---

## 6. AI Tool Extension

File: `apps/api/src/ai/tools/events.ts`

**Tool description updated** to: *"Get upcoming events and activities near the hotel: concerts, sports, theatre, tours, experiences, things to do. Call when the user asks about events, activities, or entertainment nearby."*

**`executeGetNearbyEvents` updated:**
1. Fetches Ticketmaster events (existing logic, unchanged)
2. In parallel, calls `getResolvedAmadeusConfig` + Amadeus Recommendation Engine
3. Returns unified structure:
```ts
{
  radiusKm: number,
  events: [...],      // Ticketmaster — omitted if disabled
  activities: [...],  // Amadeus: { name, category, duration, price, bookable } — omitted if disabled
  totalFound: number
}
```
4. Graceful degradation: if either provider errors or is disabled, its array is omitted with no error surfaced

---

## 7. Implementation Phases

### Phase 1 (this spec)
- DB migration: 3 new Prisma models
- `amadeus-config.service.ts`: CRUD + resolution logic + OAuth token helper
- New routes: `/amadeus/activities`, `/activities-and-events`
- Admin UI: Amadeus card on `/admin/config/events`
- `EventsStrip.tsx`: merged/separate rendering, activity cards with link-out
- AI tool: extended to merge activities
- Tests: service resolution logic (all inheritance paths), route integration tests

### Phase 2 (separate spec)
- Inline booking modal: 7-step Amadeus flow (Availability → Options → Prices → Creation → Questions → Confirmation → Post-Booking)
- `bookable = true` button triggers modal instead of link-out

---

## 8. Types — `packages/shared/src/types/amadeus-config.ts`

```ts
export interface AmadeusConfigResponse {
  credentialsSet: boolean
  credentialsMasked: { clientId: string | null }
  credentialsLocked: boolean   // parent enforces its own credentials
  enabled: boolean
  enforceChildCreds: boolean   // this level locks credentials for levels below
  radiusKm: number
  maxActivities: number
  stripLabel: string
  stripMode: 'merged' | 'separate'
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
}

export interface AmadeusConfigUpdate {
  clientId?: string
  clientSecret?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
  radiusKm?: number
  maxActivities?: number
  stripLabel?: string
  stripMode?: 'merged' | 'separate'
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}
```
