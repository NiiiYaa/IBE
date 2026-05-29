# direct-book.com IBE Harvester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direct-book.com IBE harvester that extracts hotel info, room types, and rate plan types during self-onboarding, while placing shared parsing logic in `packages/shared` so CompSet can reuse it.

**Architecture:** Pure parsing functions (`normaliseBoard`, `tryParsePropertyInfo`, `tryParseRooms`) live in `packages/shared/src/utils/ibe-extractors/`. The `DirectBookHarvester` in `apps/onboarding-api` intercepts JSON responses via a new `beforeNavigate` option on `withStealthPage`, feeds payloads to the shared parsers, and falls back to DOM scraping. `apps/api` CompSet wires the same shared parsers for direct-book.com rate extraction.

**Tech Stack:** TypeScript, Playwright (existing), `@ibe/shared` (existing), vitest

---

## Task 1: Shared ibe-extractors — `normaliseBoard` + direct-book parsers

**Files:**
- Create: `packages/shared/src/utils/ibe-extractors/board-normalizer.ts`
- Create: `packages/shared/src/utils/ibe-extractors/direct-book.ts`
- Create: `packages/shared/src/utils/ibe-extractors/index.ts`
- Create: `packages/shared/src/__tests__/ibe-extractors.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/__tests__/ibe-extractors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normaliseBoard } from '../utils/ibe-extractors/board-normalizer.js'
import { tryParsePropertyInfo, tryParseRooms } from '../utils/ibe-extractors/direct-book.js'

describe('normaliseBoard', () => {
  it.each([
    ['room only', 'RO'],
    ['no meals', 'RO'],
    ['accommodation only', 'RO'],
    ['bed only', 'RO'],
    ['bed & breakfast', 'BB'],
    ['Bed and Breakfast', 'BB'],
    ['breakfast included', 'BB'],
    ['With Breakfast', 'BB'],
    ['half board', 'HB'],
    ['Half-Board', 'HB'],
    ['demi-pension', 'HB'],
    ['full board', 'FB'],
    ['all inclusive', 'AI'],
    ['All-Inclusive', 'AI'],
  ])('normalises "%s" → %s', (label, expected) => {
    expect(normaliseBoard(label)).toBe(expected)
  })

  it('returns null for unknown labels', () => {
    expect(normaliseBoard('spa package')).toBeNull()
    expect(normaliseBoard('')).toBeNull()
  })
})

describe('tryParsePropertyInfo', () => {
  it('parses flat property object', () => {
    const result = tryParsePropertyInfo({
      name: 'Grand Hotel',
      stars: 4,
      city: 'Rome',
      country: 'Italy',
      description: 'A lovely hotel',
      amenities: ['WiFi', 'Pool'],
      images: ['https://example.com/img1.jpg'],
      address: '123 Via Roma',
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Grand Hotel')
    expect(result!.starRating).toBe(4)
    expect(result!.city).toBe('Rome')
    expect(result!.amenities).toEqual(['WiFi', 'Pool'])
    expect(result!.images).toEqual(['https://example.com/img1.jpg'])
  })

  it('parses property nested under "data" key', () => {
    const result = tryParsePropertyInfo({
      data: { name: 'Boutique Inn', city: 'Paris', country: 'France', description: 'Cozy' },
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Boutique Inn')
  })

  it('extracts image URLs from object-array format', () => {
    const result = tryParsePropertyInfo({
      name: 'Hotel Test',
      city: 'Madrid',
      images: [{ url: 'https://cdn.example.com/photo1.jpg' }, { src: 'https://cdn.example.com/photo2.jpg' }],
    })
    expect(result!.images).toEqual(['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'])
  })

  it('returns null for non-object input', () => {
    expect(tryParsePropertyInfo(null)).toBeNull()
    expect(tryParsePropertyInfo('string')).toBeNull()
    expect(tryParsePropertyInfo([{ name: 'x' }])).toBeNull()
  })

  it('returns null when name is absent', () => {
    expect(tryParsePropertyInfo({ city: 'Rome', stars: 4 })).toBeNull()
  })
})

describe('tryParseRooms', () => {
  it('parses top-level room array', () => {
    const payload = [
      {
        name: 'Superior Room',
        description: 'Nice view',
        images: ['https://example.com/room.jpg'],
        amenities: ['TV'],
        rates: [
          {
            boardType: 'Bed & Breakfast',
            cancellationPolicy: 'Free cancellation',
            nonRefundable: false,
            pricePerNight: 120,
            currency: 'EUR',
          },
        ],
      },
    ]
    const result = tryParseRooms(payload)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Superior Room')
    expect(result[0]!.rates[0]!.boardLabel).toBe('Bed & Breakfast')
    expect(result[0]!.rates[0]!.isNonRefundable).toBe(false)
    expect(result[0]!.rates[0]!.pricePerNight).toBe(120)
  })

  it('parses rooms nested under "rooms" key', () => {
    const payload = {
      rooms: [
        {
          name: 'Deluxe Suite',
          rates: [{ boardType: 'Room Only', cancellationPolicy: 'Non-refundable', nonRefundable: true, pricePerNight: 200, currency: 'USD' }],
        },
      ],
    }
    const result = tryParseRooms(payload)
    expect(result).toHaveLength(1)
    expect(result[0]!.rates[0]!.isNonRefundable).toBe(true)
  })

  it('detects non-refundable from cancellation text', () => {
    const payload = [
      {
        name: 'Standard Room',
        rates: [{ boardType: 'BB', cancellationPolicy: 'Non-Refundable rate', pricePerNight: 90, currency: 'EUR' }],
      },
    ]
    const result = tryParseRooms(payload)
    expect(result[0]!.rates[0]!.isNonRefundable).toBe(true)
  })

  it('returns empty array for payloads with no room structure', () => {
    expect(tryParseRooms(null)).toEqual([])
    expect(tryParseRooms({ error: 'not found' })).toEqual([])
    expect(tryParseRooms({ name: 'Grand Hotel', city: 'Rome' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @ibe/shared test
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `board-normalizer.ts`**

Create `packages/shared/src/utils/ibe-extractors/board-normalizer.ts`:

```typescript
const BOARD_MAP: Record<string, 'RO' | 'BB' | 'HB' | 'FB' | 'AI'> = {
  'room only': 'RO', 'no meals': 'RO', 'accommodation only': 'RO', 'bed only': 'RO', 'room': 'RO',
  'bed & breakfast': 'BB', 'bed and breakfast': 'BB', 'b&b': 'BB', 'breakfast included': 'BB',
  'breakfast': 'BB', 'with breakfast': 'BB',
  'half board': 'HB', 'half-board': 'HB', 'demi-pension': 'HB',
  'full board': 'FB', 'full-board': 'FB', 'all meals': 'FB',
  'all inclusive': 'AI', 'all-inclusive': 'AI',
}

export function normaliseBoard(label: string): 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | null {
  const key = label.toLowerCase().trim()
  for (const [pattern, code] of Object.entries(BOARD_MAP)) {
    if (key.includes(pattern)) return code
  }
  return null
}
```

- [ ] **Step 4: Create `direct-book.ts`**

Create `packages/shared/src/utils/ibe-extractors/direct-book.ts`:

```typescript
export interface ParsedPropertyInfo {
  name: string
  starRating: number | null
  address: string | null
  city: string | null
  country: string | null
  description: string | null
  images: string[]
  amenities: string[]
}

export interface ParsedRate {
  boardLabel: string
  cancelText: string
  isNonRefundable: boolean
  pricePerNight: number | null
  total: number | null
  currency: string | null
}

export interface ParsedRoom {
  name: string
  description: string
  images: string[]
  amenities: string[]
  bedConfig: string | null
  rates: ParsedRate[]
}

function coerceStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function coerceNum(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n }
  return null
}

function coerceStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(x => coerceStr(x)).filter((s): s is string => s !== null)
}

function coerceImageUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((item): string[] => {
    if (typeof item === 'string' && item.startsWith('http')) return [item]
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const url = coerceStr(obj['url'] ?? obj['src'] ?? obj['uri'] ?? obj['original'] ?? obj['large'] ?? obj['medium'])
      return url && url.startsWith('http') ? [url] : []
    }
    return []
  }).slice(0, 20)
}

export function tryParsePropertyInfo(payload: unknown): ParsedPropertyInfo | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  const name = coerceStr(p['name'] ?? p['propertyName'] ?? p['hotelName'] ?? p['title'])
  if (name && (p['address'] || p['description'] || p['amenities'] || p['city'] || p['country'] || p['stars'] || p['starRating'])) {
    return {
      name,
      starRating: coerceNum(p['stars'] ?? p['starRating'] ?? p['rating'] ?? p['category']),
      address: coerceStr(p['address'] ?? p['streetAddress'] ?? p['addressLine1']),
      city: coerceStr(p['city'] ?? p['cityName'] ?? p['locality']),
      country: coerceStr(p['country'] ?? p['countryCode'] ?? p['countryName']),
      description: coerceStr(p['description'] ?? p['summary'] ?? p['overview'] ?? p['shortDescription']),
      images: coerceImageUrls(p['images'] ?? p['photos'] ?? p['gallery'] ?? p['media']),
      amenities: coerceStrArr(p['amenities'] ?? p['facilities'] ?? p['features'] ?? p['services']),
    }
  }
  for (const key of ['data', 'property', 'hotel', 'result', 'accommodation']) {
    const nested = p[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const result = tryParsePropertyInfo(nested)
      if (result) return result
    }
  }
  return null
}

function parseRateItem(item: unknown): ParsedRate | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const r = item as Record<string, unknown>
  const boardLabel = coerceStr(
    r['boardType'] ?? r['mealPlan'] ?? r['boardCode'] ?? r['meal'] ??
    r['name'] ?? r['rateName'] ?? r['planName'] ?? r['type']
  ) ?? ''
  const cancelText = coerceStr(
    r['cancellationPolicy'] ?? r['cancellation'] ?? r['refundPolicy'] ?? r['cancelPolicy']
  ) ?? ''
  const isNonRefundable =
    r['nonRefundable'] === true ||
    r['isNonRefundable'] === true ||
    r['refundable'] === false ||
    /non.?refund/i.test(cancelText) ||
    /non.?refund/i.test(coerceStr(r['name'] ?? '') ?? '')
  return {
    boardLabel,
    cancelText,
    isNonRefundable,
    pricePerNight: coerceNum(r['pricePerNight'] ?? r['price'] ?? r['rate'] ?? r['amount'] ?? r['baseRate']),
    total: coerceNum(r['total'] ?? r['totalPrice'] ?? r['totalAmount'] ?? r['grandTotal']),
    currency: coerceStr(r['currency'] ?? r['currencyCode']),
  }
}

function parseRoomItem(item: unknown): ParsedRoom | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const r = item as Record<string, unknown>
  const name = coerceStr(r['name'] ?? r['roomName'] ?? r['title'] ?? r['type'])
  if (!name) return null
  const rateArr: unknown[] = (
    Array.isArray(r['rates']) ? r['rates'] :
    Array.isArray(r['ratePlans']) ? r['ratePlans'] :
    Array.isArray(r['prices']) ? r['prices'] :
    Array.isArray(r['offers']) ? r['offers'] :
    Array.isArray(r['packages']) ? r['packages'] : []
  )
  return {
    name,
    description: coerceStr(r['description'] ?? r['summary'] ?? r['overview']) ?? '',
    images: coerceImageUrls(r['images'] ?? r['photos'] ?? r['gallery'] ?? r['media']),
    amenities: coerceStrArr(r['amenities'] ?? r['facilities'] ?? r['features']),
    bedConfig: coerceStr(r['bedConfiguration'] ?? r['bedding'] ?? r['bedType'] ?? r['beds']),
    rates: rateArr.map(parseRateItem).filter((x): x is ParsedRate => x !== null),
  }
}

export function tryParseRooms(payload: unknown): ParsedRoom[] {
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Record<string, unknown>
    if (
      coerceStr(first['name']) &&
      (first['rates'] || first['ratePlans'] || first['prices'] || first['offers'] || first['packages'])
    ) {
      return payload.map(parseRoomItem).filter((r): r is ParsedRoom => r !== null)
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>
    for (const key of ['rooms', 'roomTypes', 'accommodations', 'units', 'results', 'data', 'items', 'products']) {
      const v = p[key]
      if (Array.isArray(v) && v.length > 0) {
        const result = tryParseRooms(v)
        if (result.length > 0) return result
      }
    }
    for (const key of ['data', 'result', 'response']) {
      const nested = p[key]
      if (nested && typeof nested === 'object') {
        const result = tryParseRooms(nested)
        if (result.length > 0) return result
      }
    }
  }
  return []
}
```

- [ ] **Step 5: Create `index.ts` re-export**

Create `packages/shared/src/utils/ibe-extractors/index.ts`:

```typescript
export * from './board-normalizer.js'
export * from './direct-book.js'
```

- [ ] **Step 6: Add export to `packages/shared/src/index.ts`**

Add at the end of the Utils section:

```typescript
export * from './utils/ibe-extractors/index.js'
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
pnpm --filter @ibe/shared test
```

Expected: all tests PASS.

- [ ] **Step 8: Build shared package**

```bash
pnpm --filter @ibe/shared build
```

Expected: exits 0, `packages/shared/dist/` updated.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/utils/ibe-extractors/ packages/shared/src/__tests__/ibe-extractors.test.ts packages/shared/src/index.ts packages/shared/dist/
git commit -m "feat(shared): add ibe-extractors — normaliseBoard + direct-book parsers"
```

---

## Task 2: Add `beforeNavigate` to `withStealthPage` in onboarding-api

**Files:**
- Modify: `apps/onboarding-api/src/services/playwright-browser.service.ts`

- [ ] **Step 1: Add `beforeNavigate` option**

In `apps/onboarding-api/src/services/playwright-browser.service.ts`, change the function signature and add one call before `page.goto`:

```typescript
export async function withStealthPage<T>(
  url: string,
  fn: (page: Page) => Promise<T>,
  options?: { navigationTimeout?: number; idleTimeout?: number; beforeNavigate?: (page: Page) => void },
): Promise<T> {
  const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });
    await context.addInitScript(STEALTH_SCRIPT);
    const page = await context.newPage();
    options?.beforeNavigate?.(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.navigationTimeout ?? 30000 });
    await page.waitForLoadState('networkidle', { timeout: options?.idleTimeout ?? 15000 }).catch(() => {});
    return await fn(page);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
pnpm --filter @ibe/onboarding-api test
```

Expected: all existing tests PASS (the change is backwards-compatible — new option is optional).

- [ ] **Step 3: Commit**

```bash
git add apps/onboarding-api/src/services/playwright-browser.service.ts
git commit -m "feat(onboarding-api): add beforeNavigate option to withStealthPage"
```

---

## Task 3: Build `DirectBookHarvester`

**Files:**
- Create: `apps/onboarding-api/src/services/harvesters/direct-book-harvester.ts`
- Create: `apps/onboarding-api/src/services/__tests__/direct-book-harvester.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/onboarding-api/src/services/__tests__/direct-book-harvester.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../playwright-browser.service.js', () => ({ withStealthPage: vi.fn() }))
vi.mock('@ibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ibe/shared')>()
  return {
    ...actual,
    detectKnownIBE: vi.fn().mockReturnValue({
      name: 'direct-book.com',
      externalHotelId: 'test-hotel',
      searchTemplate: 'https://direct-book.com/properties/{externalHotelId}?locale=en&checkInDate={checkIn}&checkOutDate={checkOut}&items[0][adults]={adults}&items[0][children]=0&items[0][infants]=0&currency={currency}&trackPage=yes',
      bookingTemplate: 'https://direct-book.com/properties/{externalHotelId}/book?locale=en&checkInDate={checkIn}&checkOutDate={checkOut}&items[0][adults]={adults}&items[0][children]=0&items[0][infants]=0&items[0][rateId]={solutionId}&currency={currency}&trackPage=yes&selected=0&step=step1',
    }),
  }
})
vi.mock('../tax-lookup.service.js', () => ({
  lookupTaxes: vi.fn().mockReturnValue([{ name: 'VAT', amount: '10%', notes: null, source: 'lookup' }]),
}))

import { withStealthPage } from '../playwright-browser.service.js'
import { detectKnownIBE } from '@ibe/shared'
import { DirectBookHarvester } from '../harvesters/direct-book-harvester.js'

const CTX = { checkIn: '2026-06-15', checkOut: '2026-06-16' }

function makeMockPage(opts: {
  jsonResponses?: Array<{ url: string; json: unknown }>
  domRooms?: unknown[]
}) {
  const responseListeners: Array<(res: unknown) => void> = []
  return {
    on: (event: string, fn: (res: unknown) => void) => {
      if (event === 'response') responseListeners.push(fn)
    },
    waitForSelector: vi.fn().mockResolvedValue(null),
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
    evaluate: vi.fn().mockResolvedValue(opts.domRooms ?? []),
    $: vi.fn().mockResolvedValue(null),
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('DirectBookHarvester.harvest', () => {
  it('throws when URL is not recognised', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null)
    await expect(
      new DirectBookHarvester().harvest('https://other.com', CTX, () => {}),
    ).rejects.toThrow('Not a recognised direct-book.com URL')
  })

  it('extracts hotel info and rooms from intercepted JSON', async () => {
    const page = makeMockPage({
      jsonResponses: [
        {
          url: 'https://direct-book.com/api/property',
          json: { name: 'The Grand Hotel', stars: 4, city: 'Barcelona', country: 'Spain', description: 'Lovely', amenities: ['WiFi'], images: ['https://example.com/img.jpg'], address: '1 Via Test' },
        },
        {
          url: 'https://direct-book.com/api/availability',
          json: {
            rooms: [
              {
                name: 'Superior Room',
                description: 'Nice',
                images: [],
                amenities: ['TV'],
                rates: [
                  { boardType: 'Bed & Breakfast', cancellationPolicy: 'Free cancellation', nonRefundable: false, pricePerNight: 120, currency: 'EUR' },
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

    const result = await new DirectBookHarvester().harvest(
      'https://www.direct-book.com/properties/test-hotel',
      CTX,
      () => {},
    )

    expect(result.name).toBe('The Grand Hotel')
    expect(result.starRating).toBe(4)
    expect(result.city).toBe('Barcelona')
    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0]!.name).toBe('Superior Room')
    expect(result.discoveredRatePlanTypes).toHaveLength(2)
    expect(result.discoveredRatePlanTypes.find(r => r.boardCode === 'BB')).toBeDefined()
    expect(result.discoveredRatePlanTypes.find(r => r.boardCode === 'RO')).toBeDefined()
    const ro = result.discoveredRatePlanTypes.find(r => r.boardCode === 'RO')!
    expect(ro.hasNonRefundable).toBe(true)
    expect(ro.hasRefundable).toBe(false)
    expect(result.taxesAndFees[0]!.source).toBe('lookup')
  })

  it('deduplicates rooms and merges supported occupancies', async () => {
    let callCount = 0
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn, opts) => {
      callCount++
      const roomsJson = callCount <= 4
        ? {
            rooms: [{
              name: 'Standard Room',
              rates: [{ boardType: 'Room Only', cancellationPolicy: '', nonRefundable: false, pricePerNight: 80, currency: 'USD' }],
            }],
          }
        : {}
      const page = makeMockPage({ jsonResponses: [{ url: 'https://direct-book.com/api', json: roomsJson }] })
      opts?.beforeNavigate?.(page as any)
      return fn(page as any)
    })

    const result = await new DirectBookHarvester().harvest(
      'https://www.direct-book.com/properties/test-hotel',
      CTX,
      () => {},
    )

    expect(result.rooms).toHaveLength(1)
    expect(new Set(result.rooms.map(r => r.name)).size).toBe(1)
    expect(result.rooms[0]!.supportedOccupancies.length).toBeGreaterThan(1)
  })

  it('falls back to DOM evaluate when no JSON intercepted', async () => {
    const page = makeMockPage({ jsonResponses: [], domRooms: [] })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn, opts) => {
      opts?.beforeNavigate?.(page as any)
      return fn(page as any)
    })

    const result = await new DirectBookHarvester().harvest(
      'https://www.direct-book.com/properties/test-hotel',
      CTX,
      () => {},
    )

    expect(page.evaluate).toHaveBeenCalled()
    expect(Array.isArray(result.rooms)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @ibe/onboarding-api test -- direct-book-harvester
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `direct-book-harvester.ts`**

Create `apps/onboarding-api/src/services/harvesters/direct-book-harvester.ts`:

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
const OCCUPANCY_PATTERNS: [number, number][] = [
  [1, 0], [2, 0], [3, 0], [4, 0],
  [2, 1], [2, 2],
]

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function buildSearchUrl(
  template: string, hotelId: string,
  adults: number, children: number,
  checkIn: string, checkOut: string,
): string {
  return template
    .replace('{externalHotelId}', hotelId)
    .replace('{adults}', String(adults))
    .replace('{checkIn}', checkIn)
    .replace('{checkOut}', checkOut)
    .replace('{currency}', 'USD')
    .replace('items[0][children]=0', `items[0][children]=${children}`)
}

function makeResponseCollector(payloads: unknown[]) {
  return (res: PlaywrightResponse) => {
    if (
      res.url().includes('direct-book.com') &&
      (res.headers()['content-type'] ?? '').includes('json')
    ) {
      res.json().then((data) => payloads.push(data)).catch(() => {})
    }
  }
}

const DOM = {
  hotelName: 'h1, [class*="property-title"], [class*="PropertyTitle"], [class*="hotel-name"]',
  roomCard:  '[class*="room-card"], [class*="RoomCard"], [class*="accommodation-card"], [data-testid*="room"]',
  roomName:  'h3, h4, [class*="room-name"], [class*="RoomName"]',
  rateRow:   '[class*="rate-plan"], [class*="RatePlan"], [class*="price-plan"]',
  boardCell: '[class*="meal-plan"], [class*="MealPlan"], [class*="board"]',
  cancelCell:'[class*="cancel"], [class*="Cancel"], [class*="refund"]',
}

type HotelInfoResult = Omit<HarvestedHotelData, 'rooms' | 'discoveredRatePlanTypes' | 'agePolicy' | 'taxesAndFees'>

export class DirectBookHarvester implements IbeHarvester {
  async harvest(
    ibeUrl: string,
    ctx: HarvestContext,
    onProgress: (m: string) => void,
  ): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl)
    if (!detected) throw new Error('Not a recognised direct-book.com URL')
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
    const url = buildSearchUrl(template, hotelId, 2, 0, ctx.checkIn, ctx.checkOut)
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
            description: info.description,
            images: info.images,
            amenities: info.amenities,
            phone: null,
            email: null,
            website: `https://www.direct-book.com/properties/${hotelId}`,
            policies: [],
          }
        }
      }

      return page.evaluate((sel: typeof DOM, hId: string): HotelInfoResult => {
        const name = document.querySelector(sel.hotelName)?.textContent?.trim() ?? ''
        const imgs = Array.from(document.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
          .map(i => i.src)
          .filter(s => s.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(s))
          .slice(0, 20)
        const amenities = Array.from(
          document.querySelectorAll('[class*="amenity"] li, [class*="feature"] li'),
        ).map(el => (el as HTMLElement).textContent?.trim() ?? '').filter(Boolean).slice(0, 20)
        return {
          name, starRating: null, address: null, city: null, country: null,
          phone: null, email: null, website: `https://www.direct-book.com/properties/${hId}`,
          description: document.querySelector('[class*="description"]')?.textContent?.trim()?.slice(0, 500) ?? '',
          images: imgs, amenities, policies: [],
        }
      }, DOM, hotelId)
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

      for (const [adults, children] of OCCUPANCY_PATTERNS) {
        onProgress(`Searching ${adults}A${children > 0 ? `+${children}C` : ''} (${offsetDays}d out)...`)
        const searchUrl = buildSearchUrl(template, hotelId, adults, children, checkIn, checkOut)
        const parsed = await this.scrapeSearch(searchUrl)
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

        if (!foundNew) consecutiveEmpty++
        else consecutiveEmpty = 0
        if (consecutiveEmpty >= 3) break
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
pnpm --filter @ibe/onboarding-api test -- direct-book-harvester
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/harvesters/direct-book-harvester.ts \
        apps/onboarding-api/src/services/__tests__/direct-book-harvester.test.ts
git commit -m "feat(onboarding-api): DirectBookHarvester — JSON intercept + DOM fallback"
```

---

## Task 4: Update `SynXisHarvester` to use shared `normaliseBoard`

**Files:**
- Modify: `apps/onboarding-api/src/services/harvesters/synxis-harvester.ts`

- [ ] **Step 1: Replace inline `normaliseBoard` with shared import**

In `apps/onboarding-api/src/services/harvesters/synxis-harvester.ts`:

Add import at top (after existing imports):
```typescript
import { normaliseBoard } from '@ibe/shared'
```

Remove these lines (lines 25–40 approximately):
```typescript
const BOARD_NORM: Record<string, DiscoveredRatePlanType['boardCode']> = {
  'room only': 'RO', 'no meals': 'RO', 'accommodation only': 'RO', 'bed only': 'RO', 'room': 'RO',
  'bed & breakfast': 'BB', 'bed and breakfast': 'BB', 'b&b': 'BB', 'breakfast included': 'BB',
  'breakfast': 'BB', 'with breakfast': 'BB',
  'half board': 'HB', 'half-board': 'HB', 'demi-pension': 'HB',
  'full board': 'FB', 'full-board': 'FB', 'all meals': 'FB',
  'all inclusive': 'AI', 'all-inclusive': 'AI',
};

function normaliseBoard(label: string): DiscoveredRatePlanType['boardCode'] | null {
  const key = label.toLowerCase().trim();
  for (const [pattern, code] of Object.entries(BOARD_NORM)) {
    if (key.includes(pattern)) return code;
  }
  return null;
}
```

- [ ] **Step 2: Run all onboarding-api tests — verify nothing broken**

```bash
pnpm --filter @ibe/onboarding-api test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/onboarding-api/src/services/harvesters/synxis-harvester.ts
git commit -m "refactor(onboarding-api): use shared normaliseBoard in SynXisHarvester"
```

---

## Task 5: Register `DirectBookHarvester` in harvester map

**Files:**
- Modify: `apps/onboarding-api/src/services/ibe-harvester-map.ts`

- [ ] **Step 1: Add the mapping**

Replace the contents of `apps/onboarding-api/src/services/ibe-harvester-map.ts` with:

```typescript
import type { IbeHarvester } from './harvesters/types.js'
import { SynXisHarvester } from './harvesters/synxis-harvester.js'
import { DirectBookHarvester } from './harvesters/direct-book-harvester.js'

export const ibeHarvesterMap = new Map<string, IbeHarvester>([
  ['Sabre SynXis', new SynXisHarvester()],
  ['direct-book.com', new DirectBookHarvester()],
])
```

- [ ] **Step 2: Run all onboarding-api tests**

```bash
pnpm --filter @ibe/onboarding-api test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/onboarding-api/src/services/ibe-harvester-map.ts
git commit -m "feat(onboarding-api): register DirectBookHarvester for direct-book.com"
```

---

## Task 6: Add direct-book.com extractor to CompSet

**Files:**
- Modify: `apps/api/src/services/compset-collect.service.ts`

- [ ] **Step 1: Add import for shared utilities**

In `apps/api/src/services/compset-collect.service.ts`, add to the existing `@ibe/shared` import:

```typescript
import { detectKnownIBE, tryParseRooms, normaliseBoard } from '@ibe/shared'
```

(Replace the existing `import { detectKnownIBE } from '@ibe/shared'` line.)

- [ ] **Step 2: Add `extractDirectBookRates` function**

Add this function after `extractSentecRates` (before line `const IBE_EXTRACTORS`):

```typescript
async function extractDirectBookRates(page: Page, orgId: number | null): Promise<RoomRate[]> {
  // direct-book.com is a Next.js SPA — attempt to read embedded __NEXT_DATA__ state
  // which may contain availability data already fetched server-side.
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
          currency: rate.currency ?? 'USD',
        })
      }
    }
    if (rates.length > 0) return rates
  }

  return extractRatesWithAI(page, orgId)
}
```

- [ ] **Step 3: Register in `IBE_EXTRACTORS`**

Change:
```typescript
const IBE_EXTRACTORS: Record<string, RateExtractor> = {
  'sentec': extractSentecRates,
}
```

To:
```typescript
const IBE_EXTRACTORS: Record<string, RateExtractor> = {
  'sentec': extractSentecRates,
  'direct-book.com': extractDirectBookRates,
}
```

- [ ] **Step 4: Verify type-check passes**

```bash
pnpm --filter @ibe/api type-check
```

Expected: exits 0, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/compset-collect.service.ts
git commit -m "feat(api): add direct-book.com CompSet extractor using shared parsers"
```
