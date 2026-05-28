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
  domHotelInfo?: Record<string, unknown>
}) {
  const responseListeners: Array<(res: unknown) => void> = []
  // fetchHotelInfo calls waitForSelector then evaluate; scrapeSearch never calls waitForSelector.
  // Track whether the *pending* evaluate is for hotel info (set by waitForSelector, consumed by evaluate).
  let pendingHotelInfoEval = false
  const defaultHotelInfo = opts.domHotelInfo ?? {
    name: 'DOM Hotel', starRating: null, address: null, city: 'DOM City',
    country: 'DOM Country', phone: null, email: null,
    website: 'https://www.direct-book.com/properties/test-hotel',
    description: 'DOM description', images: [], amenities: [], policies: [],
  }
  return {
    on: (event: string, fn: (res: unknown) => void) => {
      if (event === 'response') responseListeners.push(fn)
    },
    waitForSelector: vi.fn().mockImplementation(async () => {
      pendingHotelInfoEval = true
      return null
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
      // Consume the flag: if waitForSelector was called since last evaluate, this is hotel-info DOM fallback.
      // Otherwise it's a scrapeSearch DOM fallback (returns ParsedRoom[]).
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
    expect(result.name).toBe('DOM Hotel')
    expect(result.city).toBe('DOM City')
    expect(Array.isArray(result.rooms)).toBe(true)
  })
})
