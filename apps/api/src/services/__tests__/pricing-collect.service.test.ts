import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))
vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
    dailyRate: { upsert: vi.fn() },
  },
}))

import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { prisma } from '../../db/client.js'

const mockSearch = searchAvailability as ReturnType<typeof vi.fn>
const mockPrisma = prisma as unknown as { property: { findUnique: ReturnType<typeof vi.fn> }; dailyRate: { upsert: ReturnType<typeof vi.fn> } }

function makeHGResponse(nights: number, basePrice = 100, currency = 'USD') {
  return {
    results: [{
      propertyId: 1,
      propertyInfo: { name: 'Test', starRating: 4, cityName: 'City', countryCode: 'TH', latitude: 0, longitude: 0 },
      remarks: [],
      rooms: [{
        roomId: 1, roomTypeCode: 'STD', roomName: 'Standard',
        numberOfAvailableRooms: 5,
        settings: { maxOccupancy: 2, maxAdultsNumber: 2, maxChildrenNumber: 1, roomSize: 30, beddingConfigurations: [] },
        ratePlans: [{
          ratePlanId: 1, ratePlanCode: 'BB', ratePlanName: 'Bed & Breakfast',
          board: 'BB', cancellationPolicies: [], remarks: [],
          ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: 'BB', isPromotion: false, isPrivate: false },
          payment: { charge: 'agent', chargeType: 'prepaid', chargeAmount: { price: basePrice * nights, currency } },
          isImmediate: true,
          prices: {
            net: { price: basePrice * nights * 0.8, currency, taxes: [] },
            sell: { price: basePrice * nights, currency, taxes: [] },
            bar: { price: basePrice * nights, currency },
            commission: { price: 0, currency },
            fees: [],
          },
          nightlyBreakdown: Array.from({ length: nights }, (_, i) => {
            const d = new Date('2026-05-22')
            d.setDate(d.getDate() + i)
            return {
              date: d.toISOString().slice(0, 10),
              prices: {
                net: { price: basePrice * 0.8, currency, taxes: [] },
                sell: { price: basePrice, currency, taxes: [] },
                bar: { price: basePrice, currency },
                commission: { price: 0, currency },
                fees: [],
              },
            }
          }),
        }],
      }],
    }],
  }
}

describe('collectHotelPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 1, propertyId: 1 })
    mockPrisma.dailyRate.upsert.mockResolvedValue({})
  })

  it('calls searchAvailability in 29-day windows covering 365 days', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    // 12 full windows of 29 days + 1 final window of 17 = 13 calls total
    expect(mockSearch).toHaveBeenCalledTimes(13)
  })

  it('upserts a DailyRate row for each night', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    expect(mockPrisma.dailyRate.upsert).toHaveBeenCalledTimes(365)
  })

  it('marks nights as unavailable when search returns no rates for them', async () => {
    const response = makeHGResponse(29)
    // Remove nightlyBreakdown for first night to simulate unavailability
    response.results[0]!.rooms[0]!.ratePlans[0]!.nightlyBreakdown =
      response.results[0]!.rooms[0]!.ratePlans[0]!.nightlyBreakdown.slice(1)
    mockSearch.mockResolvedValueOnce(response)
    mockSearch.mockResolvedValue(makeHGResponse(29))

    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    const firstCall = mockPrisma.dailyRate.upsert.mock.calls[0]![0]
    expect(firstCall.create.available).toBe(false)
  })
})
