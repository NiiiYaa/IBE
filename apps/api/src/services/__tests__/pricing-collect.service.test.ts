import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))
vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
    dailyRate: { upsert: vi.fn() },
    dailyRateOffer: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))
vi.mock('../pricing-config.service.js', () => ({
  resolveEffectivePricingConfig: vi.fn(),
}))

import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { prisma } from '../../db/client.js'
import { resolveEffectivePricingConfig } from '../pricing-config.service.js'
import { todayIso } from '@ibe/shared'

const mockSearch = searchAvailability as ReturnType<typeof vi.fn>
const mockPrisma = prisma as unknown as {
  property: { findUnique: ReturnType<typeof vi.fn> }
  dailyRate: { upsert: ReturnType<typeof vi.fn> }
  dailyRateOffer: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
}

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
            const base = new Date(todayIso())
            base.setDate(base.getDate() + i)
            return {
              date: base.toISOString().slice(0, 10),
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

describe('deriveCancellationLabel', () => {
  it('returns Free when policies array is empty', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    expect(deriveCancellationLabel([])).toBe('Free')
  })

  it('returns Free when all policy amounts are 0', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 7, penaltyType: 'currency' as const, amount: 0, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
    ]
    expect(deriveCancellationLabel(policies)).toBe('Free')
  })

  it('returns Non-refundable when all policy amounts are > 0', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 0, penaltyType: 'currency' as const, amount: 100, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
    ]
    expect(deriveCancellationLabel(policies)).toBe('Non-refundable')
  })

  it('returns Partial when some amounts are 0 and some are > 0', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 7, penaltyType: 'currency' as const, amount: 0, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
      { daysBefore: 0, penaltyType: 'currency' as const, amount: 100, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
    ]
    expect(deriveCancellationLabel(policies)).toBe('Partial')
  })
})

describe('offer collection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mockPrisma.dailyRate.upsert.mockResolvedValue({})
    mockPrisma.dailyRateOffer.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.dailyRateOffer.createMany.mockResolvedValue({ count: 0 })
  })

  it('calls dailyRateOffer.deleteMany and createMany for each window', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    expect(mockPrisma.dailyRateOffer.deleteMany).toHaveBeenCalledTimes(13)
    expect(mockPrisma.dailyRateOffer.createMany).toHaveBeenCalledTimes(13)
  })

  it('writes rank-1 offer details into dailyRateOffer.createMany', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(1))
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // Find any createMany call that has a rank:1 entry and verify its offer fields
    const allRows = mockPrisma.dailyRateOffer.createMany.mock.calls
      .flatMap((call: [{ data: Array<{ rank: number; roomName: string; board: string; cancellationLabel: string }> }]) => call[0].data)
    const rank1 = allRows.find((r) => r.rank === 1)
    expect(rank1?.roomName).toBe('Standard')
    expect(rank1?.board).toBe('BB')
    expect(rank1?.cancellationLabel).toBe('Free')
  })

  it('caps stored offers at maxOffersForAnalysis', async () => {
    // Response with 3 rate plans (3 different offers per date)
    const response = makeHGResponse(1)
    response.results[0]!.rooms[0]!.ratePlans = [
      ...response.results[0]!.rooms[0]!.ratePlans,
      {
        ...response.results[0]!.rooms[0]!.ratePlans[0]!,
        ratePlanId: 2, ratePlanCode: 'RO', ratePlanName: 'Room Only', board: 'RO',
        prices: {
          ...response.results[0]!.rooms[0]!.ratePlans[0]!.prices,
          sell: { price: response.results[0]!.rooms[0]!.ratePlans[0]!.prices.sell.price * 1.1, currency: 'USD', taxes: [] },
        },
        nightlyBreakdown: response.results[0]!.rooms[0]!.ratePlans[0]!.nightlyBreakdown.map(n => ({
          ...n, prices: { ...n.prices, sell: { price: n.prices.sell.price * 1.1, currency: 'USD', taxes: [] } },
        })),
      },
      {
        ...response.results[0]!.rooms[0]!.ratePlans[0]!,
        ratePlanId: 3, ratePlanCode: 'HB', ratePlanName: 'Half Board', board: 'HB',
        prices: {
          ...response.results[0]!.rooms[0]!.ratePlans[0]!.prices,
          sell: { price: response.results[0]!.rooms[0]!.ratePlans[0]!.prices.sell.price * 1.2, currency: 'USD', taxes: [] },
        },
        nightlyBreakdown: response.results[0]!.rooms[0]!.ratePlans[0]!.nightlyBreakdown.map(n => ({
          ...n, prices: { ...n.prices, sell: { price: n.prices.sell.price * 1.2, currency: 'USD', taxes: [] } },
        })),
      },
    ]
    mockSearch.mockResolvedValue(response)
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 2, // cap at 2, response has 3 offers
      highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // Find the createMany call that has offers for the date (rank 1 and 2 only, not rank 3)
    const allRows = mockPrisma.dailyRateOffer.createMany.mock.calls
      .flatMap((call: [{ data: Array<{ rank: number }> }]) => call[0].data)
    const ranksForDate = allRows.map((r: { rank: number }) => r.rank)
    expect(ranksForDate).toContain(1)
    expect(ranksForDate).toContain(2)
    expect(ranksForDate).not.toContain(3)
  })

  it('does not call dailyRateOffer.deleteMany when search window fails', async () => {
    mockSearch.mockRejectedValueOnce(new Error('HG timeout')) // first window fails
    mockSearch.mockResolvedValue(makeHGResponse(29)) // rest succeed
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // 13 windows total, 1 failed — deleteMany called only 12 times (not 13)
    expect(mockPrisma.dailyRateOffer.deleteMany).toHaveBeenCalledTimes(12)
    expect(mockPrisma.dailyRateOffer.createMany).toHaveBeenCalledTimes(12)
  })
})

describe('collectHotelPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 1, propertyId: 1 })
    mockPrisma.dailyRate.upsert.mockResolvedValue({})
    mockPrisma.dailyRateOffer.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.dailyRateOffer.createMany.mockResolvedValue({ count: 0 })
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
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
