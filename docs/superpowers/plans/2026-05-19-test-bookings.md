# Test Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Test Bookings" page under Configuration that lets admins run real HyperGuest search + book + cancel cycles against a selected property, with pre-made combinations and a custom mode, exporting results to Excel.

**Architecture:** Three new admin API endpoints (search, book, cancel) backed by a service that calls the HG adapters directly. Client-side React state manages the full session lifecycle. No DB schema changes needed — bookings are persisted using the existing `Booking` model with `isTest: true`.

**Tech Stack:** Fastify (API routes), Prisma (booking persistence), HG adapters (search/booking), React + TanStack Query (frontend), `xlsx` (Excel export, already installed in `apps/web`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/types/test-bookings.ts` | Create | Shared request/response types |
| `packages/shared/src/index.ts` | Modify | Export new types |
| `apps/api/src/services/test-bookings.service.ts` | Create | Search, book, cancel logic |
| `apps/api/src/services/__tests__/test-bookings.service.test.ts` | Create | Unit tests for service |
| `apps/api/src/routes/test-bookings.route.ts` | Create | 3 admin endpoints |
| `apps/api/src/app.ts` | Modify | Register new route |
| `apps/web/src/lib/api-client.ts` | Modify | 3 new API client methods |
| `apps/web/src/app/admin/_layout-client.tsx` | Modify | Add nav entry under Configuration |
| `apps/web/src/app/admin/config/test-bookings/page.tsx` | Create | Full admin page (tabs, booking, export) |

---

## Task 1: Shared Types

**Files:**
- Create: `packages/shared/src/types/test-bookings.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// packages/shared/src/types/test-bookings.ts

export interface TestBookingSearchRequest {
  propertyId: number
  checkIn: string       // YYYY-MM-DD
  checkOut: string      // YYYY-MM-DD
  adults: number
  childrenAges: number[] // empty array if no children
}

export interface TestBookingRateResult {
  rateKey: string             // opaque base64-encoded booking params
  roomName: string
  board: string               // 'RO' | 'BB' | 'HB' | 'FB' | 'AI'
  cancellationPolicy: 'R' | 'NR'
  pricePerNight: number
  totalPrice: number
  currency: string
}

export interface TestBookingSearchResponse {
  rates: TestBookingRateResult[]
}

export interface TestBookingBookRequest {
  propertyId: number
  rateKey: string
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}

export interface TestBookingBookResponse {
  bookingId: number
  bookingReference: string
}

export interface TestBookingCancelResponse {
  ok: boolean
}
```

- [ ] **Step 2: Export from shared index**

Open `packages/shared/src/index.ts` and add after the `external-ibe` export line:

```typescript
export type * from './types/test-bookings.js'
```

- [ ] **Step 3: Build shared to verify no type errors**

```bash
cd packages/shared && npm run build
```

Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/test-bookings.ts packages/shared/src/index.ts
git commit -m "feat: add TestBooking shared types"
```

---

## Task 2: Service + Unit Tests

**Files:**
- Create: `apps/api/src/services/test-bookings.service.ts`
- Create: `apps/api/src/services/__tests__/test-bookings.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/services/__tests__/test-bookings.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))

vi.mock('../../adapters/hyperguest/booking.js', () => ({
  createBooking: vi.fn(),
  cancelBooking: vi.fn(),
}))

vi.mock('../../db/client.js', () => ({
  prisma: {
    booking: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { createBooking, cancelBooking } from '../../adapters/hyperguest/booking.js'
import { prisma } from '../../db/client.js'
import {
  encodeRateKey,
  decodeRateKey,
  searchForTestBooking,
  createTestBooking,
  cancelTestBooking,
} from '../test-bookings.service.js'

const mSearch = searchAvailability as ReturnType<typeof vi.fn>
const mCreate = createBooking as ReturnType<typeof vi.fn>
const mCancel = cancelBooking as ReturnType<typeof vi.fn>
const mPrisma = prisma as any

beforeEach(() => { vi.clearAllMocks() })

// ── encodeRateKey / decodeRateKey ─────────────────────────────────────────────

describe('encodeRateKey / decodeRateKey', () => {
  it('round-trips all fields', () => {
    const payload = { roomId: 42, ratePlanCode: 'RP001', sellAmount: 199.5, sellCurrency: 'USD' }
    expect(decodeRateKey(encodeRateKey(payload))).toEqual(payload)
  })
})

// ── searchForTestBooking ──────────────────────────────────────────────────────

describe('searchForTestBooking', () => {
  it('returns empty array when HG has no results', async () => {
    mSearch.mockResolvedValue({ results: [] })
    const rates = await searchForTestBooking({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-03', adults: 2, childrenAges: [],
    })
    expect(rates).toEqual([])
  })

  it('maps each rate plan to a TestBookingRateResult', async () => {
    mSearch.mockResolvedValue({
      results: [{
        propertyId: 1,
        propertyInfo: { name: 'Hotel A' },
        remarks: [],
        rooms: [{
          roomId: 10,
          roomName: 'Deluxe Room',
          roomTypeCode: 'DLX',
          numberOfAvailableRooms: 3,
          settings: { maxOccupancy: 2, maxAdultsNumber: 2, maxChildrenNumber: 1, maxInfantsNumber: 0, numberOfBedrooms: 1, roomSize: 30, numberOfBeds: 1, beddingConfigurations: [] },
          searchedPax: { adults: 2, children: [] },
          ratePlans: [{
            ratePlanCode: 'RP001',
            ratePlanId: 100,
            ratePlanName: 'Standard BB',
            ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: 'RP001', isPromotion: false, isPackageRate: false, isPrivate: false },
            board: 'BB',
            remarks: [],
            cancellationPolicies: [],
            payment: { charge: 'agent', chargeType: 'pre', chargeAmount: { price: 0, currency: 'USD' } },
            prices: {
              net: { price: 150, currency: 'USD', taxes: [] },
              sell: { price: 200, currency: 'USD', taxes: [] },
              bar: { price: 200, currency: 'USD' },
              fees: [],
            },
            nightlyBreakdown: [],
            isImmediate: true,
          }],
        }],
      }],
    })

    const rates = await searchForTestBooking({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-03', adults: 2, childrenAges: [],
    })

    expect(rates).toHaveLength(1)
    expect(rates[0]).toMatchObject({
      roomName: 'Deluxe Room',
      board: 'BB',
      cancellationPolicy: 'R',
      pricePerNight: 100,
      totalPrice: 200,
      currency: 'USD',
    })
    expect(decodeRateKey(rates[0]!.rateKey)).toEqual({
      roomId: 10,
      ratePlanCode: 'RP001',
      sellAmount: 200,
      sellCurrency: 'USD',
    })
  })

  it('sets cancellationPolicy NR when a policy has amount > 0', async () => {
    mSearch.mockResolvedValue({
      results: [{
        propertyId: 1,
        propertyInfo: { name: 'H' },
        remarks: [],
        rooms: [{
          roomId: 1, roomName: 'R', roomTypeCode: 'S', numberOfAvailableRooms: 1,
          settings: { maxOccupancy: 2, maxAdultsNumber: 2, maxChildrenNumber: 0, maxInfantsNumber: 0, numberOfBedrooms: 1, roomSize: 20, numberOfBeds: 1, beddingConfigurations: [] },
          searchedPax: { adults: 1, children: [] },
          ratePlans: [{
            ratePlanCode: 'NR1', ratePlanId: 1, ratePlanName: 'NR Rate',
            ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: 'NR1', isPromotion: false, isPackageRate: false, isPrivate: false },
            board: 'RO', remarks: [],
            cancellationPolicies: [{ daysBefore: 3, penaltyType: 'nights', amount: 1, timeSetting: { timeFromCheckIn: 3, timeFromCheckInType: 'days' } }],
            payment: { charge: 'agent', chargeType: 'pre', chargeAmount: { price: 0, currency: 'USD' } },
            prices: { net: { price: 80, currency: 'USD', taxes: [] }, sell: { price: 100, currency: 'USD', taxes: [] }, bar: { price: 100, currency: 'USD' }, fees: [] },
            nightlyBreakdown: [], isImmediate: true,
          }],
        }],
      }],
    })
    const rates = await searchForTestBooking({ propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-02', adults: 1, childrenAges: [] })
    expect(rates[0]!.cancellationPolicy).toBe('NR')
  })
})

// ── createTestBooking ─────────────────────────────────────────────────────────

describe('createTestBooking', () => {
  it('calls createBooking with isTest true and fixed guest details', async () => {
    const rateKey = encodeRateKey({ roomId: 10, ratePlanCode: 'RP001', sellAmount: 200, sellCurrency: 'USD' })

    mCreate.mockResolvedValue({
      content: {
        bookingId: 999,
        status: 'confirmed',
        dates: { from: '2026-06-01', to: '2026-06-03' },
        meta: [],
        payment: { type: 'external', chargeAmount: { price: 200, currency: 'USD' } },
        prices: {},
        nightlyBreakdown: [],
        rooms: [{ itemId: 1, roomId: 10, ratePlanId: 100, roomCode: 'DLX', rateCode: 'RP001', status: 'confirmed', board: 'BB', cancellationPolicy: [], guests: [], specialRequests: [], remarks: [], reference: {}, propertyId: 1, prices: {}, payment: { type: 'external', chargeAmount: { price: 200, currency: 'USD' } }, nightlyBreakdown: [], financialModel: { keys: [], type: '' } }],
        reference: { agency: 'AGY001' },
        leadGuest: { guestId: 1, age: 36, title: 'MR', name: { first: 'Test', last: 'Guest' }, birthDate: '1990-01-01', contact: { address: 'N/A', city: 'N/A', country: 'N/A', email: 'test@hyperguest.com', phone: '+10000000000', state: 'N/A', zip: 'N/A' } },
        transactions: [],
        propertyId: 1,
      },
    })

    mPrisma.booking.create.mockResolvedValue({ id: 42 })

    const result = await createTestBooking({
      propertyId: 1,
      rateKey,
      checkIn: '2026-06-01',
      checkOut: '2026-06-03',
      adults: 2,
      childrenAges: [],
    })

    expect(mCreate).toHaveBeenCalledWith(expect.objectContaining({
      isTest: true,
      leadGuest: expect.objectContaining({ firstName: 'Test', lastName: 'Guest', email: 'test@hyperguest.com' }),
      rooms: expect.arrayContaining([expect.objectContaining({ roomId: 10, rateCode: 'RP001', expectedAmount: 200, expectedCurrency: 'USD' })]),
    }))
    expect(result).toEqual({ bookingId: 42, bookingReference: '999' })
  })
})

// ── cancelTestBooking ─────────────────────────────────────────────────────────

describe('cancelTestBooking', () => {
  it('calls hgCancelBooking and updates DB status', async () => {
    mPrisma.booking.findUnique.mockResolvedValue({
      hyperGuestBookingId: 999, propertyId: 1, status: 'confirmed',
    })
    mCancel.mockResolvedValue(undefined)
    mPrisma.booking.update.mockResolvedValue({})

    const ok = await cancelTestBooking(42)

    expect(mCancel).toHaveBeenCalledWith(999, 1)
    expect(mPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'cancelled' },
    })
    expect(ok).toBe(true)
  })

  it('returns false when booking not found', async () => {
    mPrisma.booking.findUnique.mockResolvedValue(null)
    const ok = await cancelTestBooking(99)
    expect(mCancel).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  it('returns false when booking is already cancelled', async () => {
    mPrisma.booking.findUnique.mockResolvedValue({
      hyperGuestBookingId: 1, propertyId: 1, status: 'cancelled',
    })
    const ok = await cancelTestBooking(42)
    expect(mCancel).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they all fail (functions don't exist yet)**

```bash
cd apps/api && npx vitest run src/services/__tests__/test-bookings.service.test.ts
```

Expected: all tests fail with "Cannot find module" or "is not a function".

- [ ] **Step 3: Implement the service**

```typescript
// apps/api/src/services/test-bookings.service.ts
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { createBooking, cancelBooking as hgCancelBooking } from '../adapters/hyperguest/booking.js'
import { GuestTitle } from '@ibe/shared'
import type { HGCancellationPolicy, TestBookingRateResult, TestBookingBookResponse } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

interface RateKeyPayload {
  roomId: number
  ratePlanCode: string
  sellAmount: number
  sellCurrency: string
}

export function encodeRateKey(payload: RateKeyPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export function decodeRateKey(key: string): RateKeyPayload {
  return JSON.parse(Buffer.from(key, 'base64').toString('utf-8')) as RateKeyPayload
}

function isRefundable(policies: HGCancellationPolicy[]): boolean {
  if (policies.length === 0) return true
  return policies.every(p => p.amount === 0)
}

const TEST_LEAD_GUEST = {
  title: GuestTitle.Mr,
  firstName: 'Test',
  lastName: 'Guest',
  birthDate: '1990-01-01',
  email: 'test@hyperguest.com',
  phone: '+10000000000',
}

export async function searchForTestBooking(params: {
  propertyId: number
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}): Promise<TestBookingRateResult[]> {
  const nights = Math.round((Date.parse(params.checkOut) - Date.parse(params.checkIn)) / 86_400_000)

  const hgResponse = await searchAvailability({
    hotelId: params.propertyId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    rooms: [{ adults: params.adults, childAges: params.childrenAges.length > 0 ? params.childrenAges : undefined }],
  })

  const rates: TestBookingRateResult[] = []

  for (const property of hgResponse.results) {
    for (const room of property.rooms) {
      for (const rp of room.ratePlans) {
        const sellAmount = rp.prices.sell.price
        const sellCurrency = rp.prices.sell.currency
        const pricePerNight = nights > 0 ? Math.round((sellAmount / nights) * 100) / 100 : sellAmount

        rates.push({
          rateKey: encodeRateKey({ roomId: room.roomId, ratePlanCode: rp.ratePlanCode, sellAmount, sellCurrency }),
          roomName: room.roomName,
          board: rp.board,
          cancellationPolicy: isRefundable(rp.cancellationPolicies) ? 'R' : 'NR',
          pricePerNight,
          totalPrice: sellAmount,
          currency: sellCurrency,
        })
      }
    }
  }

  logger.info({ propertyId: params.propertyId, rateCount: rates.length }, '[TestBookings] Search complete')
  return rates
}

export async function createTestBooking(params: {
  propertyId: number
  rateKey: string
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}): Promise<TestBookingBookResponse> {
  const { roomId, ratePlanCode, sellAmount, sellCurrency } = decodeRateKey(params.rateKey)

  const hgResponse = await createBooking({
    propertyId: params.propertyId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    leadGuest: TEST_LEAD_GUEST,
    rooms: [{
      roomId,
      rateCode: ratePlanCode,
      expectedAmount: sellAmount,
      expectedCurrency: sellCurrency,
      guests: [],
    }],
    paymentMethod: 'external',
    isTest: true,
  })

  const booking = hgResponse.content

  const persisted = await prisma.booking.create({
    data: {
      hyperGuestBookingId: booking.bookingId,
      propertyId: booking.propertyId,
      status: booking.status,
      checkIn: new Date(booking.dates.from),
      checkOut: new Date(booking.dates.to),
      leadGuestFirstName: 'Test',
      leadGuestLastName: 'Guest',
      leadGuestEmail: 'test@hyperguest.com',
      totalAmount: booking.payment.chargeAmount.price,
      currency: booking.payment.chargeAmount.currency,
      isTest: true,
      paymentMethod: 'external',
      paymentFlow: 'pay_at_hotel_no_card',
      bookingChannel: 'b2c',
      cancellationDeadline: null,
      rawResponse: JSON.stringify(booking),
      rooms: {
        create: booking.rooms.map(r => ({
          hyperGuestItemId: r.itemId,
          roomCode: r.roomCode,
          rateCode: r.rateCode,
          board: r.board,
          status: r.status,
          propertyReference: r.reference.property ?? null,
        })),
      },
    },
  })

  logger.info({ bookingId: persisted.id, hyperGuestBookingId: booking.bookingId }, '[TestBookings] Booking created')
  return { bookingId: persisted.id, bookingReference: String(booking.bookingId) }
}

export async function cancelTestBooking(bookingId: number): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, isTest: true },
    select: { hyperGuestBookingId: true, propertyId: true, status: true },
  })

  if (!booking || booking.status === 'cancelled') return false

  await hgCancelBooking(booking.hyperGuestBookingId, booking.propertyId)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } })

  logger.info({ bookingId, hyperGuestBookingId: booking.hyperGuestBookingId }, '[TestBookings] Booking cancelled')
  return true
}
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/test-bookings.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/test-bookings.service.ts apps/api/src/services/__tests__/test-bookings.service.test.ts
git commit -m "feat: add test-bookings service with search/book/cancel"
```

---

## Task 3: API Route + Registration

**Files:**
- Create: `apps/api/src/routes/test-bookings.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/api/src/routes/test-bookings.route.ts
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import {
  searchForTestBooking,
  createTestBooking,
  cancelTestBooking,
} from '../services/test-bookings.service.js'
import type { TestBookingSearchRequest, TestBookingBookRequest } from '@ibe/shared'

async function assertPropertyAccess(
  propertyId: number,
  admin: { role: string; organizationId: number | null },
): Promise<boolean> {
  if (admin.role === 'super') return true
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  return !!prop && prop.organizationId === admin.organizationId
}

export async function testBookingsRoutes(fastify: FastifyInstance) {
  // ── POST /admin/test-bookings/search ────────────────────────────────────────
  fastify.post('/admin/test-bookings/search', async (request, reply) => {
    const body = request.body as TestBookingSearchRequest
    if (!body.propertyId || !body.checkIn || !body.checkOut || typeof body.adults !== 'number') {
      return reply.status(400).send({ error: 'propertyId, checkIn, checkOut, adults are required' })
    }

    if (!await assertPropertyAccess(body.propertyId, request.admin)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    try {
      const rates = await searchForTestBooking(body)
      return reply.send({ rates })
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Search failed' })
    }
  })

  // ── POST /admin/test-bookings/book ──────────────────────────────────────────
  fastify.post('/admin/test-bookings/book', async (request, reply) => {
    const body = request.body as TestBookingBookRequest
    if (!body.propertyId || !body.rateKey || !body.checkIn || !body.checkOut || typeof body.adults !== 'number') {
      return reply.status(400).send({ error: 'propertyId, rateKey, checkIn, checkOut, adults are required' })
    }

    if (!await assertPropertyAccess(body.propertyId, request.admin)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    try {
      const result = await createTestBooking(body)
      return reply.status(201).send(result)
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Booking failed' })
    }
  })

  // ── POST /admin/test-bookings/:bookingId/cancel ──────────────────────────────
  fastify.post('/admin/test-bookings/:bookingId/cancel', async (request, reply) => {
    const bookingId = parseInt((request.params as { bookingId: string }).bookingId, 10)
    if (isNaN(bookingId)) return reply.status(400).send({ error: 'Invalid bookingId' })

    // Verify booking is a test booking in admin's org
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId, isTest: true },
      select: { propertyId: true },
    })
    if (!booking) return reply.status(404).send({ error: 'Test booking not found' })
    if (!await assertPropertyAccess(booking.propertyId, request.admin)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    try {
      const ok = await cancelTestBooking(bookingId)
      return reply.send({ ok })
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Cancel failed' })
    }
  })
}
```

- [ ] **Step 2: Register the route in app.ts**

Open `apps/api/src/app.ts`. Find the import for `externalIBERoutes`:
```typescript
import { externalIBERoutes } from './routes/external-ibe.route.js'
```

Add immediately after:
```typescript
import { testBookingsRoutes } from './routes/test-bookings.route.js'
```

Then find the line that registers `externalIBERoutes` in the admin block:
```typescript
    await adminApp.register(externalIBERoutes, { prefix: '/api/v1' })
```

Add immediately after:
```typescript
    await adminApp.register(testBookingsRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 3: Build the API to verify no TypeScript errors**

```bash
cd apps/api && npm run build 2>&1 | head -30
```

Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/test-bookings.route.ts apps/api/src/app.ts
git commit -m "feat: add test-bookings admin API routes"
```

---

## Task 4: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add the three new methods**

Open `apps/web/src/lib/api-client.ts`. Find the `testExternalIBECombinations` method block. Add the following after the `bulkMapExternalIBE` method (around line 2016):

```typescript
  // ── Test Bookings ──────────────────────────────────────────────────────────

  testBookingsSearch(req: TestBookingSearchRequest): Promise<TestBookingSearchResponse> {
    return apiRequest<TestBookingSearchResponse>('/api/v1/admin/test-bookings/search', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  testBookingsBook(req: TestBookingBookRequest): Promise<TestBookingBookResponse> {
    return apiRequest<TestBookingBookResponse>('/api/v1/admin/test-bookings/book', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  testBookingsCancel(bookingId: number): Promise<TestBookingCancelResponse> {
    return apiRequest<TestBookingCancelResponse>(`/api/v1/admin/test-bookings/${bookingId}/cancel`, {
      method: 'POST',
    })
  },
```

- [ ] **Step 2: Add the imports at the top of the file**

Find the existing import from `@ibe/shared` in `api-client.ts` (there should be one large import block). Add the new types to it:

```typescript
import type {
  // ... existing imports ...
  TestBookingSearchRequest,
  TestBookingSearchResponse,
  TestBookingBookRequest,
  TestBookingBookResponse,
  TestBookingCancelResponse,
} from '@ibe/shared'
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat: add test-bookings API client methods"
```

---

## Task 5: Nav Entry

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

- [ ] **Step 1: Add the nav item**

Open `apps/web/src/app/admin/_layout-client.tsx`. Find the Configuration section (around line 102). Find the External IBE entry:

```typescript
      { href: '/admin/config/external-ibe', label: 'External IBE', sellerOnly: true },
```

Add immediately after:

```typescript
      { href: '/admin/config/test-bookings', label: 'Test Bookings', sellerOnly: true },
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx
git commit -m "feat: add Test Bookings nav entry under Configuration"
```

---

## Task 6: Admin Page — Shell + Pre-made Combinations Tab

**Files:**
- Create: `apps/web/src/app/admin/config/test-bookings/page.tsx`

- [ ] **Step 1: Create the page file with shared helpers, constants, and CombinationsMode**

```tsx
// apps/web/src/app/admin/config/test-bookings/page.tsx
'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import * as XLSX from 'xlsx'
import type { TestBookingRateResult, TestBookingBookResponse } from '@ibe/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

interface Combination {
  adults: number
  childrenAges: number[]
  nationality: string
  offsetDays: number
  nights: number
  board: string
  cancellation: 'R' | 'NR'
  label: string
}

const COMBINATIONS: Combination[] = [
  { adults: 1, childrenAges: [],       nationality: 'GR', offsetDays: 1,   nights: 2,  board: 'RO', cancellation: 'NR', label: '1A · GR · today+1 · 2n · RO · NR' },
  { adults: 2, childrenAges: [],       nationality: 'US', offsetDays: 7,   nights: 5,  board: 'BB', cancellation: 'R',  label: '2A · US · today+7 · 5n · BB · R' },
  { adults: 1, childrenAges: [11],     nationality: 'IN', offsetDays: 30,  nights: 3,  board: 'RO', cancellation: 'R',  label: '1A+1C(11) · IN · today+30 · 3n · RO · R' },
  { adults: 2, childrenAges: [4, 9],   nationality: 'EG', offsetDays: 90,  nights: 9,  board: 'HB', cancellation: 'NR', label: '2A+2C(4,9) · EG · today+90 · 9n · HB · NR' },
  { adults: 3, childrenAges: [],       nationality: 'UK', offsetDays: 290, nights: 11, board: 'BB', cancellation: 'R',  label: '3A · UK · today+290 · 11n · BB · R' },
  { adults: 2, childrenAges: [],       nationality: 'DE', offsetDays: 14,  nights: 7,  board: 'HB', cancellation: 'R',  label: '2A · DE · today+14 · 7n · HB · R' },
  { adults: 4, childrenAges: [],       nationality: 'US', offsetDays: 21,  nights: 3,  board: 'BB', cancellation: 'NR', label: '4A · US · today+21 · 3n · BB · NR' },
  { adults: 1, childrenAges: [6, 14],  nationality: 'UK', offsetDays: 45,  nights: 7,  board: 'HB', cancellation: 'R',  label: '1A+2C(6,14) · UK · today+45 · 7n · HB · R' },
  { adults: 2, childrenAges: [2],      nationality: 'FR', offsetDays: 60,  nights: 5,  board: 'RO', cancellation: 'NR', label: '2A+1C(2) · FR · today+60 · 5n · RO · NR' },
  { adults: 2, childrenAges: [],       nationality: 'JP', offsetDays: 180, nights: 2,  board: 'BB', cancellation: 'R',  label: '2A · JP · today+180 · 2n · BB · R' },
]

function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Rate state per combination ─────────────────────────────────────────────────

interface RateState {
  rate: TestBookingRateResult
  checked: boolean
  booking: TestBookingBookResponse | null
  bookingError: string | null
  cancelStatus: 'idle' | 'cancelling' | 'cancelled' | 'error'
}

interface ComboState {
  status: 'idle' | 'searching' | 'done' | 'no-results' | 'error'
  error: string | null
  rates: RateState[]
}

// ── Booking badge ─────────────────────────────────────────────────────────────

function CancelButton({ rateState, onCancel }: {
  rateState: RateState
  onCancel: () => void
}) {
  if (rateState.cancelStatus === 'cancelled') {
    return <span className="text-xs font-medium text-[var(--color-text-muted)]">cancelled</span>
  }
  if (rateState.cancelStatus === 'cancelling') {
    return <span className="text-xs text-[var(--color-text-muted)]">cancelling…</span>
  }
  if (rateState.cancelStatus === 'error') {
    return <span className="text-xs text-error">cancel failed — retry?</span>
  }
  return (
    <button
      type="button"
      onClick={onCancel}
      className="text-xs text-error hover:underline"
    >
      Cancel
    </button>
  )
}

// ── CombinationsMode ──────────────────────────────────────────────────────────

function CombinationsMode({ propertyId }: { propertyId: number }) {
  const [selected, setSelected] = useState<boolean[]>(Array(COMBINATIONS.length).fill(false))
  const [comboStates, setComboStates] = useState<ComboState[]>(
    COMBINATIONS.map(() => ({ status: 'idle', error: null, rates: [] }))
  )
  const [running, setRunning] = useState(false)

  const allSelected = selected.every(Boolean)
  const anySelected = selected.some(Boolean)
  const anyBooking = comboStates.some(s => s.rates.some(r => r.booking !== null))

  function toggleAll() {
    setSelected(prev => prev.map(() => !allSelected))
  }

  function updateCombo(i: number, update: Partial<ComboState>) {
    setComboStates(prev => {
      const next = [...prev]
      next[i] = { ...next[i]!, ...update }
      return next
    })
  }

  function updateRate(comboIdx: number, rateIdx: number, update: Partial<RateState>) {
    setComboStates(prev => {
      const next = [...prev]
      const combo = { ...next[comboIdx]! }
      const rates = [...combo.rates]
      rates[rateIdx] = { ...rates[rateIdx]!, ...update }
      combo.rates = rates
      next[comboIdx] = combo
      return next
    })
  }

  async function runSearches() {
    setRunning(true)
    // Reset results for selected combos
    setComboStates(prev => prev.map((s, i) =>
      selected[i] ? { status: 'searching', error: null, rates: [] } : s
    ))

    await Promise.all(
      COMBINATIONS.map(async (combo, i) => {
        if (!selected[i]) return
        const checkIn = offsetDate(combo.offsetDays)
        const checkOut = offsetDate(combo.offsetDays + combo.nights)
        try {
          const res = await apiClient.testBookingsSearch({
            propertyId, checkIn, checkOut,
            adults: combo.adults, childrenAges: combo.childrenAges,
          })
          if (res.rates.length === 0) {
            updateCombo(i, { status: 'no-results' })
          } else {
            updateCombo(i, {
              status: 'done',
              rates: res.rates.map(r => ({ rate: r, checked: false, booking: null, bookingError: null, cancelStatus: 'idle' })),
            })
          }
        } catch (err) {
          updateCombo(i, { status: 'error', error: err instanceof Error ? err.message : 'Search failed' })
        }
      })
    )
    setRunning(false)
  }

  async function bookChecked() {
    await Promise.all(
      comboStates.map(async (combo, comboIdx) => {
        const combo_ = COMBINATIONS[comboIdx]!
        const checkIn = offsetDate(combo_.offsetDays)
        const checkOut = offsetDate(combo_.offsetDays + combo_.nights)
        await Promise.all(
          combo.rates.map(async (rateState, rateIdx) => {
            if (!rateState.checked || rateState.booking) return
            try {
              const result = await apiClient.testBookingsBook({
                propertyId, rateKey: rateState.rate.rateKey,
                checkIn, checkOut,
                adults: combo_.adults, childrenAges: combo_.childrenAges,
              })
              updateRate(comboIdx, rateIdx, { booking: result, bookingError: null })
            } catch (err) {
              updateRate(comboIdx, rateIdx, { bookingError: err instanceof Error ? err.message : 'Booking failed' })
            }
          })
        )
      })
    )
  }

  async function cancelBooking(comboIdx: number, rateIdx: number, bookingId: number) {
    updateRate(comboIdx, rateIdx, { cancelStatus: 'cancelling' })
    try {
      await apiClient.testBookingsCancel(bookingId)
      updateRate(comboIdx, rateIdx, { cancelStatus: 'cancelled' })
    } catch {
      updateRate(comboIdx, rateIdx, { cancelStatus: 'error' })
    }
  }

  const anyChecked = comboStates.some(s => s.rates.some(r => r.checked && !r.booking))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--color-text-muted)] flex-1">
          Select combinations, run searches to see available rates, then select rates to book.
        </p>
        <button
          type="button"
          disabled={running || !anySelected}
          onClick={() => { void runSearches() }}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          {running ? 'Searching…' : 'Run searches'}
        </button>
        {anyChecked && (
          <button
            type="button"
            onClick={() => { void bookChecked() }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Book selected
          </button>
        )}
        {anyBooking && (
          <button
            type="button"
            onClick={() => exportToExcel(COMBINATIONS, comboStates)}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors whitespace-nowrap"
          >
            Export Excel
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="pb-2 pr-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" />
              </th>
              <th className="pb-2 pr-3 font-medium">Combination</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {COMBINATIONS.map((combo, i) => {
              const state = comboStates[i]!
              return (
                <>
                  <tr key={i} className="border-t border-[var(--color-border)] align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected[i] ?? false}
                        onChange={e => setSelected(prev => { const n = [...prev]; n[i] = e.target.checked; return n })}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text)]">{combo.label}</td>
                    <td className="py-2 text-xs">
                      {state.status === 'idle' && <span className="text-[var(--color-text-muted)]">—</span>}
                      {state.status === 'searching' && (
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          searching…
                        </span>
                      )}
                      {state.status === 'no-results' && <span className="text-[var(--color-text-muted)]">no results</span>}
                      {state.status === 'error' && <span className="text-error">{state.error}</span>}
                      {state.status === 'done' && (
                        <span className="text-success">{state.rates.length} rate{state.rates.length !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                  </tr>
                  {state.status === 'done' && state.rates.length > 0 && (
                    <tr key={`${i}-rates`} className="border-t border-[var(--color-border)]/50">
                      <td />
                      <td colSpan={2} className="pb-2 pl-2">
                        <RatesSubTable
                          rates={state.rates}
                          onToggle={rateIdx => updateRate(i, rateIdx, { checked: !state.rates[rateIdx]!.checked })}
                          onCancel={(rateIdx, bookingId) => { void cancelBooking(i, rateIdx, bookingId) }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── RatesSubTable ─────────────────────────────────────────────────────────────

function RatesSubTable({ rates, onToggle, onCancel }: {
  rates: RateState[]
  onToggle: (idx: number) => void
  onCancel: (idx: number, bookingId: number) => void
}) {
  return (
    <table className="w-full text-xs border-collapse mt-1">
      <thead>
        <tr className="text-left text-[var(--color-text-muted)]">
          <th className="pb-1 pr-2 font-medium">Book</th>
          <th className="pb-1 pr-2 font-medium">Room</th>
          <th className="pb-1 pr-2 font-medium">Board</th>
          <th className="pb-1 pr-2 font-medium">Cancel</th>
          <th className="pb-1 pr-2 font-medium text-right">Per night</th>
          <th className="pb-1 pr-2 font-medium text-right">Total</th>
          <th className="pb-1 font-medium">Reference</th>
        </tr>
      </thead>
      <tbody>
        {rates.map((rs, idx) => (
          <tr key={idx} className="border-t border-[var(--color-border)]/30 align-top">
            <td className="py-1 pr-2">
              {rs.booking ? (
                <span className="text-success">✓</span>
              ) : (
                <input
                  type="checkbox"
                  checked={rs.checked}
                  onChange={() => onToggle(idx)}
                  className="cursor-pointer"
                />
              )}
            </td>
            <td className="py-1 pr-2 text-[var(--color-text)]">{rs.rate.roomName}</td>
            <td className="py-1 pr-2 text-[var(--color-text-muted)]">{rs.rate.board}</td>
            <td className="py-1 pr-2 text-[var(--color-text-muted)]">{rs.rate.cancellationPolicy}</td>
            <td className="py-1 pr-2 text-right text-[var(--color-text)]">
              {rs.rate.pricePerNight.toFixed(2)} {rs.rate.currency}
            </td>
            <td className="py-1 pr-2 text-right text-[var(--color-text)]">
              {rs.rate.totalPrice.toFixed(2)} {rs.rate.currency}
            </td>
            <td className="py-1">
              {rs.bookingError && <span className="text-error">{rs.bookingError}</span>}
              {rs.booking && !rs.bookingError && (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[var(--color-text)]">{rs.booking.bookingReference}</span>
                  <CancelButton
                    rateState={rs}
                    onCancel={() => onCancel(idx, rs.booking!.bookingId)}
                  />
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/admin/config/test-bookings/page.tsx
git commit -m "feat: add test-bookings page shell and pre-made combinations tab"
```

---

## Task 7: Custom Tab + Excel Export + Page Assembly

**Files:**
- Modify: `apps/web/src/app/admin/config/test-bookings/page.tsx`

- [ ] **Step 1: Add CustomMode, exportToExcel, and the page root — append to the existing page file**

Open `apps/web/src/app/admin/config/test-bookings/page.tsx` and add the following after the `RatesSubTable` component:

```tsx
// ── Excel export ──────────────────────────────────────────────────────────────

function exportToExcel(combos: Combination[], states: ComboState[]) {
  const rows: Record<string, unknown>[] = []

  states.forEach((state, comboIdx) => {
    const combo = combos[comboIdx]!
    state.rates.forEach(rs => {
      if (!rs.booking) return
      rows.push({
        'Combination #': comboIdx + 1,
        'Adults': combo.adults,
        'Children': combo.childrenAges.length,
        'Child Ages': combo.childrenAges.join(', ') || '—',
        'Nationality': combo.nationality,
        'Check-in': offsetDate(combo.offsetDays),
        'Check-out': offsetDate(combo.offsetDays + combo.nights),
        'Nights': combo.nights,
        'Board (combo)': combo.board,
        'Cancellation (combo)': combo.cancellation,
        'Room Name': rs.rate.roomName,
        'Board (rate)': rs.rate.board,
        'Cancellation (rate)': rs.rate.cancellationPolicy,
        'Price/Night': rs.rate.pricePerNight,
        'Total': rs.rate.totalPrice,
        'Currency': rs.rate.currency,
        'Booking Reference': rs.booking.bookingReference,
        'Status': rs.cancelStatus === 'cancelled' ? 'cancelled' : 'booked',
      })
    })
  })

  if (rows.length === 0) return

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Bookings')
  XLSX.writeFile(wb, `test-bookings-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function exportCustomToExcel(rates: RateState[], params: { checkIn: string; checkOut: string; adults: number; childrenAges: number[]; nationality: string }) {
  const nights = Math.round((Date.parse(params.checkOut) - Date.parse(params.checkIn)) / 86_400_000)
  const rows = rates
    .filter(rs => rs.booking)
    .map(rs => ({
      'Adults': params.adults,
      'Children': params.childrenAges.length,
      'Child Ages': params.childrenAges.join(', ') || '—',
      'Nationality': params.nationality,
      'Check-in': params.checkIn,
      'Check-out': params.checkOut,
      'Nights': nights,
      'Room Name': rs.rate.roomName,
      'Board': rs.rate.board,
      'Cancellation': rs.rate.cancellationPolicy,
      'Price/Night': rs.rate.pricePerNight,
      'Total': rs.rate.totalPrice,
      'Currency': rs.rate.currency,
      'Booking Reference': rs.booking!.bookingReference,
      'Status': rs.cancelStatus === 'cancelled' ? 'cancelled' : 'booked',
    }))

  if (rows.length === 0) return

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Bookings')
  XLSX.writeFile(wb, `test-bookings-custom-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── CustomMode ────────────────────────────────────────────────────────────────

const NATIONALITIES = ['GR', 'US', 'UK', 'DE', 'FR', 'IN', 'EG', 'JP', 'AU', 'IT', 'ES', 'CN', 'BR', 'RU', 'CA']

function defaultDates() {
  const now = new Date()
  const ci = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)
  const co = new Date(now.getTime() + 32 * 86400000).toISOString().slice(0, 10)
  return { checkIn: ci, checkOut: co }
}

function CustomMode({ propertyId }: { propertyId: number }) {
  const { checkIn: defaultCI, checkOut: defaultCO } = defaultDates()
  const [checkIn, setCheckIn] = useState(defaultCI)
  const [checkOut, setCheckOut] = useState(defaultCO)
  const [adults, setAdults] = useState(2)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [nationality, setNationality] = useState('US')
  const [rates, setRates] = useState<RateState[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'done' | 'no-results' | 'error'>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)

  const anyBooking = rates.some(r => r.booking !== null)
  const anyChecked = rates.some(r => r.checked && !r.booking)

  function updateRate(idx: number, update: Partial<RateState>) {
    setRates(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx]!, ...update }
      return next
    })
  }

  async function runSearch() {
    setSearchStatus('searching')
    setSearchError(null)
    setRates([])
    try {
      const res = await apiClient.testBookingsSearch({ propertyId, checkIn, checkOut, adults, childrenAges })
      if (res.rates.length === 0) {
        setSearchStatus('no-results')
      } else {
        setRates(res.rates.map(r => ({ rate: r, checked: false, booking: null, bookingError: null, cancelStatus: 'idle' })))
        setSearchStatus('done')
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchStatus('error')
    }
  }

  async function bookChecked() {
    await Promise.all(
      rates.map(async (rs, idx) => {
        if (!rs.checked || rs.booking) return
        try {
          const result = await apiClient.testBookingsBook({
            propertyId, rateKey: rs.rate.rateKey, checkIn, checkOut, adults, childrenAges,
          })
          updateRate(idx, { booking: result, bookingError: null })
        } catch (err) {
          updateRate(idx, { bookingError: err instanceof Error ? err.message : 'Booking failed' })
        }
      })
    )
  }

  async function cancelBooking(idx: number, bookingId: number) {
    updateRate(idx, { cancelStatus: 'cancelling' })
    try {
      await apiClient.testBookingsCancel(bookingId)
      updateRate(idx, { cancelStatus: 'cancelled' })
    } catch {
      updateRate(idx, { cancelStatus: 'error' })
    }
  }

  const inputClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Check-in</label>
          <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Check-out</label>
          <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Adults</label>
          <select value={adults} onChange={e => setAdults(Number(e.target.value))} className={inputClass}>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Children ages (comma-separated)</label>
          <input
            type="text"
            placeholder="e.g. 5,10"
            className={inputClass}
            onChange={e => {
              const val = e.target.value.trim()
              if (!val) { setChildrenAges([]); return }
              const ages = val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
              setChildrenAges(ages)
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Nationality</label>
          <select value={nationality} onChange={e => setNationality(e.target.value)} className={inputClass}>
            {NATIONALITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          type="button"
          disabled={!checkIn || !checkOut || searchStatus === 'searching'}
          onClick={() => { void runSearch() }}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {searchStatus === 'searching' ? 'Searching…' : 'Run search'}
        </button>
        {anyChecked && (
          <button
            type="button"
            onClick={() => { void bookChecked() }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Book selected
          </button>
        )}
        {anyBooking && (
          <button
            type="button"
            onClick={() => exportCustomToExcel(rates, { checkIn, checkOut, adults, childrenAges, nationality })}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            Export Excel
          </button>
        )}
      </div>

      {searchStatus === 'error' && <p className="text-sm text-error">{searchError}</p>}
      {searchStatus === 'no-results' && <p className="text-sm text-[var(--color-text-muted)]">No rates available for this combination.</p>}

      {searchStatus === 'done' && rates.length > 0 && (
        <RatesSubTable
          rates={rates}
          onToggle={idx => updateRate(idx, { checked: !rates[idx]!.checked })}
          onCancel={(idx, bookingId) => { void cancelBooking(idx, bookingId) }}
        />
      )}
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function TestBookingsPage() {
  const { propertyId } = useAdminProperty()
  const [activeTab, setActiveTab] = useState<'combinations' | 'custom'>('combinations')

  if (!propertyId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          Select a property to use Test Bookings.
        </p>
      </main>
    )
  }

  const tabClass = (tab: 'combinations' | 'custom') =>
    [
      'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors',
      activeTab === tab
        ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
    ].join(' ')

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Test Bookings</h1>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Booking test</h2>
          <div className="flex gap-0">
            <button type="button" className={tabClass('combinations')} onClick={() => setActiveTab('combinations')}>
              Pre-made Combinations
            </button>
            <button type="button" className={tabClass('custom')} onClick={() => setActiveTab('custom')}>
              Custom
            </button>
          </div>
        </div>

        {activeTab === 'combinations' && <CombinationsMode propertyId={propertyId} />}
        {activeTab === 'custom' && <CustomMode propertyId={propertyId} />}
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: exits 0 with no errors. If you see errors about missing `useAdminProperty` shape (e.g. `propertyId` may be null), the guard at the top of `TestBookingsPage` handles it — `propertyId` is narrowed to `number` after the null check.

- [ ] **Step 3: Start the dev server and smoke-test the page**

```bash
cd apps/web && npm run dev
```

Navigate to `/admin/config/test-bookings` in the browser. Verify:
- Page shows "Select a property to use Test Bookings" when no property is selected
- After selecting a property, the page renders with two tabs
- "Pre-made Combinations" tab shows the 10-row matrix with checkboxes
- "Custom" tab shows the date/guest/nationality controls
- "Test Bookings" appears in the Configuration section of the sidebar

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/config/test-bookings/page.tsx
git commit -m "feat: complete test-bookings admin page (custom tab, booking, cancel, Excel export)"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Sub-menu under Configuration | Task 5 |
| Two tabs: Pre-made + Custom | Task 7 |
| 10 pre-made combinations | Task 6 (COMBINATIONS constant) |
| Select all / individual checkboxes | Task 6 |
| Run searches → show rates | Tasks 2, 3, 6 |
| Stream/parallel search (no SSE needed) | Task 6 (`Promise.all`) |
| Rate table per combination | Task 6 (`RatesSubTable`) |
| Select rates → book | Tasks 2, 3, 6 |
| Fixed test guest details (server-side) | Task 2 |
| `isTest: true` on HG call | Task 2 |
| Cancel individual bookings | Tasks 2, 3, 6 |
| Export to Excel | Task 7 |
| Custom tab identical flow | Task 7 |
| Property-only guard | Tasks 3, 7 |
| Org access check | Task 3 |

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:** `TestBookingRateResult`, `TestBookingBookResponse`, `TestBookingCancelResponse` defined in Task 1, used consistently in Tasks 2, 4, 6, 7. `rateKey` encoded/decoded by `encodeRateKey`/`decodeRateKey` throughout.
