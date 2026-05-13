# Booking Page: Session Countdown & Price Change Detection

**Date:** 2026-05-13
**Status:** Approved

## Overview

Two UX improvements to the booking page that give the guest accurate, timely information about their session and pricing before they commit to a booking.

1. **Session countdown** — a 30-minute timer shown inline with the page title, with an expiry banner offering to refresh prices or go back to search.
2. **Price change detection** — if the live HyperGuest price differs from what the guest originally selected, a banner appears immediately on page load showing the old and new price with clear accept/reject actions.

---

## 1. Session Countdown

### Behaviour

- A 30-minute countdown starts when the guest lands on the booking page.
- It is displayed to the right of the `"Complete your booking"` heading, with an animated hourglass icon.
- The start time is persisted in `sessionStorage` keyed by `searchId` so a page refresh does not restart the timer.
- When time expires, the countdown next to the heading is hidden and a `SessionExpiredBanner` appears between the back-link and the heading, with two actions:
  - **"Check prices again"** — calls `refetch()` on `useSearch`, resets the countdown to 30 minutes.
  - **"Back to search"** — navigates to `/search?<current params>`.

### Countdown display

- Format: `MM:SS` (e.g. `28:43`).
- Colour: neutral/muted until ≤ 5 minutes remaining, then amber, then red at ≤ 1 minute.
- Hourglass icon: SVG with a CSS flip animation triggered at the halfway mark (15 min).

### Hook: `useBookingCountdown`

```
useBookingCountdown(durationMs: number, storageKey: string)
  → { timeLeftMs, isExpired, reset }
```

- On mount: reads `sessionStorage[storageKey]`. If found and not expired, resumes from stored start time. Otherwise writes current timestamp and starts fresh.
- `reset()`: writes a new start timestamp to `sessionStorage` and resets state.
- Cleans up its `setInterval` on unmount.

### Component: `SessionExpiredBanner`

Rendered in `_content.tsx` between the back-link and the heading when `isExpired === true`.

---

## 2. Price Change Detection

### How the original price is passed

`handleRateSelect` and `handleCartBook` in `search/_content.tsx` add price params to the booking URL:

- Single-room: `&price=<amount>&priceCurrency=<currency>`
- Multi-room: `&rooms[i][price]=<amount>` (currency is shared, use existing `&currency=`)

The amounts come from `rate.prices.sell.amount` / `rate.prices.sell.currency` at the moment the guest clicks "Book".

### Detection on the booking page

`_content.tsx` reads the URL price param(s) after the fresh `useSearch` result is available. For each selected room it compares:

```
urlPrice  !== freshRate.prices.sell.amount
```

If any room has a mismatch, a `PriceChangeBanner` is shown.

### Component: `PriceChangeBanner`

- Shown immediately when a price mismatch is detected (no user action needed to trigger it).
- Displays: old price → new price. For multi-room, shows each room that changed individually.
- Two actions:
  - **"Accept new price"** — dismisses the banner; form proceeds normally at the new price.
  - **"Back to search"** — navigates to `/search?<current params>`.
- The form is fully usable while the banner is visible (non-blocking).

### Tamper-proof note

A guest could edit the URL price param to manufacture a fake "price change". This is harmless: the `expectedAmount` submitted with the booking is always taken from the fresh `useSearch` result, never from the URL. The URL price only affects the banner display.

---

## 3. Banner Placement & Stacking

Both banners sit between the back-link and the `"Complete your booking"` h1. If both appear simultaneously (expired session + price change on the same page load), they stack vertically with the price change banner on top (it is more immediately actionable).

---

## 4. Files Touched

| File | Change |
|------|--------|
| `apps/web/src/hooks/use-booking-countdown.ts` | New hook |
| `apps/web/src/components/booking/SessionExpiredBanner.tsx` | New component |
| `apps/web/src/components/booking/PriceChangeBanner.tsx` | New component |
| `apps/web/src/app/(main)/booking/_content.tsx` | Wire countdown + price comparison |
| `apps/web/src/app/(main)/search/_content.tsx` | Add price params to booking URL |

---

## 5. Out of Scope

- Server-side enforcement of the 30-minute window (SearchSession TTL remains unused).
- Persisting countdown across devices or browser tabs (sessionStorage is tab-local by design).
- Currency conversion differences between the original and fresh price (same currency is guaranteed because currency is a search param and does not change between search and booking pages).
