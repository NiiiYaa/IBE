# Daily Rate Offers — Design Spec

**Date:** 2026-05-23
**Status:** Approved

## Problem

The pricing collection service (`pricing-collect.service.ts`) searches HyperGuest and receives
offers structured as `room × board × cancellation policy × nightly price`. Currently it keeps
only the minimum sell price per date (for the calendar) and discards all offer identity. This
means anomaly display is limited to price/date with no context about which room or rate plan is
anomalous.

## Goal

1. Persist all collected offers per day (bounded by a configurable limit) for richer analysis.
2. Surface offer details (Room / Board / Cancellation) alongside anomalies on the admin dashboard.
3. Add `maxOffersForAnalysis` as an inheritable config param (system → org → property).

---

## Data Layer

### New table: `DailyRateOffer`

Stores all collected offers for a property+date, bounded by `maxOffersForAnalysis`. Replaced
entirely on each collection run.

| Column               | Type    | Notes                                    |
|----------------------|---------|------------------------------------------|
| id                   | Int PK  | auto-increment                           |
| propertyId           | Int     | FK → Property                            |
| date                 | String  | ISO date `YYYY-MM-DD`                    |
| roomId               | Int     |                                          |
| roomName             | String  |                                          |
| board                | String  | e.g. `RO`, `BB`, `HB`, `FB`, `AI`       |
| cancellationLabel    | String  | `Free` \| `Non-refundable` \| `Partial`  |
| sellPrice            | Float   |                                          |
| currency             | String  |                                          |
| rank                 | Int     | 1 = cheapest for that property+date      |
| collectedAt          | DateTime|                                          |

Unique index: `(propertyId, date, rank)`.

### `DailyRate` — 4 new nullable columns

Populated from the rank-1 `DailyRateOffer` (cheapest offer) at write time. Avoids joins at
query time for anomaly display.

- `cheapestRoomId: Int?`
- `cheapestRoomName: String?`
- `cheapestBoard: String?`
- `cheapestCancellationLabel: String?`

### Config models — new `maxOffersForAnalysis` field

Added to `SystemPricingConfig`, `OrgPricingConfig`, and `PropertyPricingConfig`.

| Model                  | Type       | Default |
|------------------------|------------|---------|
| SystemPricingConfig    | `Int`      | `10`    |
| OrgPricingConfig       | `Int?`     | null (inherits) |
| PropertyPricingConfig  | `Int?`     | null (inherits) |

Inheritance: system → org → property, same pattern as `highPricePct` and all other numeric params.

---

## Collection Flow (`pricing-collect.service.ts`)

Current `extractNightlyPrices` discards offer identity. Replace with a two-output extraction:

1. **Min price per date** → `NightlyPrice[]` (unchanged shape, feeds `DailyRate` upsert)
2. **All offers per date** → `OfferEntry[]` sorted by price ascending, truncated to `maxOffersForAnalysis`

`OfferEntry`:
```ts
{
  date: string
  roomId: number
  roomName: string
  board: string
  cancellationLabel: 'Free' | 'Non-refundable' | 'Partial'
  sellPrice: number
  currency: string
  rank: number  // 1-based
}
```

**Cancellation label derivation:** inspect `cancellationPolicies` on the rate plan.
- Any policy with `price.amount === 0` that covers a future window → `Free`
- All policies have `price.amount > 0` → `Non-refundable`
- Mixed → `Partial`

**Upsert order per window:**
1. Delete existing `DailyRateOffer` rows for `propertyId` + dates in this window.
2. Insert new `DailyRateOffer` rows.
3. Upsert `DailyRate` with cheapest offer fields from rank-1 entry.

`resolveEffectivePricingConfig` already returns the effective config; add `maxOffersForAnalysis`
to its return type and threading.

---

## API (`pricing.route.ts`)

The `GET /admin/pricing/:propertyId/data` endpoint returns `DayRateAdminEntry[]`. Add fields:

```ts
interface DayRateAdminEntry {
  // existing
  date: string
  price: number
  currency: string
  calendarColor: string
  anomalyType: 'high' | 'low' | 'diff' | null
  rollingAvg: number | null
  // new
  cheapestRoomName: string | null
  cheapestBoard: string | null
  cheapestCancellationLabel: string | null
}
```

Select the new columns from `DailyRate` in the Prisma query (no join needed).

---

## Admin Dashboard (`dashboard/page.tsx`)

`AnomalyTable` currently shows: Date / Day / Price / Avg / Dev%.

Add three columns after Dev%: **Room / Board / Cancellation**.

Populated from `cheapestRoomName`, `cheapestBoard`, `cheapestCancellationLabel` on the row.
Render `—` when null (data collected before this feature was deployed).

---

## Admin Config UI

Add `maxOffersForAnalysis` to the System, Org, and Property pricing config panels (numeric
input, label "Max offers for analysis", same pattern as `dayDifferenceWindow`).

---

## Migrations (in order)

1. `add_daily_rate_offer_table` — create `DailyRateOffer`, add unique index.
2. `add_daily_rate_cheapest_offer_fields` — add 4 nullable columns to `DailyRate`.
3. `add_pricing_max_offers` — add `maxOffersForAnalysis` to all three config models.

---

## Shared Types (`@ibe/shared`)

- Add `maxOffersForAnalysis` to `SystemPricingConfigResponse`, `OrgPricingConfigResponse`,
  `PropertyPricingConfigResponse`, and their effective resolution types.
- Add `cheapestRoomName`, `cheapestBoard`, `cheapestCancellationLabel` to `DayRateAdminEntry`.

---

## Out of Scope

- Per-offer anomaly detection (offer disappearance, board-type shift) — future work once data
  accumulates.
- Exposing `DailyRateOffer` rows directly via API — not needed for initial dashboard use case.
