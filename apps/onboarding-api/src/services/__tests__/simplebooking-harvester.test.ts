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
