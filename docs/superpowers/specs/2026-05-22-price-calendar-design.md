# Price Calendar & Anomaly Detection — Design Spec

**Date:** 2026-05-22  
**Status:** Approved  

---

## Overview

A daily rate intelligence feature that:
1. Collects the lowest nightly price for each hotel for the next 365 days via sequential HyperGuest searches
2. Classifies each day as cheap (green), normal (blue), or expensive (red) using a rolling 8-week same-day-of-week average
3. Displays prices on the guest-facing search calendar
4. Surfaces price anomalies on the admin dashboard
5. Provides admin config with system → chain → hotel inheritance

---

## 1. Data Model

### `SystemPricingConfig` (one row)
| Field | Type | Default |
|---|---|---|
| `enabled` | Boolean | false |
| `openToAll` | Boolean | true |
| `refreshIntervalDays` | Int | 1 |
| `highPricePct` | Float | 15 |
| `lowPricePct` | Float | 15 |
| `highAnomalyPct` | Float | 30 |
| `lowAnomalyPct` | Float | 30 |
| `dayDifferencePct` | Float | 35 |
| `dayDifferenceWindow` | Int | 7 |

### `OrgPricingConfig` (chain-level override)
- All value fields nullable (null = inherit from system)
- `systemServiceDisabled` Boolean — chain opted out entirely

### `PropertyPricingConfig` (hotel-level override)
- All value fields nullable (null = inherit from org → system)
- `orgServiceDisabled` Boolean — hotel opted out entirely

### `DailyRate` (composite unique on `propertyId + date`)
| Field | Type | Notes |
|---|---|---|
| `propertyId` | Int | |
| `date` | String | YYYY-MM-DD |
| `minSellPrice` | Float | Lowest sell price across all rooms/rate plans |
| `currency` | String | Native HG currency |
| `available` | Boolean | false = no rates returned for this night |
| `calendarColor` | String | `low` \| `normal` \| `high` — drives guest calendar display |
| `anomalyType` | String? | `high` \| `low` \| `diff` \| null — drives dashboard table; independent of calendarColor |
| `rollingAvg` | Float? | Stored for debugging and export |
| `collectedAt` | DateTime | |

---

## 2. Collection Queue (BullMQ)

**Queue:** `pricing` — connected to existing Redis instance  
**Concurrency:** 2 (light HG API calls)  
**Existing crons** (`node-cron`) unchanged — BullMQ is introduced only for pricing.

### Job: `collect-hotel-prices`
Payload: `{ propertyId, triggeredBy: 'cron' | 'manual' }`  
Priority: `1` for manual, `10` for cron (lower = higher priority)

### Collection flow per job
1. Resolve effective pricing config (system → org → property)
2. Fetch HG credentials for the property's org
3. Run ~13 sequential searches: 29-day windows from today to today+365 (1 guest)
4. From each search: iterate all rooms × rate plans, take the minimum `sell` price per night from `nightlyBreakdown`; if no rates for a night → `available: false`
5. Upsert all 365 `DailyRate` rows
6. After all batches complete: run classification
7. Invalidate Redis cache for this property's calendar endpoint
8. Mark job complete

### Classification (runs after collection)
For each day:
1. Compute rolling 8-week same-day average: take all DailyRates for this property with the same weekday within ±4 weeks, compute mean
2. Assign `calendarColor`: price > avg × (1 + highPricePct/100) → `high`; price < avg × (1 - lowPricePct/100) → `low`; else `normal`
3. Assign `anomalyType` independently: `high` if > highAnomalyPct above avg; `low` if > lowAnomalyPct below avg; `diff` if price dropped > dayDifferencePct vs average of previous X days; else null

Note: `calendarColor` and `anomalyType` are independent — a day can be `normal` color with a `diff` anomaly, or `high` color with no anomaly.

### Nightly cron
At 2am UTC, a `node-cron` job enqueues one `collect-hotel-prices` job per hotel where pricing is effectively enabled. BullMQ handles execution.

### Manual refresh
`POST /admin/pricing/refresh/:propertyId` enqueues a priority job. If a job for that hotel is already queued or running, returns `{ status: 'already_running' }` — no duplicate enqueue.

---

## 3. Admin Config UI

**Location:** Config → Misc (new sub-menu) → Pricing section

### System level (SuperAdmin)
- Enable toggle + Open to All toggle
- Refresh interval (days)
- 6 threshold inputs (% or days)

### Chain level
- Inherits system values (shown greyed out)
- Can override any field
- "Opt out" toggle (`systemServiceDisabled`)

### Hotel level
- Inherits chain → system values (shown greyed out)
- Can override any field
- "Opt out" toggle (`orgServiceDisabled`)
- **"Refresh Now"** button — triggers immediate collection; shows `Queued`, `Running`, or `Last collected: <timestamp>`
- **"Export"** button — downloads Excel (active only after first collection run)

### Excel export columns
Date, Day of Week, Min Sell Price, Currency, Available (Y/N), Calendar Color, Anomaly Type, Rolling Avg, % vs Avg

---

## 4. Guest-Facing Calendar

**Trigger:** When a hotel page opens, if pricing is effectively enabled for that hotel, one API call fetches all 365 daily rates. If not enabled — no call, calendar renders unchanged.

**`CalendarDropdown` changes:**
- New optional prop: `dailyRates?: Record<string, DayPrice>`
- `DayPrice`: `{ price: number; currency: string; available: boolean; calendarColor: 'low' | 'normal' | 'high' }`

**Cell rendering:**
- Price displayed below the date number in smaller font
- `low` → green text; `normal` → blue text; `high` → red text
- `available: false` → strikethrough on date number + dot (·) below
- Past dates → dot (·), no price
- No data yet → dot (·), no price

**Compact price formatting:**
- `< 1,000` → `120`
- `≥ 1,000` → `1.2K`
- `≥ 1,000,000` → `1.5M`
- No currency symbol in cell

**Currency note:** Single line below the calendar — `Prices in USD` (user's selected currency).  
Price conversion uses existing exchange rate mechanism at render time.  
Classification colors are computed on native currency values (not converted).

---

## 5. Dashboard Anomaly Table

**Location:** New card on admin dashboard (same level as CompSet Insights card).  
Visible only when pricing is enabled and at least one collection run is complete.

**Three collapsible sub-tables:**
1. **High Price Anomalies** — days > `highAnomalyPct` above rolling avg
2. **Low Price Anomalies** — days > `lowAnomalyPct` below rolling avg
3. **Day Difference Anomalies** — days where price dropped > `dayDifferencePct` vs prev X-day avg

**Columns:** Date, Day of Week, Price, Rolling Avg / Prev X-day Avg, Deviation %, Anomaly Type badge  
**Sort:** Deviation % descending  
**Empty state:** "No anomalies detected"  
**Card header:** Last collected timestamp  
**Export button:** Same Excel as config page export

---

## 6. API Routes

### Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/pricing/calendar/:propertyId?currency=USD` | 365 daily rates, converted to requested currency. Redis cache TTL 1h, invalidated on collection complete |

### Admin — Config
| Method | Path | Description |
|---|---|---|
| GET | `/admin/pricing/config` | System config (SuperAdmin) |
| PUT | `/admin/pricing/config` | Update system config |
| GET | `/admin/pricing/config/org/:orgId` | Chain config with resolved effective values |
| PUT | `/admin/pricing/config/org/:orgId` | Update chain config |
| GET | `/admin/pricing/config/property/:propertyId` | Hotel config with resolved effective values |
| PUT | `/admin/pricing/config/property/:propertyId` | Update hotel config |

### Admin — Operations
| Method | Path | Description |
|---|---|---|
| POST | `/admin/pricing/refresh/:propertyId` | Enqueue priority job; returns `{ status: 'queued' \| 'already_running' }` |
| GET | `/admin/pricing/status/:propertyId` | Job status, last collected timestamp, row count |
| GET | `/admin/pricing/export/:propertyId` | Stream Excel file |

---

## Key Constraints

- Hotels without feature enabled: no DB reads, no API calls, calendar unchanged
- Classification colors use native currency; display converts via exchange rates
- Anomaly thresholds are independent of calendar color thresholds
- BullMQ introduced only for pricing queue; existing `node-cron` crons untouched
- Rolling average uses ±4 weeks of same-weekday data (up to 8 data points); handles edges where fewer points exist gracefully (use whatever is available)
- 29-day search windows: checkIn=day N, checkOut=day N+29 (29 nights per batch)
- ~13 batches cover 365 days (12 × 29 = 348 + 1 final batch of 17)
