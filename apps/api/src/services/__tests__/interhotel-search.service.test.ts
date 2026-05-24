import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../interhotel-config.service.js', () => ({
  resolveEffectiveInterHotelConfig: vi.fn(),
}))
vi.mock('../interhotel-nearby.service.js', () => ({
  getNearbyHotels: vi.fn(),
}))
vi.mock('../../db/client.js', () => ({
  prisma: { property: { findUnique: vi.fn() } },
}))
vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))
vi.mock('../search.service.js', () => ({
  search: vi.fn(),
}))
vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

import { resolveEffectiveInterHotelConfig } from '../interhotel-config.service.js'
import { getNearbyHotels } from '../interhotel-nearby.service.js'
import { prisma } from '../../db/client.js'
import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { search } from '../search.service.js'

const mockConfig = vi.mocked(resolveEffectiveInterHotelConfig)
const mockNearby = vi.mocked(getNearbyHotels)
const mockPrisma = prisma as any
const mockSearch = vi.mocked(search)
const mockAvailability = vi.mocked(searchAvailability)

const BASE_CONFIG = {
  enabled: true, maxRadiusKm: 50, maxHotels: 3,
  transferType: 'hotel' as const, sponsoredAmount: 0, sponsoredCurrency: 'USD',
  discountEnabled: false, discountPercent: 0, incentiveEnabled: false, incentivePackageId: null,
}

// Build a minimal SearchResponse that matches the real SearchResponse type.
// PropertySearchResult.rooms contains RoomOption[], each with rates: RateOption[].
// We only need the shape confirmSegment uses: rooms.length > 0 and rooms[0].rates[0].prices.sell.
const makeSearchResponse = (propertyId: number, hotelName: string, minPrice: number) => ({
  results: [{
    propertyId,
    propertyName: hotelName,
    starRating: 4,
    cityName: 'TestCity',
    countryCode: 'US',
    latitude: 0,
    longitude: 0,
    remarks: [],
    rooms: [{
      roomId: 1,
      roomTypeCode: 'STD',
      roomName: 'Standard Room',
      availableCount: 5,
      maxOccupancy: 2,
      maxAdults: 2,
      maxChildren: 0,
      roomSizeM2: 25,
      bedding: [],
      requestedRoomIndex: 0,
      rates: [{
        ratePlanId: 1,
        ratePlanCode: 'BAR',
        ratePlanName: 'Best Available',
        board: 'RO',
        boardLabel: 'Room Only',
        isRefundable: true,
        cancellationDeadlines: [],
        remarks: [],
        prices: {
          net: { amount: minPrice * 0.85, currency: 'EUR', taxes: [] },
          sell: { amount: minPrice, currency: 'EUR', taxes: [] },
          bar: { amount: minPrice, currency: 'EUR' },
          fees: [],
        },
        nightlyBreakdown: [],
        isImmediate: true,
        chargeParty: 'agent' as const,
        isPromotion: false,
        isPrivate: false,
      }],
    }],
  }],
  searchId: 'test-id',
  currency: 'EUR',
  checkIn: '2026-06-01',
  checkOut: '2026-06-05',
  nights: 4,
})

// Build a minimal HGSearchResponse. searchAvailability returns HGSearchResponse.
// confirmSegment checks results[0].rooms.length > 0 via the search() mock,
// but for the binary-search probe we just need rooms: [] or rooms: [{}].
const makeHGResponse = (hasRooms: boolean) => ({
  results: [{ rooms: hasRooms ? [{}] : [] }],
})

beforeEach(() => { vi.clearAllMocks() })

describe('searchInterHotel', () => {
  it('returns empty packages when feature disabled', async () => {
    mockConfig.mockResolvedValue({ ...BASE_CONFIG, enabled: false })
    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })
    expect(result.packages).toHaveLength(0)
  })

  it('returns empty packages when totalNights < 2', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-02', rooms: [{ adults: 2 }],
    })
    expect(result.packages).toHaveLength(0)
  })

  it('returns empty packages when no nearby hotels', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([])
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })
    expect(result.packages).toHaveLength(0)
  })

  it('returns empty packages when binary search finds no split for Hotel A', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([{ nearbyPropertyId: 2, distanceKm: 10 }])
    mockPrisma.property.findUnique
      .mockResolvedValueOnce({ organizationId: 5 })  // primary property
      .mockResolvedValueOnce({ status: 'active', organizationId: 5 })  // nearby filter

    // Binary search: lo=1, hi=3. mid=2 → NO, mid=1 → NO. No split found.
    mockAvailability
      .mockResolvedValueOnce(makeHGResponse(false) as any)  // mid=2: NO
      .mockResolvedValueOnce(makeHGResponse(false) as any)  // mid=1: NO

    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })
    expect(result.packages).toHaveLength(0)
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('returns a 2-hotel package when Hotel A has partial availability and Hotel B covers the rest', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([{ nearbyPropertyId: 2, distanceKm: 10 }])
    // findUnique calls: primary property, then nearby property filter
    mockPrisma.property.findUnique
      .mockResolvedValueOnce({ organizationId: 5 })   // primary property
      .mockResolvedValueOnce({ status: 'active', organizationId: 5 })  // nearby property filter

    // 4-night stay (2026-06-01 to 2026-06-05)
    // Binary search: lo=1, hi=3
    // Round 1: mid=2. Hotel A has rooms for checkIn→checkIn+2 days: YES → best=2, lo=3
    // Round 2: mid=3. Hotel A has rooms for checkIn→checkIn+3 days: NO → hi=2
    // Loop ends (lo=3 > hi=2). splitNights=2, splitDate='2026-06-03'
    mockAvailability
      .mockResolvedValueOnce(makeHGResponse(true) as any)   // mid=2: YES
      .mockResolvedValueOnce(makeHGResponse(false) as any)  // mid=3: NO

    // Confirm Hotel A [checkIn, splitDate], then Hotel B [splitDate, checkOut]
    mockSearch
      .mockResolvedValueOnce(makeSearchResponse(1, 'Hotel A', 300) as any)
      .mockResolvedValueOnce(makeSearchResponse(2, 'Hotel B', 200) as any)

    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })

    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]!.segments).toHaveLength(2)
    expect(result.packages[0]!.segments[0]!.result.propertyId).toBe(1)
    expect(result.packages[0]!.segments[1]!.result.propertyId).toBe(2)
    expect(result.packages[0]!.transferType).toBe('hotel')
    expect(result.packages[0]!.totalFromPrice).toBe(500)
    expect(result.packages[0]!.currency).toBe('EUR')
  })

  it('skips nearby hotels that are inactive or belong to a different org', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([
      { nearbyPropertyId: 2, distanceKm: 5 },
      { nearbyPropertyId: 3, distanceKm: 10 },
    ])
    mockPrisma.property.findUnique
      .mockResolvedValueOnce({ organizationId: 5 })   // primary property
      .mockResolvedValueOnce({ status: 'inactive', organizationId: 5 }) // hotel 2: inactive
      .mockResolvedValueOnce({ status: 'active', organizationId: 99 }) // hotel 3: different org

    // With no valid nearby hotels, binary search should not be called at all
    // because the filtered list is empty
    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })
    expect(result.packages).toHaveLength(0)
    expect(mockAvailability).not.toHaveBeenCalled()
  })

  it('excludes nearby hotel if its interhotel config is disabled', async () => {
    // primary hotel: enabled; nearby hotel: disabled
    mockConfig
      .mockResolvedValueOnce(BASE_CONFIG)                          // primary hotel config
      .mockResolvedValueOnce({ ...BASE_CONFIG, enabled: false })   // nearby hotel config (disabled)
    mockNearby.mockResolvedValue([{ nearbyPropertyId: 2, distanceKm: 10 }])
    mockPrisma.property.findUnique
      .mockResolvedValueOnce({ organizationId: 5 })                // primary property
      .mockResolvedValueOnce({ status: 'active', organizationId: 5 }) // nearby: active + same org

    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })
    // Nearby hotel excluded (interhotel disabled) → no candidates → empty packages
    expect(result.packages).toHaveLength(0)
    expect(mockAvailability).not.toHaveBeenCalled()
  })

  it('returns empty when Hotel B has no availability for the remaining segment', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([{ nearbyPropertyId: 2, distanceKm: 10 }])
    mockPrisma.property.findUnique
      .mockResolvedValueOnce({ organizationId: 5 })
      .mockResolvedValueOnce({ status: 'active', organizationId: 5 })

    // Hotel A binary search: mid=2 YES, mid=3 NO → split at 2
    mockAvailability
      .mockResolvedValueOnce(makeHGResponse(true) as any)
      .mockResolvedValueOnce(makeHGResponse(false) as any)

    // Confirm Hotel A succeeds, Hotel B returns no rooms
    const emptyResponse = {
      ...makeSearchResponse(2, 'Hotel B', 200),
      results: [{ ...makeSearchResponse(2, 'Hotel B', 200).results[0]!, rooms: [] }],
    }
    mockSearch
      .mockResolvedValueOnce(makeSearchResponse(1, 'Hotel A', 300) as any)
      .mockResolvedValueOnce(emptyResponse as any)

    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }],
    })
    expect(result.packages).toHaveLength(0)
  })
})
