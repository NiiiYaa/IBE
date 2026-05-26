# Multi-Provider Hotel Inventory — Design Spec

**Date:** 2026-05-26  
**Status:** Approved

---

## Overview

Add support for multiple hotel inventory providers (starting with Hubwayz) alongside the existing HyperGuest integration. Each seller (org) holds their own credentials per provider. Search fans out across all configured providers in parallel, streaming results back via SSE. The guest sees one card per physical hotel; rates from all providers are shown inside, sorted by configurable criteria.

---

## Key Principles

- The existing `Property` model and HG hotel-website flow are **untouched**. They serve a different use case (hotel's own white-label IBE) and must not be disrupted.
- Multi-provider search is a **parallel, additive** system — a new search surface alongside the existing one.
- HG participates in multi-provider search too, alongside aggregators like Hubwayz.
- HG inventory is "direct" (from hotels); other providers are aggregators. Both are shown; guest picks by rate.

---

## 1. Data Models

### `MasterHotel`
Canonical hotel registry. Internal ID is platform-owned, not tied to any provider.

| Field | Type | Notes |
|---|---|---|
| `id` | Int PK | Auto-increment, platform-internal |
| `name` | String | Canonical name (from best source) |
| `latitude` | Float | |
| `longitude` | Float | |
| `countryCode` | String | ISO 2-letter |
| `city` | String | |
| `starRating` | Int? | |
| `address` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### `MasterHotelProviderMapping`
Maps each provider's hotel ID to a `MasterHotel`.

| Field | Type | Notes |
|---|---|---|
| `id` | Int PK | |
| `masterHotelId` | Int FK | → MasterHotel |
| `provider` | String | `'hyperguest' \| 'hubwayz' \| ...` |
| `externalId` | String | Provider's hotel ID |
| `matchConfidence` | Float? | 0–1, set during auto-match |
| `matchedByAI` | Boolean | Whether AI was used |
| `verifiedAt` | DateTime? | Null = unconfirmed auto-match |
| `createdAt` | DateTime | |

`@@unique([provider, externalId])`

### `OrgProviderCredentials`
Per-seller, per-provider credentials. Shape varies by provider; stored as AES-256 encrypted JSON.

| Field | Type | Notes |
|---|---|---|
| `id` | Int PK | |
| `organizationId` | Int FK | → Organization |
| `provider` | String | Provider slug |
| `credentials` | String | Encrypted JSON |
| `isActive` | Boolean | @default(true) |
| `searchTimeoutSeconds` | Int | @default(30), configurable per provider |
| `markupMode` | String? | `'percent' \| 'amount' \| 'higher' \| 'lower'`, null = no markup |
| `markupPercent` | Float? | e.g. 10 = 10% |
| `markupAmount` | Float? | fixed amount per booking |
| `markupCurrency` | String? | ISO 3-letter, required when markupAmount is set |
| `lastSyncScope` | String? | JSON: last used sync scope (country/city/maxHotels/full), reused by nightly cron |
| `lastSyncedAt` | DateTime? | Timestamp of last completed sync |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

`@@unique([organizationId, provider])`

### `Booking` — two new fields (extend existing model)
```
provider     String?  @default("hyperguest")
providerRef  String?  // provider's own booking confirmation ID
```
Existing HG bookings default to `provider = 'hyperguest'`. No migration risk.

---

## 2. Provider Adapter Interface

Every provider implements this TypeScript interface. Adding a new provider = adding a new adapter file; nothing else changes.

```typescript
interface ProviderAdapter {
  provider: ProviderSlug  // 'hyperguest' | 'hubwayz' | ...

  // Returns results incrementally — sync providers yield once, polling providers yield per poll
  search(
    params: MultiProviderSearchParams,
    credentials: unknown
  ): AsyncGenerator<ProviderSearchResult>

  prebook(params: PrebookParams, credentials: unknown): Promise<PrebookResult>
  book(params: BookParams, credentials: unknown): Promise<BookingResult>
  cancel(bookingRef: string, credentials: unknown): Promise<void>
}
```

Each adapter defines its own typed credentials shape + Zod validation schema. The credentials `unknown` is cast internally.

**HyperGuest adapter:** HG's API is hotel-ID-specific (not location-based). The adapter resolves this by: (1) looking up all `MasterHotelProviderMapping` entries with `provider='hyperguest'` for the org, (2) filtering to hotels within the destination geo, (3) fan-out searching each hotel ID in parallel using existing HG search logic. Yields one result per hotel as each completes.  
**Hubwayz adapter:** issues a single destination-based search, polls until `status === 'done'` or timeout (30s), yields results per poll cycle.

---

## 3. Admin Credentials UI

- New **Providers** section in org admin settings
- One tab per supported provider (HyperGuest, Hubwayz, ...)
- Each tab is split into two sections:

  **Search & Booking credentials** (provider-specific):
  - HyperGuest: `bearerToken`, `searchDomain`, `bookingDomain`
  - Hubwayz: `account`, `agent`, `password`, `applicationKey`

  **Static Data API** (provider-specific, used by the hotel matching pipeline):
  - HyperGuest: `staticDomain` (already part of HG credentials)
  - Hubwayz: static feed URL + any required auth (e.g. separate API key or SFTP credentials)
  - Other providers: whatever endpoint/auth their static hotel list requires
  - Test connection button — validates credentials and returns estimated hotel count

- Additional settings on every provider tab:
  - **Search timeout** (seconds) — default 30, configurable
  - **Markup** — mode selector (none / % / fixed amount / higher of two / lower of two) + percent field + amount+currency field. Applied to all rates from this provider before display.
- Active/inactive toggle per provider
- Saving credentials does **not** auto-trigger hotel matching. A separate **"Sync Hotels"** button initiates the pipeline, with a scoping dialog (see Section 5).

---

## 4. Search Flow (SSE)

### Endpoint
`GET /api/multi-search` — SSE stream

### Search params
Location-based (not hotel-specific): `{ destination, checkIn, checkOut, rooms, currency, nationality, orgId }`

Destination can be: city name or lat/lng + radius. The frontend resolves a typed location to coordinates via geocoding before calling this endpoint.

### Flow
```
1. Resolve all active OrgProviderCredentials for the org
2. For each provider: instantiate adapter, call search() async generator
3. Stream SSE events as generators yield:
   - event: "results"  { provider, masterHotelId, rates[] }
   - event: "provider:done"  { provider }
   - event: "done"
4. Per-provider timeout: `OrgProviderCredentials.searchTimeoutSeconds` — after which send provider:done regardless
```

### Frontend behaviour
- Renders hotel cards as `results` events arrive
- Groups by `masterHotelId` — one card per hotel
- Card shows lowest rate across all providers received so far; updates as more arrive
- Provider loading indicators per-provider (spinner until `provider:done`)
- On `done`: finalize sort

### Rate sorting inside hotel detail
Configurable per org in admin (Offers settings):
- Price ascending (default)
- Refundable first
- Direct (HG) first
- Combination: refundable + price, etc.

Board type codes (`BB`, `HB`, `AI`, `RO`, etc.) are normalized to human-readable labels in the adapter layer, regardless of provider.

**Markup application:** after each provider yields results, the fan-out orchestrator applies the markup from `OrgProviderCredentials` to all rates before emitting the SSE event. The raw provider rate is never sent to the frontend — only the marked-up price.

Markup modes:
| Mode | Formula | Use case |
|---|---|---|
| `percent` | `rate × (1 + %/100)` | Simple percentage uplift |
| `amount` | `rate + fixedAmount` | Fixed fee per booking |
| `higher` | `max(rate × (1 + %/100), rate + fixedAmount)` | Guarantee minimum fixed profit on cheap rates |
| `lower` | `min(rate × (1 + %/100), rate + fixedAmount)` | Cap markup on expensive rates |

When `markupMode` is null, rates are passed through unchanged. The fixed amount is converted to the rate's currency at current exchange rates before comparison.

---

## 5. Hotel Matching Pipeline

Runs **offline** — not on the search path.

### Triggers
- Admin clicks **"Sync Hotels"** button on the provider tab (explicit user action — never auto-triggered)
- Nightly cron re-sync (only if the org has previously done at least one full sync)

### Sync scope dialog
Because providers can have very large hotel inventories (100k+), every sync — including the first — requires the admin to set a scope before it runs:

| Scope option | Description |
|---|---|
| Country | Only sync hotels in selected country/countries |
| City | Only sync hotels in a specific city |
| Max hotels | Cap at N hotels (for testing/staging) |
| Full inventory | No limit (production use, may take a long time) |

The dialog shows an estimated hotel count for the selected scope (if the provider supports it) and a warning for large syncs. The nightly cron re-uses the last saved scope.

### Process
```
1. Fetch full hotel list from provider (static data endpoint)
2. For each provider hotel:
   a. Geo search: find MasterHotel records within ~200m radius
   b. Name match: fuzzy string similarity against candidates
   c. If high confidence (>0.85): auto-create mapping, matchedByAI=false
   d. If medium confidence (0.5–0.85): use AI to compare name/address/stars → auto-match with matchedByAI=true, verifiedAt=null
   e. If no match: create new MasterHotel + mapping
3. Low-confidence/AI matches surface in admin for human review
```

### Admin review UI
- Table of unverified mappings (`verifiedAt = null`)
- Shows: provider hotel name + MasterHotel name, confidence score, map pin comparison
- Admin can confirm, reject (creates new MasterHotel), or manually link to a different MasterHotel

### At search time
- Provider returns `externalId` → look up `MasterHotelProviderMapping` → get `masterHotelId`
- If no mapping found (new hotel, not yet synced): skip in current search, queue for next sync

---

## 6. Booking Flow

### New endpoints
- `POST /api/multi-prebook` — validates rate still live, returns updated price + payment options
- `POST /api/multi-book` — confirms reservation

### Flow
```
Guest selects a rate
  → rate carries: { provider, resultToken, sessionId }
  → POST /multi-prebook { provider, resultToken, sessionId, guestDetails }
  → adapter.prebook() — provider-specific validation
  → POST /multi-book { provider, prebookToken, guestDetails, payment }
  → adapter.book()
  → Store in Booking table with provider + providerRef
```

The existing `/api/book` route (HG hotel-website flow) is **unchanged**.

### Session/token expiry
Result tokens and session IDs are short-lived (minutes). If the guest takes too long before booking, prebook returns a "rate expired" error. The frontend prompts the guest to re-search — same behaviour as the existing HG flow.

### Cancellation
`POST /api/multi-cancel { bookingId }` — looks up `Booking.provider`, routes to the correct adapter's `cancel()` method.

---

## 7. Channel Architecture

The current selling channels are the **B2C frontend** and **B2B (logged-in) frontend**. The design must be prepared for future channels — REST API and MCP — without requiring a rewrite.

**How this is ensured:**

- The **fan-out orchestrator** and **provider adapters** are channel-agnostic. They take `MultiProviderSearchParams` and return results; they have no knowledge of who is consuming them.
- The **SSE transport** is a frontend-specific concern only. It is a thin wrapper around the orchestrator. Future channels wrap the same orchestrator differently:
  - **REST API channel** — polling pattern: POST to start a search, GET to poll for results (orchestrator runs in background, results stored temporarily)
  - **MCP channel** — orchestrator exposed as an MCP tool, results returned as structured tool output
- **Prebook and book** are already plain REST — naturally consumable by any channel.
- **Markup** is applied at the orchestrator level, so all channels see marked-up rates consistently.
- **Auth** per channel: frontend uses session/JWT, API channel uses API keys, MCP uses OAuth tokens (existing OAuth server).

No channel-specific logic bleeds into the adapters or orchestrator. Adding a new channel = adding a new transport wrapper only.

---

## 8. B2B Buyer Credentials

B2B buyers (e.g. travel agencies) log into the seller's IBE. Two scenarios are supported:

**Scenario A — Buyer uses seller's credentials:** the buyer searches using the seller's provider account. Seller's markup applies. This is the default and requires no extra configuration.

**Scenario B — Buyer has their own provider account:** a buyer org brings their own credentials for a provider (e.g. their own Hubwayz contract with negotiated rates). Their rates replace the seller's rates for that provider in that session.

### Data model — `BuyerOrgProviderCredentials`

| Field | Type | Notes |
|---|---|---|
| `id` | Int PK | |
| `buyerOrgId` | Int FK | → Organization (the buyer) |
| `sellerOrgId` | Int FK | → Organization (the seller, must have that provider active) |
| `provider` | String | Provider slug |
| `credentials` | String | Encrypted JSON, same shape as seller credentials |
| `isActive` | Boolean | @default(true) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

`@@unique([buyerOrgId, sellerOrgId, provider])`

### Credential resolution at search time

```
1. Is this a B2B session (buyerOrgId present)?
   a. Does BuyerOrgProviderCredentials exist for (buyerOrgId, sellerOrgId, provider)?
      → Yes: use buyer's credentials
      → No: fall back to seller's OrgProviderCredentials
2. B2C session: always use seller's OrgProviderCredentials
```

Mirrors the existing `getBuyerHGCredentials()` pattern in the codebase.

**Markup:** the seller's markup always applies regardless of whose credentials are used. The seller controls pricing on their platform.

**Admin UI:** buyer credentials are managed by the seller admin under a buyer org's settings page — same provider tabs, but scoped to the buyer relationship.

---

## 9. What's Out of Scope

- Room-level deduplication across providers: each provider's room list is shown independently within a hotel card. Board type codes are normalized to labels but room names are not matched.
- Rate parity alerts between providers: deferred.
