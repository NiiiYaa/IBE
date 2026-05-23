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
import { todayIso, CancellationPenaltyType } from '@ibe/shared'

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
  const futureCheckIn = '2099-12-31'
  const pastCheckIn = '2000-01-01'

  it('returns Non-refundable when policies array is empty', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    expect(deriveCancellationLabel([], futureCheckIn)).toBe('Non-refundable')
  })

  it('returns Free when a policy deadline is in the future', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    // 7-day free cancel window: penalty starts 7 days before check-in, deadline is far in future
    const policies = [
      { daysBefore: 7, penaltyType: CancellationPenaltyType.Currency, amount: 100, timeSetting: { timeFromCheckIn: 7, timeFromCheckInType: 'days' as const } },
    ]
    expect(deriveCancellationLabel(policies, futureCheckIn)).toBe('Free')
  })

  it('returns Non-refundable when all policy deadlines are in the past', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 7, penaltyType: CancellationPenaltyType.Currency, amount: 100, timeSetting: { timeFromCheckIn: 7, timeFromCheckInType: 'days' as const } },
    ]
    expect(deriveCancellationLabel(policies, pastCheckIn)).toBe('Non-refundable')
  })

  it('returns Non-refundable when policies have no timeSetting', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 0, penaltyType: CancellationPenaltyType.Currency, amount: 100, timeSetting: null as unknown as { timeFromCheckIn: number; timeFromCheckInType: 'hours' } },
    ]
    expect(deriveCancellationLabel(policies, futureCheckIn)).toBe('Non-refundable')
  })

  it('returns Free when earliest penalty is in the future (multi-policy: timeFromCheckIn 0 + 7)', async () => {
    // Real HG structure: [{ tfi:0, 100% at checkIn }, { tfi:7, 1-night within 7 days }]
    // Far-future checkIn: earliest penalty (7-day window) hasn't opened yet → Free
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 0, penaltyType: CancellationPenaltyType.Percent, amount: 100, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'days' as const } },
      { daysBefore: 7, penaltyType: CancellationPenaltyType.Nights, amount: 1, timeSetting: { timeFromCheckIn: 7, timeFromCheckInType: 'days' as const } },
    ]
    expect(deriveCancellationLabel(policies, futureCheckIn)).toBe('Free')
  })

  it('returns Non-refundable when earliest penalty already passed (multi-policy: timeFromCheckIn 0 + 7)', async () => {
    // Same structure but checkIn is in the past: earliest penalty (7-day window) already triggered → NR
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 0, penaltyType: CancellationPenaltyType.Percent, amount: 100, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'days' as const } },
      { daysBefore: 7, penaltyType: CancellationPenaltyType.Nights, amount: 1, timeSetting: { timeFromCheckIn: 7, timeFromCheckInType: 'days' as const } },
    ]
    expect(deriveCancellationLabel(policies, pastCheckIn)).toBe('Non-refundable')
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
      weekendDays: [0, 6],
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // 2 lead windows + 13 regular 29-day windows = 15 total
    expect(mockPrisma.dailyRateOffer.deleteMany).toHaveBeenCalledTimes(15)
    expect(mockPrisma.dailyRateOffer.createMany).toHaveBeenCalledTimes(15)
  })

  it('writes rank-1 offer details into dailyRateOffer.createMany', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(1))
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
      weekendDays: [0, 6],
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // Find any createMany call that has a rank:1 entry and verify its offer fields
    const allRows = (mockPrisma.dailyRateOffer.createMany.mock.calls as Array<[{ data: Array<{ rank: number; roomName: string; board: string; cancellationLabel: string }> }]>)
      .flatMap(call => call[0].data)
    const rank1 = allRows.find((r) => r.rank === 1)
    expect(rank1?.roomName).toBe('Standard')
    expect(rank1?.board).toBe('BB')
    expect(rank1?.cancellationLabel).toBe('Non-refundable')
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
      weekendDays: [0, 6],
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // Find the createMany call that has offers for the date (rank 1 and 2 only, not rank 3)
    const allRows = (mockPrisma.dailyRateOffer.createMany.mock.calls as Array<[{ data: Array<{ rank: number }> }]>)
      .flatMap(call => call[0].data)
    const ranksForDate = allRows.map(r => r.rank)
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
      weekendDays: [0, 6],
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // 15 windows total, 1 failed — deleteMany called only 14 times (not 15)
    expect(mockPrisma.dailyRateOffer.deleteMany).toHaveBeenCalledTimes(14)
    expect(mockPrisma.dailyRateOffer.createMany).toHaveBeenCalledTimes(14)
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
      weekendDays: [0, 6],
    })
  })

  it('calls searchAvailability with the custom lead windows then 29-day windows', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    // 2 lead windows (size 1 + size 6) + 13 regular 29-day windows = 15 total
    expect(mockSearch).toHaveBeenCalledTimes(15)
  })

  it('upserts a DailyRate row for each collected night', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    // 365 nights: offset 0-1 (2) + offset 2-7 (6) + offset 8-364 (357)
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
