import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HGSearchResponse } from '@ibe/shared'

// Mock adapters and DB
vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))

vi.mock('../../db/client.js', () => ({
  prisma: { searchSession: { create: vi.fn().mockResolvedValue({ id: 'test-session' }) } },
}))

vi.mock('@paralleldrive/cuid2', () => ({ createId: () => 'test-cuid' }))

const mockHGResponse: HGSearchResponse = {
  results: [
    {
      propertyId: 19912,
      propertyInfo: {
        name: 'Certification Property',
        starRating: 4,
        cityName: 'Springfield',
        cityId: 7392,
        countryName: 'United States',
        countryCode: 'US',
        regionName: '',
        regionCode: '',
        longitude: -72.596,
        latitude: 42.1107,
        propertyType: 11,
        propertyTypeName: 'Hotel',
      },
      remarks: [],
      rooms: [
        {
          searchedPax: { adults: 2, children: [] },
          roomId: 1234,
          roomTypeCode: 'SGL',
          roomName: 'Single Room',
          numberOfAvailableRooms: 3,
          settings: {
            numberOfBedrooms: 1,
            roomSize: 46,
            maxAdultsNumber: 2,
            maxChildrenNumber: 1,
            maxInfantsNumber: 0,
            maxOccupancy: 3,
            numberOfBeds: 1,
            beddingConfigurations: [{ type: 'Double', size: null, quantity: 1 }],
          },
          ratePlans: [
            {
              ratePlanCode: 'BAR',
              ratePlanId: 19080,
              ratePlanName: 'Standard',
              ratePlanInfo: {
                virtual: false,
                contracts: [],
                originalRatePlanCode: '',
                isPromotion: false,
                isPackageRate: false,
                isPrivate: false,
              },
              board: 'BB' as never,
              remarks: [],
              cancellationPolicies: [
                {
                  daysBefore: 1,
                  penaltyType: 'nights' as never,
                  amount: 0,
                  timeSetting: { timeFromCheckIn: 24, timeFromCheckInType: 'hours' as never },
                  cancellationDeadlineHour: '12:00',
                },
              ],
              payment: {
                charge: 'customer' as never,
                chargeType: 'net' as never,
                chargeAmount: { price: 200, currency: 'EUR' },
              },
              prices: {
                net: { price: 200, currency: 'EUR', taxes: [] },
                sell: { price: 250, currency: 'EUR', taxes: [] },
                commission: { price: 25, currency: 'EUR' },
                bar: { price: 250, currency: 'EUR' },
                fees: [],
              },
              nightlyBreakdown: [
                {
                  date: '2024-06-01',
                  prices: {
                    net: { price: 200, currency: 'EUR', taxes: [] },
                    sell: { price: 250, currency: 'EUR', taxes: [] },
                    commission: { price: 25, currency: 'EUR' },
                    bar: { price: 250, currency: 'EUR' },
                    fees: [],
                  },
                },
              ],
              isImmediate: true,
            },
          ],
        },
      ],
    },
  ],
}

describe('search service', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('transforms HyperGuest response into IBE SearchResponse shape', async () => {
    const { searchAvailability } = await import('../../adapters/hyperguest/search.js')
    vi.mocked(searchAvailability).mockResolvedValueOnce(mockHGResponse)

    const { search } = await import('../search.service.js')
    const result = await search({
      hotelId: 19912,
      checkIn: '2024-06-01',
      checkOut: '2024-06-02',
      rooms: [{ adults: 2 }],
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.propertyId).toBe(19912)
    expect(result.results[0]!.rooms).toHaveLength(1)
    expect(result.results[0]!.rooms[0]!.rates).toHaveLength(1)
  })

  it('maps board label correctly', async () => {
    const { searchAvailability } = await import('../../adapters/hyperguest/search.js')
    vi.mocked(searchAvailability).mockResolvedValueOnce(mockHGResponse)

    const { search } = await import('../search.service.js')
    const result = await search({
      hotelId: 19912,
      checkIn: '2024-06-01',
      checkOut: '2024-06-02',
      rooms: [{ adults: 2 }],
    })

    const rate = result.results[0]!.rooms[0]!.rates[0]!
    expect(rate.boardLabel).toBe('Bed & Breakfast')
    expect(rate.board).toBe('BB')
  })

  it('includes searchId in response', async () => {
    const { searchAvailability } = await import('../../adapters/hyperguest/search.js')
    vi.mocked(searchAvailability).mockResolvedValueOnce(mockHGResponse)

    const { search } = await import('../search.service.js')
    const result = await search({
      hotelId: 19912,
      checkIn: '2024-06-01',
      checkOut: '2024-06-02',
      rooms: [{ adults: 2 }],
    })

    expect(typeof result.searchId).toBe('string')
    expect(result.nights).toBe(1)
  })
})
