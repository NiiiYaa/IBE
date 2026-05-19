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

describe('encodeRateKey / decodeRateKey', () => {
  it('round-trips all fields', () => {
    const payload = { roomId: 42, ratePlanCode: 'RP001', sellAmount: 199.5, sellCurrency: 'USD' }
    expect(decodeRateKey(encodeRateKey(payload))).toEqual(payload)
  })
})

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
