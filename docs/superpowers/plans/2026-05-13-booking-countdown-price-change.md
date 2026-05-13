# Booking Page: Session Countdown & Price Change Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 30-minute session countdown to the booking page header and detect/surface price changes between what the guest originally selected and the live HyperGuest price.

**Architecture:** A new `useBookingCountdown` hook tracks elapsed time via `sessionStorage` (survives refresh). Two new banner components (`SessionExpiredBanner`, `PriceChangeBanner`) handle the two UX states. The search page writes the original price into the booking URL; the booking page compares that to the fresh `useSearch` result and shows the banner on mismatch.

**Tech Stack:** React 18, Next.js 14 App Router, Vitest + jsdom + @testing-library/react, Tailwind CSS (CSS variables for theming)

**Spec:** `docs/superpowers/specs/2026-05-13-booking-countdown-price-change-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/hooks/use-booking-countdown.ts` | Create | Track 30-min countdown, persist start time in sessionStorage, expose `timeLeftMs / isExpired / reset` |
| `apps/web/src/hooks/__tests__/use-booking-countdown.test.ts` | Create | Unit tests for the hook |
| `apps/web/src/components/booking/SessionExpiredBanner.tsx` | Create | Expiry banner with "Check prices again" + "Back to search" |
| `apps/web/src/components/booking/PriceChangeBanner.tsx` | Create | Price-change banner showing old → new price with "Accept" + "Back to search" |
| `apps/web/src/app/(main)/search/_content.tsx` | Modify | Add `price` / `priceCurrency` (single-room) and `rooms[i][price]` (multi-room) to booking URL |
| `apps/web/src/app/(main)/booking/_content.tsx` | Modify | Wire countdown + price comparison; render banners and inline countdown display |

---

## Task 1: `useBookingCountdown` hook

**Files:**
- Create: `apps/web/src/hooks/use-booking-countdown.ts`
- Create: `apps/web/src/hooks/__tests__/use-booking-countdown.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/hooks/__tests__/use-booking-countdown.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookingCountdown } from '../use-booking-countdown'

const DURATION_MS = 30 * 60 * 1000
const KEY = 'test-countdown'

beforeEach(() => {
  sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBookingCountdown', () => {
  it('starts with timeLeftMs close to 30 minutes', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.timeLeftMs).toBeGreaterThan(DURATION_MS - 2000)
    expect(result.current.timeLeftMs).toBeLessThanOrEqual(DURATION_MS)
  })

  it('is not expired initially', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.isExpired).toBe(false)
  })

  it('decrements timeLeftMs over time', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.timeLeftMs).toBeLessThanOrEqual(DURATION_MS - 60_000 + 1000)
  })

  it('isExpired becomes true after 30 minutes', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    act(() => { vi.advanceTimersByTime(DURATION_MS + 1000) })
    expect(result.current.isExpired).toBe(true)
    expect(result.current.timeLeftMs).toBe(0)
  })

  it('resumes from sessionStorage if a valid start time is stored', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    sessionStorage.setItem(KEY, String(fiveMinutesAgo))
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.timeLeftMs).toBeLessThanOrEqual(25 * 60 * 1000 + 1000)
    expect(result.current.timeLeftMs).toBeGreaterThan(24 * 60 * 1000)
  })

  it('starts fresh when stored start time is expired', () => {
    const fortyMinutesAgo = Date.now() - 40 * 60 * 1000
    sessionStorage.setItem(KEY, String(fortyMinutesAgo))
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.timeLeftMs).toBeGreaterThan(DURATION_MS - 2000)
  })

  it('reset() restores timeLeftMs to full duration', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })
    expect(result.current.timeLeftMs).toBeLessThan(DURATION_MS)
    act(() => { result.current.reset() })
    expect(result.current.timeLeftMs).toBeGreaterThan(DURATION_MS - 2000)
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd apps/web && npx vitest run src/hooks/__tests__/use-booking-countdown.test.ts
```
Expected: fails with "Cannot find module '../use-booking-countdown'"

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/hooks/use-booking-countdown.ts
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const DURATION_MS = 30 * 60 * 1000

function readOrInitStartTime(storageKey: string): number {
  try {
    const stored = sessionStorage.getItem(storageKey)
    if (stored) {
      const t = Number(stored)
      if (!isNaN(t) && Date.now() - t < DURATION_MS) return t
    }
  } catch { /* sessionStorage unavailable */ }
  const now = Date.now()
  try { sessionStorage.setItem(storageKey, String(now)) } catch {}
  return now
}

export function useBookingCountdown(storageKey: string) {
  const [startTime, setStartTime] = useState<number>(() => readOrInitStartTime(storageKey))
  const [now, setNow] = useState<number>(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const reset = useCallback(() => {
    const t = Date.now()
    try { sessionStorage.setItem(storageKey, String(t)) } catch {}
    setStartTime(t)
    setNow(t)
  }, [storageKey])

  const timeLeftMs = Math.max(0, DURATION_MS - (now - startTime))
  const isExpired = timeLeftMs === 0

  return { timeLeftMs, isExpired, reset }
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd apps/web && npx vitest run src/hooks/__tests__/use-booking-countdown.test.ts
```
Expected: all 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-booking-countdown.ts apps/web/src/hooks/__tests__/use-booking-countdown.test.ts
git commit -m "feat: add useBookingCountdown hook with sessionStorage persistence"
```

---

## Task 2: `SessionExpiredBanner` component

**Files:**
- Create: `apps/web/src/components/booking/SessionExpiredBanner.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/components/booking/__tests__/SessionExpiredBanner.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionExpiredBanner } from '../SessionExpiredBanner'

describe('SessionExpiredBanner', () => {
  it('renders both action buttons', () => {
    render(<SessionExpiredBanner onRefresh={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /check prices again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to search/i })).toBeInTheDocument()
  })

  it('calls onRefresh when "Check prices again" is clicked', async () => {
    const onRefresh = vi.fn()
    render(<SessionExpiredBanner onRefresh={onRefresh} onBack={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /check prices again/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('calls onBack when "Back to search" is clicked', async () => {
    const onBack = vi.fn()
    render(<SessionExpiredBanner onRefresh={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /back to search/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd apps/web && npx vitest run src/components/booking/__tests__/SessionExpiredBanner.test.tsx
```
Expected: fails with "Cannot find module '../SessionExpiredBanner'"

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/src/components/booking/SessionExpiredBanner.tsx
interface SessionExpiredBannerProps {
  onRefresh: () => void
  onBack: () => void
}

export function SessionExpiredBanner({ onRefresh, onBack }: SessionExpiredBannerProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">Your session has expired</p>
          <p className="text-xs text-amber-700">Prices may have changed. Check for the latest availability before booking.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          Check prices again
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
        >
          Back to search
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd apps/web && npx vitest run src/components/booking/__tests__/SessionExpiredBanner.test.tsx
```
Expected: all 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/booking/SessionExpiredBanner.tsx apps/web/src/components/booking/__tests__/SessionExpiredBanner.test.tsx
git commit -m "feat: add SessionExpiredBanner component"
```

---

## Task 3: `PriceChangeBanner` component

**Files:**
- Create: `apps/web/src/components/booking/PriceChangeBanner.tsx`

The banner accepts a list of price changes (one per room) and shows each changed room's old → new price. `formatCurrency` from `@ibe/shared` handles locale-aware formatting.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/components/booking/__tests__/PriceChangeBanner.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriceChangeBanner } from '../PriceChangeBanner'

const changes = [
  { roomName: 'Deluxe Room', oldAmount: 200, newAmount: 220, currency: 'USD' },
]

describe('PriceChangeBanner', () => {
  it('renders old and new prices', () => {
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText(/200/)).toBeInTheDocument()
    expect(screen.getByText(/220/)).toBeInTheDocument()
  })

  it('renders the room name', () => {
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText(/Deluxe Room/i)).toBeInTheDocument()
  })

  it('calls onAccept when "Accept new price" is clicked', async () => {
    const onAccept = vi.fn()
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={onAccept} onBack={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /accept new price/i }))
    expect(onAccept).toHaveBeenCalledOnce()
  })

  it('calls onBack when "Back to search" is clicked', async () => {
    const onBack = vi.fn()
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /back to search/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('renders multiple changed rooms', () => {
    const multi = [
      { roomName: 'Room A', oldAmount: 100, newAmount: 110, currency: 'USD' },
      { roomName: 'Room B', oldAmount: 150, newAmount: 140, currency: 'USD' },
    ]
    render(<PriceChangeBanner changes={multi} locale="en-US" onAccept={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText(/Room A/i)).toBeInTheDocument()
    expect(screen.getByText(/Room B/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd apps/web && npx vitest run src/components/booking/__tests__/PriceChangeBanner.test.tsx
```
Expected: fails with "Cannot find module '../PriceChangeBanner'"

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/src/components/booking/PriceChangeBanner.tsx
import { formatCurrency } from '@ibe/shared'

export interface PriceChange {
  roomName: string
  oldAmount: number
  newAmount: number
  currency: string
}

interface PriceChangeBannerProps {
  changes: PriceChange[]
  locale: string
  onAccept: () => void
  onBack: () => void
}

export function PriceChangeBanner({ changes, locale, onAccept, onBack }: PriceChangeBannerProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-blue-800">The price has been updated</p>
          {changes.map((c, i) => (
            <p key={i} className="text-xs text-blue-700">
              {changes.length > 1 && <span className="font-medium">{c.roomName}: </span>}
              <span className="line-through opacity-60">{formatCurrency(c.oldAmount, c.currency, locale)}</span>
              {' → '}
              <span className="font-semibold">{formatCurrency(c.newAmount, c.currency, locale)}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Accept new price
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-blue-400 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
        >
          Back to search
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd apps/web && npx vitest run src/components/booking/__tests__/PriceChangeBanner.test.tsx
```
Expected: all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/booking/PriceChangeBanner.tsx apps/web/src/components/booking/__tests__/PriceChangeBanner.test.tsx
git commit -m "feat: add PriceChangeBanner component"
```

---

## Task 4: Pass original price in booking URL from search page

**Files:**
- Modify: `apps/web/src/app/(main)/search/_content.tsx` (lines ~113–131)

- [ ] **Step 1: Update `handleRateSelect` to include price in URL**

Find the `handleRateSelect` function and replace the single-room URL construction block:

```ts
// Before (single-room path inside handleRateSelect):
const qs = encodeSearchParams(searchParams)
qs.set('roomId', String(room.roomId))
qs.set('ratePlanId', String(rate.ratePlanId))
qs.set('searchId', data.searchId)
router.push(`/booking?${qs.toString()}`)

// After:
const qs = encodeSearchParams(searchParams)
qs.set('roomId', String(room.roomId))
qs.set('ratePlanId', String(rate.ratePlanId))
qs.set('searchId', data.searchId)
qs.set('price', String(rate.prices.sell.amount))
qs.set('priceCurrency', rate.prices.sell.currency)
router.push(`/booking?${qs.toString()}`)
```

- [ ] **Step 2: Update `handleCartBook` to include per-room price in URL**

Find `handleCartBook` and replace its `cartItems.forEach` block:

```ts
// Before:
cartItems.forEach((item, i) => {
  qs.set(`rooms[${i}][roomId]`, String(item.room.roomId))
  qs.set(`rooms[${i}][ratePlanId]`, String(item.rate.ratePlanId))
})

// After:
cartItems.forEach((item, i) => {
  qs.set(`rooms[${i}][roomId]`, String(item.room.roomId))
  qs.set(`rooms[${i}][ratePlanId]`, String(item.rate.ratePlanId))
  qs.set(`rooms[${i}][price]`, String(item.rate.prices.sell.amount))
})
// currency is already in qs via encodeSearchParams (the shared currency param)
```

- [ ] **Step 3: Run the full web test suite to confirm no regressions**

```bash
cd apps/web && npx vitest run
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(main\)/search/_content.tsx
git commit -m "feat: pass original room price in booking URL for price-change detection"
```

---

## Task 5: Wire countdown + price detection into the booking page

**Files:**
- Modify: `apps/web/src/app/(main)/booking/_content.tsx`

This task adds the countdown hook, reads URL price params, detects mismatches, and renders both banners + the inline countdown display.

- [ ] **Step 1: Add imports and hook call at the top of `BookingContent`**

Add imports after the existing imports block. Note: `useRouter` should be added to the existing `next/navigation` import line alongside `useSearchParams`.

```ts
import { useBookingCountdown } from '@/hooks/use-booking-countdown'
import { SessionExpiredBanner } from '@/components/booking/SessionExpiredBanner'
import { PriceChangeBanner, type PriceChange } from '@/components/booking/PriceChangeBanner'
import { useState } from 'react'
// useRouter: add to the existing "import { useSearchParams } from 'next/navigation'" line
```

- [ ] **Step 2: Add hook calls and price-reading logic inside `BookingContent`**

Add these after the existing `const campaignId` line:

```ts
const router = useRouter()
const { data: searchData, isLoading, refetch } = useSearch(searchParams)

// Countdown — keyed by searchId so each search session has its own timer
const { timeLeftMs, isExpired, reset } = useBookingCountdown(`booking-countdown-${searchId}`)
const [priceChangesDismissed, setPriceChangesDismissed] = useState(false)
```

Note: the existing `const { data: searchData, isLoading } = useSearch(searchParams)` line must be replaced with the one above (adds `refetch`).

- [ ] **Step 3: Add price-change detection after `selectedRooms` is resolved**

Add after the `if (selectedRooms.length === 0)` block, just before the `return (` of the happy path:

```ts
// Detect price changes: compare URL price params to fresh search prices
const urlSinglePrice = Number(rawParams.get('price')) || null
const priceChanges: PriceChange[] = []

if (!priceChangesDismissed && selectedRooms.length > 0) {
  if (isMulti) {
    selectedRooms.forEach(({ room, rate }, i) => {
      const urlPrice = Number(rawParams.get(`rooms[${i}][price]`)) || null
      if (urlPrice !== null && Math.abs(urlPrice - rate.prices.sell.amount) > 0.009) {
        priceChanges.push({
          roomName: room.roomName,
          oldAmount: urlPrice,
          newAmount: rate.prices.sell.amount,
          currency: rate.prices.sell.currency,
        })
      }
    })
  } else if (urlSinglePrice !== null) {
    const { room, rate } = selectedRooms[0]!
    if (Math.abs(urlSinglePrice - rate.prices.sell.amount) > 0.009) {
      priceChanges.push({
        roomName: room.roomName,
        oldAmount: urlSinglePrice,
        newAmount: rate.prices.sell.amount,
        currency: rate.prices.sell.currency,
      })
    }
  }
}
```

The `> 0.009` threshold avoids false positives from floating-point rounding.

- [ ] **Step 4: Add helper functions for banner actions**

Add before the `return (`:

```ts
function handleRefresh() {
  void refetch()
  reset()
}

function handleBackToSearch() {
  router.push(`/search?${rawParams.toString()}`)
}
```

- [ ] **Step 5: Update the heading area and render banners**

Replace:
```tsx
<h1 className="mb-6 text-xl font-semibold text-[var(--color-text)]">{t('completeYourBooking')}</h1>
```

With:
```tsx
{priceChanges.length > 0 && (
  <PriceChangeBanner
    changes={priceChanges}
    locale={locale}
    onAccept={() => setPriceChangesDismissed(true)}
    onBack={handleBackToSearch}
  />
)}
{isExpired && (
  <SessionExpiredBanner onRefresh={handleRefresh} onBack={handleBackToSearch} />
)}

<div className="mb-6 flex items-center justify-between gap-4">
  <h1 className="text-xl font-semibold text-[var(--color-text)]">{t('completeYourBooking')}</h1>
  {!isExpired && <CountdownDisplay timeLeftMs={timeLeftMs} />}
</div>
```

- [ ] **Step 6: Add the `CountdownDisplay` local component**

Add this at the bottom of `_content.tsx`, outside `BookingContent`:

```tsx
function CountdownDisplay({ timeLeftMs }: { timeLeftMs: number }) {
  const minutes = Math.floor(timeLeftMs / 60_000)
  const seconds = Math.floor((timeLeftMs % 60_000) / 1000)
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  const colorClass =
    timeLeftMs <= 60_000
      ? 'text-red-600'
      : timeLeftMs <= 5 * 60_000
      ? 'text-amber-600'
      : 'text-[var(--color-text-muted)]'

  const isSecondHalf = timeLeftMs <= 15 * 60_000

  return (
    <div className={`flex shrink-0 items-center gap-1.5 text-sm font-medium tabular-nums ${colorClass}`}>
      <svg
        className={`h-4 w-4 transition-transform duration-700 ${isSecondHalf ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4" />
      </svg>
      {mm}:{ss}
    </div>
  )
}
```

- [ ] **Step 7: Run the full web test suite**

```bash
cd apps/web && npx vitest run
```
Expected: all tests pass

- [ ] **Step 8: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/\(main\)/booking/_content.tsx
git commit -m "feat: add session countdown and price-change detection to booking page"
```

---

## Task 6: Run full test suite and verify

- [ ] **Step 1: Run all web tests**

```bash
cd apps/web && npx vitest run
```
Expected: all tests pass

- [ ] **Step 2: Run shared package tests**

```bash
cd packages/shared && npx vitest run
```
Expected: all tests pass

- [ ] **Step 3: Final TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors
