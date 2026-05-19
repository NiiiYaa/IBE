# Test Bookings Feature — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

## Overview

A new "Test Bookings" admin page under Configuration that lets operators run real HyperGuest bookings against a selected property using pre-made or custom search combinations. The purpose is QA/verification: confirm that search and booking work end-to-end for a property, then cancel the test bookings. Results export to Excel.

## Scope & Constraints

- **Property-level only.** If no property is selected, show "Select a property to use Test Bookings" — no chain-level mode.
- **Real HG bookings.** Bookings are genuine HyperGuest reservations, not sandboxed. Users are expected to cancel them after verifying.
- **Fixed test guest details** injected server-side on every booking:
  - Name: `Test Guest`
  - Email: `test@hyperguest.com`
  - Phone: `+10000000000`
- **Client-side state only.** No DB persistence. State is lost on page refresh — acceptable for a testing tool.
- **Seller-only** (`sellerOnly: true` in nav).

---

## File Structure

```
apps/web/src/app/admin/config/test-bookings/page.tsx   ← single page, two tabs
apps/api/src/routes/test-bookings.route.ts              ← 3 admin endpoints
apps/api/src/services/test-bookings.service.ts          ← HG search + booking logic
packages/shared/src/types/test-bookings.ts              ← shared types
```

**Nav entry** — add to the Configuration section in `apps/web/src/app/admin/_layout-client.tsx`, after the External IBE entry:
```ts
{ href: '/admin/config/test-bookings', label: 'Test Bookings', sellerOnly: true }
```

---

## UI Structure

The page has two tabs: **Pre-made Combinations** (default) and **Custom**.

---

## Tab 1: Pre-made Combinations

### Combination Matrix

10 hardcoded combinations, each covering different edge cases:

| # | Adults | Children | Child Ages | Nationality | Check-in | Nights | Board | Cancellation | Tests |
|---|--------|----------|------------|-------------|----------|--------|-------|--------------|-------|
| 1 | 1 | 0 | — | GR | today+1 | 2 | RO | NR | last-minute, solo |
| 2 | 2 | 0 | — | US | today+7 | 5 | BB | R | standard couple |
| 3 | 1 | 1 | 11 | IN | today+30 | 3 | RO | R | 1 child, non-Western |
| 4 | 2 | 2 | 4, 9 | EG | today+90 | 9 | HB | NR | 2 children, long stay |
| 5 | 3 | 0 | — | UK | today+290 | 11 | BB | R | far future, 3 adults |
| 6 | 2 | 0 | — | DE | today+14 | 7 | HB | R | European, week stay |
| 7 | 4 | 0 | — | US | today+21 | 3 | BB | NR | group of 4 |
| 8 | 1 | 2 | 6, 14 | UK | today+45 | 7 | HB | R | solo parent + 2 children |
| 9 | 2 | 1 | 2 | FR | today+60 | 5 | RO | NR | toddler age |
| 10 | 2 | 0 | — | JP | today+180 | 2 | BB | R | far future, Asia |

Board: `RO` = Room Only, `BB` = Bed & Breakfast, `HB` = Half Board  
Cancellation: `R` = Refundable, `NR` = Non-refundable

These values (Board, Cancellation policy) are **metadata only** — they are not used as search filters. All returned rates are shown regardless of board or cancellation policy.

### Interaction Flow

1. **Select** — checkbox per row + "Select all" header checkbox.
2. **Run searches** button — fires parallel `POST /admin/test-bookings/search` requests for each selected combination. Each row shows a spinner while searching.
3. **Status column** transitions: `pending` → `searching…` → `found N rates` / `no results` / `error: <message>`.
4. **Rate expansion** — on success, each row expands below to reveal a rate sub-table:
   - Columns: Select | Room name | Board | Cancellation | Price/night | Total | Currency
   - Each rate has its own checkbox.
5. **Book selected** button (appears once ≥1 rate checkbox is checked) — calls `POST /admin/test-bookings/book` for each checked rate. Shows `booking…` inline per rate.
6. **Booking result** per rate: replaces the checkbox with the booking reference + a **Cancel** button.
7. **Cancel** — calls `POST /admin/test-bookings/:bookingId/cancel`. On success, shows `cancelled` in place of the reference + Cancel button.
8. **Export to Excel** button — appears once any booking has been made. Downloads `.xlsx` of all booked rates.

Searches from multiple selected combinations fire in parallel (not SSE — individual `fetch` per combination, results update React state as each resolves).

---

## Tab 2: Custom

Mirrors the Custom mode from the External IBE test section in structure and components, but runs a real HG search and enables real booking.

### Controls

- **Date picker** — reuses `CalendarDropdown` (check-in / check-out)
- **Guests picker** — reuses `GuestsDropdown` (single room only)
- **Nationality** — dropdown with common country codes: GR, US, UK, DE, FR, IN, EG, JP, AU, IT, ES (more can be added)
- **Run search** button

### After Search

- Rate table: Room name | Board | Cancellation policy | Price/night | Total | Currency | Select checkbox
- **Book selected** button once ≥1 rate checked → same booking + cancel flow as the Pre-made tab
- **Export to Excel** button once any booking exists

Custom tab state is fully independent from Pre-made tab state. Switching tabs does not reset either.

---

## API Layer

All endpoints require admin authentication. `propertyId` must belong to the authenticated admin's org (or any org for super admins).

### `POST /api/v1/admin/test-bookings/search`

```ts
// Request
{
  propertyId: number
  checkIn: string        // ISO date 'YYYY-MM-DD'
  checkOut: string       // ISO date 'YYYY-MM-DD'
  adults: number
  childrenAges: number[] // empty array if no children
}

// Response
{
  rates: RateResult[]
}

// RateResult
{
  rateKey: string          // opaque key passed back to /book
  roomName: string
  board: string            // 'RO' | 'BB' | 'HB' | 'FB' | 'AI'
  cancellationPolicy: 'R' | 'NR'
  pricePerNight: number
  totalPrice: number
  currency: string
}
```

Returns an empty `rates` array (not an error) when no availability is found.

### `POST /api/v1/admin/test-bookings/book`

```ts
// Request
{
  propertyId: number
  rateKey: string
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}

// Response
{
  bookingId: number
  bookingReference: string
}
```

Test guest details (`Test Guest`, `test@hyperguest.com`, `+10000000000`) are injected server-side. The frontend never sends guest details for this endpoint.

### `POST /api/v1/admin/test-bookings/:bookingId/cancel`

```ts
// Response
{ ok: boolean }
```

Delegates to the same HG cancel flow used elsewhere in the codebase.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No property selected | Page shows "Select a property to use Test Bookings" — no tabs rendered |
| Search fails for a combination | Row shows `error: <message>`; other combinations continue unaffected |
| Search returns no results | Row shows `no results`; no rate sub-table shown |
| Book fails | Error shown inline next to that rate; rate checkbox stays checked for retry |
| Cancel fails | Error shown inline next to the booking reference; reference remains visible for retry |

---

## Excel Export

One row per **booked rate** (combinations with no bookings are omitted). Columns:

| Combination # | Adults | Children | Child Ages | Nationality | Check-in | Check-out | Nights | Board | Cancellation | Room Name | Price/Night | Total | Currency | Booking Reference | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

**Status** values: `booked` / `cancelled` / `booking failed`

For the Custom tab, Combination # is omitted; Nationality, Board, and Cancellation columns reflect what was entered/returned.

Export is client-side using the `xlsx` library already imported in the project.

---

## Components Reused

| Component | Source |
|---|---|
| `CalendarDropdown` | `@/components/search/CalendarDropdown` |
| `GuestsDropdown` | `@/components/search/GuestsDropdown` |
| Tab UI pattern | Copied from `TestSection` in `external-ibe/page.tsx` |
| Toggle | Local copy from `external-ibe/page.tsx` |
| `xlsx` export | Already a dependency in `apps/web` |

---

## Out of Scope

- Chain-level / multi-property batch runs
- Saved/persisted test sessions
- Guest detail customisation per run
- Filtering rates by board or cancellation policy
