# SimpleBooking.it IBE Harvester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SimpleBookingHarvester` for simplebooking.it, following the same JSON-intercept + DOM-fallback pattern as `DirectBookHarvester`. Wire it into the onboarding harvester map and CompSet.

**Architecture:** Same as `DirectBookHarvester`: `beforeNavigate` registers a JSON response listener; shared `tryParsePropertyInfo`/`tryParseRooms`/`normaliseBoard` parse intercepted payloads; DOM fallback if nothing is intercepted. URL building uses SimpleBooking.it's `guests=A,A,8` format.

**Tech Stack:** TypeScript, Playwright (existing), `@ibe/shared` (existing), vitest

---

## Task 1: Build `SimpleBookingHarvester`

**Files:**
- Create: `apps/onboarding-api/src/services/harvesters/simplebooking-harvester.ts`
- Create: `apps/onboarding-api/src/services/__tests__/simplebooking-harvester.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/onboarding-api/src/services/__tests__/simplebooking-harvester.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../playwright-browser.service.js', () => ({ withStealthPage: vi.fn() }))
vi.mock('@ibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ibe/shared')>()
  return {
    ...actual,
    detectKnownIBE: vi.fn().mockReturnValue({
      name: 'SimpleBooking.it',
      externalHotelId: 'test-hotel-123',
      searchTemplate: 'https://www.simplebooking.it/ibe2/hotel/{externalHotelId}?lang=EN&cur={currency}&in={checkIn}&out={checkOut}&guests={guests}',
      bookingTemplate: 'https://www.simplebooking.it/ibe2/hotel/{externalHotelId}/your-solution/{solutionId}/services?lang=EN&cur={currency}&in={checkIn}&out={checkOut}&guests={guests}',
    }),
  }
})
vi.mock('../tax-lookup.service.js', () => ({
  lookupTaxes: vi.fn().mockReturnValue([{ name: 'IVA', amount: '10%', notes: null, source: 'lookup' }]),
}))

import { withStealthPage } from '../playwright-browser.service.js'
import { detectKnownIBE } from '@ibe/shared'
import { SimpleBookingHarvester } from '../harvesters/simplebooking-harvester.js'

const CTX = { checkIn: '2026-06-15', checkOut: '2026-06-16' }

function makeMockPage(opts: {
  jsonResponses?: Array<{ url: string; json: unknown }>
  domRooms?: unknown[]
  domHotelInfo?: Record<string, unknown>
}) {
  const responseListeners: Array<(res: unknown) => void> = []
  let pendingHotelInfoEval = false
  const defaultHotelInfo = opts.domHotelInfo ?? {
    name: 'DOM Hotel', starRating: null, address: null, city: 'Rome',
    country: 'Italy', phone: null, email: null,
    website: 'https://www.simplebooking.it/ibe2/hotel/test-hotel-123',
    description: 'DOM description', images: [], amenities: [], policies: [],
  }
  return {
    on: (event: string, fn: (res: unknown) => void) => {
      if (event === 'response') responseListeners.push(fn)
    },
    waitForSelector: vi.fn().mockImplementation(async () => {
      pendingHotelInfoEval = true
    }),
    waitForTimeout: vi.fn().mockImplementation(async () => {
      for (const resp of opts.jsonResponses ?? []) {
        const mockRes = {
          url: () => resp.url,
          headers: () => ({ 'content-type': 'application/json' }),
          json: () => Promise.resolve(resp.json),
        }
        for (const fn of responseListeners) await fn(mockRes)
      }
    }),
    evaluate: vi.fn().mockImplementation(() => {
      if (pendingHotelInfoEval) {
        pendingHotelInfoEval = false
        return Promise.resolve(defaultHotelInfo)
      }
      return Promise.resolve(opts.domRooms ?? [])
    }),
    $: vi.fn().mockResolvedValue(null),
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('SimpleBookingHarvester.harvest', () => {
  it('throws when URL is not recognised', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null)
    await expect(
      new SimpleBookingHarvester().harvest('https://other.com', CTX, () => {}),
    ).rejects.toThrow('Not a recognised SimpleBooking.it URL')
  })

  it('extracts hotel info and rooms from intercepted JSON', async () => {
    const page = makeMockPage({
      jsonResponses: [
        {
          url: 'https://www.simplebooking.it/api/property',
          json: {
            name: 'Hotel Roma', stars: 4, city: 'Rome', country: 'Italy',
            description: 'Central hotel', amenities: ['WiFi', 'Bar'],
            images: ['https://example.com/img.jpg'], address: 'Via Roma 1',
          },
        },
        {
          url: 'https://www.simplebooking.it/api/availability',
          json: {
            rooms: [
              {
                name: 'Camera Doppia',
                description: 'Comfortable room',
                images: [],
                amenities: ['TV'],
                rates: [
                  { boardType: 'Bed & Breakfast', cancellationPolicy: 'Free cancellation', nonRefundable: false, pricePerNight: 110, currency: 'EUR' },
                  { boardType: 'Room Only', cancellationPolicy: 'Non-refundable', nonRefundable: true, pricePerNight: 90, currency: 'EUR' },
                ],
              },
            ],
          },
        },
      ],
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn, opts) => {
      opts?.beforeNavigate?.(page as any)
      return fn(page as any)
    })

    const result = await new SimpleBookingHarvester().harvest(
      'https://www.simplebooking.it/ibe2/hotel/test-hotel-123',
      CTX,
      () => {},
    )

    expect(result.name).toBe('Hotel Roma')
    expect(result.starRating).toBe(4)
    expect(result.city).toBe('Rome')
    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0]!.name).toBe('Camera Doppia')
    expect(result.discoveredRatePlanTypes).toHaveLength(2)
    expect(result.discoveredRatePlanTypes.find(r => r.boardCode === 'BB')).toBeDefined()
    expect(result.discoveredRatePlanTypes.find(r => r.boardCode === 'RO')?.hasNonRefundable).toBe(true)
    expect(result.taxesAndFees[0]!.source).toBe('lookup')
  })

  it('deduplicates rooms and merges supported occupancies', async () => {
    let callCount = 0
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn, opts) => {
      callCount++
      const roomsJson = callCount <= 4
        ? { rooms: [{ name: 'Camera Standard', rates: [{ boardType: 'Room Only', cancellationPolicy: '', nonRefundable: false, pricePerNight: 80, currency: 'EUR' }] }] }
        : {}
      const page = makeMockPage({ jsonResponses: [{ url: 'https://www.simplebooking.it/api', json: roomsJson }] })
      opts?.beforeNavigate?.(page as any)
      return fn(page as any)
    })

    const result = await new SimpleBookingHarvester().harvest(
      'https://www.simplebooking.it/ibe2/hotel/test-hotel-123',
      CTX,
      () => {},
    )

    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0]!.supportedOccupancies.length).toBeGreaterThan(1)
  })

  it('falls back to DOM evaluate when no JSON intercepted', async () => {
    const page = makeMockPage({ jsonResponses: [], domRooms: [] })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn, opts) => {
      opts?.beforeNavigate?.(page as any)
      return fn(page as any)
    })

    const result = await new SimpleBookingHarvester().harvest(
      'https://www.simplebooking.it/ibe2/hotel/test-hotel-123',
      CTX,
      () => {},
    )

    expect(page.evaluate).toHaveBeenCalled()
    expect(result.name).toBe('DOM Hotel')
    expect(result.city).toBe('Rome')
    expect(Array.isArray(result.rooms)).toBe(true)
  })

  it('builds URL with correct guests format', async () => {
    const urls: string[] = []
    vi.mocked(withStealthPage).mockImplementation(async (url, fn, opts) => {
      urls.push(url)
      const page = makeMockPage({ jsonResponses: [] })
      opts?.beforeNavigate?.(page as any)
      return fn(page as any)
    })

    await new SimpleBookingHarvester().harvest(
      'https://www.simplebooking.it/ibe2/hotel/test-hotel-123',
      CTX,
      () => {},
    )

    // First URL is fetchHotelInfo (2 adults, no children) → guests=A,A
    expect(urls[0]).toContain('guests=A%2CA')
    // Should also have a URL with child: guests=A,A,8 → guests=A%2CA%2C8
    const childUrl = urls.find(u => u.includes('A%2CA%2C'))
    expect(childUrl).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @ibe/onboarding-api test -- simplebooking-harvester
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `simplebooking-harvester.ts`**

Create `apps/onboarding-api/src/services/harvesters/simplebooking-harvester.ts`:

```typescript
import { detectKnownIBE, normaliseBoard, tryParsePropertyInfo, tryParseRooms } from '@ibe/shared'
import type { ParsedRoom } from '@ibe/shared'
import { withStealthPage } from '../playwright-browser.service.js'
import { lookupTaxes } from '../tax-lookup.service.js'
import { parseCancellationPolicy } from './cancellation-policy-parser.js'
import type {
  HarvestedHotelData, HarvestedRoom, DiscoveredRatePlanType, HarvestedOccupancy,
} from '@ibe/onboarding-flows'
import type { IbeHarvester, HarvestContext } from './types.js'
import type { Response as PlaywrightResponse } from 'playwright'

const DATE_WINDOW_OFFSETS = [7, 30]
// [adults, children, childAge]
const OCCUPANCY_PATTERNS: [number, number, number][] = [
  [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0],
  [2, 1, 8], [2, 2, 8],
]

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function buildGuests(adults: number, children: number, childAge: number): string {
  const parts = [...Array(adults).fill('A'), ...Array(children).fill(String(childAge))]
  return parts.join(',')
}

function buildSearchUrl(
  template: string,
  hotelId: string,
  adults: number,
  children: number,
  childAge: number,
  checkIn: string,
  checkOut: string,
): string {
  const guests = buildGuests(adults, children, childAge)
  return template
    .replace('{externalHotelId}', hotelId)
    .replace('{checkIn}', checkIn)
    .replace('{checkOut}', checkOut)
    .replace('{currency}', 'EUR')
    .replace('{guests}', encodeURIComponent(guests))
}

function makeResponseCollector(payloads: unknown[]) {
  return (res: PlaywrightResponse) => {
    if (
      res.url().includes('simplebooking.it') &&
      (res.headers()['content-type'] ?? '').includes('json')
    ) {
      res.json().then((data) => payloads.push(data)).catch(() => {})
    }
  }
}

const DOM = {
  hotelName:  'h1, [class*="hotel-name"], [class*="HotelName"], [class*="property-name"]',
  roomCard:   '[class*="room-card"], [class*="RoomCard"], [class*="room-item"], [class*="solution"]',
  roomName:   'h3, h4, [class*="room-name"], [class*="solution-name"], [class*="room-title"]',
  rateRow:    '[class*="rate"], [class*="Rate"], [class*="price-plan"], [class*="tariff"]',
  boardCell:  '[class*="meal"], [class*="board"], [class*="treatment"], [class*="regime"]',
  cancelCell: '[class*="cancel"], [class*="refund"], [class*="policy"]',
}

type HotelInfoResult = Omit<HarvestedHotelData, 'rooms' | 'discoveredRatePlanTypes' | 'agePolicy' | 'taxesAndFees'>

export class SimpleBookingHarvester implements IbeHarvester {
  async harvest(
    ibeUrl: string,
    ctx: HarvestContext,
    onProgress: (m: string) => void,
  ): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl)
    if (!detected) throw new Error('Not a recognised SimpleBooking.it URL')
    const { searchTemplate, externalHotelId: hotelId } = detected

    onProgress('Fetching hotel information...')
    const hotelInfo = await this.fetchHotelInfo(searchTemplate, hotelId, ctx)

    onProgress('Discovering room types and rate plans...')
    const { rooms, ratePlanTypes } = await this.discoverRoomsAndRates(searchTemplate, hotelId, onProgress)

    onProgress('Looking up taxes...')
    const taxesAndFees = lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? '')

    return { ...hotelInfo, rooms, discoveredRatePlanTypes: ratePlanTypes, agePolicy: null, taxesAndFees }
  }

  private async fetchHotelInfo(
    template: string, hotelId: string, ctx: HarvestContext,
  ): Promise<HotelInfoResult> {
    const url = buildSearchUrl(template, hotelId, 2, 0, 0, ctx.checkIn, ctx.checkOut)
    const payloads: unknown[] = []

    return withStealthPage(url, async (page) => {
      try { await page.waitForSelector('h1', { timeout: 12000 }) } catch {}
      await page.waitForTimeout(2000)

      for (const payload of payloads) {
        const info = tryParsePropertyInfo(payload)
        if (info) {
          return {
            name: info.name,
            starRating: info.starRating,
            address: info.address,
            city: info.city,
            country: info.country,
            description: info.description ?? '',
            images: info.images,
            amenities: info.amenities,
            phone: null,
            email: null,
            website: `https://www.simplebooking.it/ibe2/hotel/${hotelId}`,
            policies: [],
          }
        }
      }

      return page.evaluate(({ sel, hId }: { sel: typeof DOM; hId: string }): HotelInfoResult => {
        const name = document.querySelector(sel.hotelName)?.textContent?.trim() ?? ''
        const imgs = Array.from(document.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
          .map(i => i.src)
          .filter(s => s.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(s))
          .slice(0, 20)
        const amenities = Array.from(
          document.querySelectorAll('[class*="amenity"] li, [class*="servizi"] li, [class*="feature"] li'),
        ).map(el => (el as HTMLElement).textContent?.trim() ?? '').filter(Boolean).slice(0, 20)
        return {
          name, starRating: null, address: null, city: null, country: null,
          phone: null, email: null, website: `https://www.simplebooking.it/ibe2/hotel/${hId}`,
          description: document.querySelector('[class*="description"], [class*="descrizione"]')?.textContent?.trim()?.slice(0, 500) ?? '',
          images: imgs, amenities, policies: [],
        }
      }, { sel: DOM, hId: hotelId })
    }, {
      idleTimeout: 12000,
      beforeNavigate: (page) => { page.on('response', makeResponseCollector(payloads)) },
    })
  }

  private async discoverRoomsAndRates(
    template: string, hotelId: string, onProgress: (m: string) => void,
  ): Promise<{ rooms: HarvestedRoom[]; ratePlanTypes: DiscoveredRatePlanType[] }> {
    const roomsMap = new Map<string, HarvestedRoom>()
    const ratePlanMap = new Map<string, DiscoveredRatePlanType>()

    for (const offsetDays of DATE_WINDOW_OFFSETS) {
      const checkIn = addDays(offsetDays)
      const checkOut = addDays(offsetDays + 1)
      let consecutiveEmpty = 0

      for (const [adults, children, childAge] of OCCUPANCY_PATTERNS) {
        onProgress(`Searching ${adults}A${children > 0 ? `+${children}C` : ''} (${offsetDays}d out)...`)
        const searchUrl = buildSearchUrl(template, hotelId, adults, children, childAge, checkIn, checkOut)
        const parsed = await this.scrapeSearch(searchUrl)
        const gotResults = parsed.length > 0
        let foundNew = false

        for (const room of parsed) {
          if (!roomsMap.has(room.name)) {
            foundNew = true
            roomsMap.set(room.name, {
              name: room.name,
              description: room.description,
              images: room.images,
              bedConfiguration: room.bedConfig,
              amenities: room.amenities,
              supportedOccupancies: [{ adults, children }],
              maxAdults: adults,
              maxOccupancy: adults + children,
            })
          } else {
            const existing = roomsMap.get(room.name)!
            const occ: HarvestedOccupancy = { adults, children }
            if (!existing.supportedOccupancies.some(o => o.adults === adults && o.children === children)) {
              existing.supportedOccupancies.push(occ)
              existing.maxAdults = Math.max(existing.maxAdults ?? 0, adults)
              existing.maxOccupancy = Math.max(existing.maxOccupancy ?? 0, adults + children)
            }
          }

          for (const rate of room.rates) {
            const boardCode = normaliseBoard(rate.boardLabel)
            if (!boardCode) continue
            const key = `${boardCode}:${rate.isNonRefundable ? 'NR' : 'R'}`
            if (!ratePlanMap.has(key)) {
              ratePlanMap.set(key, {
                boardCode,
                boardCodeRawName: rate.boardLabel,
                hasRefundable: !rate.isNonRefundable,
                hasNonRefundable: rate.isNonRefundable,
                refundableCancellationPolicy: rate.isNonRefundable ? null : parseCancellationPolicy(rate.cancelText),
                refundableExampleName: rate.isNonRefundable ? null : rate.boardLabel,
                nonRefundableExampleName: rate.isNonRefundable ? rate.boardLabel : null,
              })
            } else {
              const existing = ratePlanMap.get(key)!
              if (!rate.isNonRefundable) existing.hasRefundable = true
              else existing.hasNonRefundable = true
            }
          }
        }

        // Breaks inner (occupancy) loop only — per-window early-stop.
        if (!gotResults) consecutiveEmpty++
        else consecutiveEmpty = 0
        if (consecutiveEmpty >= 3) break
        void foundNew
      }
    }

    return { rooms: Array.from(roomsMap.values()), ratePlanTypes: Array.from(ratePlanMap.values()) }
  }

  private async scrapeSearch(searchUrl: string): Promise<ParsedRoom[]> {
    try {
      const payloads: unknown[] = []
      return await withStealthPage(searchUrl, async (page) => {
        await page.waitForTimeout(5000)

        for (const payload of payloads) {
          const rooms = tryParseRooms(payload)
          if (rooms.length > 0) return rooms
        }

        return page.evaluate((sel: typeof DOM): ParsedRoom[] => {
          return (Array.from(document.querySelectorAll(sel.roomCard)).map(card => {
            const name = card.querySelector(sel.roomName)?.textContent?.trim() ?? 'Unknown Room'
            const imgs = Array.from(card.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
              .map(i => i.src).filter(s => s.startsWith('http'))
            const rates = Array.from(card.querySelectorAll(sel.rateRow)).map(r => ({
              boardLabel: r.querySelector(sel.boardCell)?.textContent?.trim() ?? '',
              cancelText: r.querySelector(sel.cancelCell)?.textContent?.trim() ?? '',
              isNonRefundable: /non.?refund/i.test(r.textContent ?? ''),
              pricePerNight: null,
              total: null,
              currency: null,
            })).filter(r => r.boardLabel)
            return { name, description: '', images: imgs, amenities: [], bedConfig: null, rates }
          }) as ParsedRoom[]).filter(r => r.name !== 'Unknown Room')
        }, DOM)
      }, {
        navigationTimeout: 20000,
        idleTimeout: 8000,
        beforeNavigate: (page) => { page.on('response', makeResponseCollector(payloads)) },
      })
    } catch {
      return []
    }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @ibe/onboarding-api test -- simplebooking-harvester
```
Expected: all 4 tests PASS. Note: the guests-format test checks for URL-encoded commas (`%2C`) since we call `encodeURIComponent(guests)`.

- [ ] **Step 5: Run full type-check**

```bash
pnpm --filter @ibe/onboarding-api exec tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/onboarding-api/src/services/harvesters/simplebooking-harvester.ts \
        apps/onboarding-api/src/services/__tests__/simplebooking-harvester.test.ts
git commit -m "feat(onboarding-api): SimpleBookingHarvester — JSON intercept + DOM fallback"
```

---

## Task 2: Register SimpleBookingHarvester + add CompSet extractor

**Files:**
- Modify: `apps/onboarding-api/src/services/ibe-harvester-map.ts`
- Modify: `apps/api/src/services/compset-collect.service.ts`

- [ ] **Step 1: Register in harvester map**

In `apps/onboarding-api/src/services/ibe-harvester-map.ts`, add the import and entry:

```typescript
import type { IbeHarvester } from './harvesters/types.js'
import { SynXisHarvester } from './harvesters/synxis-harvester.js'
import { DirectBookHarvester } from './harvesters/direct-book-harvester.js'
import { SimpleBookingHarvester } from './harvesters/simplebooking-harvester.js'

export const ibeHarvesterMap = new Map<string, IbeHarvester>([
  ['Sabre SynXis', new SynXisHarvester()],
  ['direct-book.com', new DirectBookHarvester()],
  ['SimpleBooking.it', new SimpleBookingHarvester()],
])
```

- [ ] **Step 2: Add CompSet extractor**

In `apps/api/src/services/compset-collect.service.ts`, add `extractSimpleBookingRates` after `extractDirectBookRates` and before `IBE_EXTRACTORS`:

```typescript
async function extractSimpleBookingRates(page: Page, orgId: number | null): Promise<RoomRate[]> {
  // SimpleBooking.it is a React SPA — try embedded __NEXT_DATA__ or window state first.
  const scriptData = await page.evaluate((): unknown => {
    const el = document.getElementById('__NEXT_DATA__')
    if (el?.textContent) {
      try { return JSON.parse(el.textContent) } catch {}
    }
    return null
  })

  if (scriptData) {
    const rooms = tryParseRooms(scriptData)
    const rates: RoomRate[] = []
    for (const room of rooms) {
      for (const rate of room.rates) {
        const board = normaliseBoard(rate.boardLabel)
        if (!board) continue
        rates.push({
          roomName: room.name,
          board,
          cancellation: rate.isNonRefundable ? 'NR' : 'Flexi',
          pricePerNight: rate.pricePerNight ?? 0,
          total: rate.total ?? rate.pricePerNight ?? 0,
          currency: rate.currency ?? 'EUR',
        })
      }
    }
    if (rates.length > 0) return rates
  }

  return extractRatesWithAI(page, orgId)
}
```

Then add to `IBE_EXTRACTORS`:

```typescript
const IBE_EXTRACTORS: Record<string, RateExtractor> = {
  'sentec': extractSentecRates,
  'direct-book.com': extractDirectBookRates,
  'simplebooking.it': extractSimpleBookingRates,
}
```

- [ ] **Step 3: Run all tests and type-checks**

```bash
pnpm --filter @ibe/onboarding-api test
pnpm --filter @ibe/onboarding-api exec tsc --noEmit
pnpm --filter @ibe/api exec tsc --noEmit
```
All must pass.

- [ ] **Step 4: Commit**

```bash
git add apps/onboarding-api/src/services/ibe-harvester-map.ts \
        apps/api/src/services/compset-collect.service.ts
git commit -m "feat: register SimpleBookingHarvester + add simplebooking.it CompSet extractor"
```
