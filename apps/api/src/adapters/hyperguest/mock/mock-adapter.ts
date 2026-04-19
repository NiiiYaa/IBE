/**
 * Mock HyperGuest adapter — activated when HYPERGUEST_MOCK=true.
 * Returns realistic data for property 19912 without any API calls.
 */

import type { HGPropertyStatic, HGSearchResponse, HGBookingResponse, SearchParams } from '@ibe/shared'
import { BookingStatus } from '@ibe/shared'
import { nightsBetween, toHyperGuestGuestsParam } from '@ibe/shared'
import { logger } from '../../../utils/logger.js'
import { MOCK_PROPERTY_STATIC, MOCK_PROPERTY_ID, buildMockSearchResponse } from './mock-data.js'
import type { CreateBookingInput } from '../booking.js'

export async function mockFetchPropertyStatic(propertyId: number): Promise<HGPropertyStatic> {
  logger.info({ propertyId }, '[MockAdapter] Returning mock static data')
  if (propertyId !== MOCK_PROPERTY_ID) {
    throw Object.assign(new Error('Property not found'), { httpStatus: 404 })
  }
  return MOCK_PROPERTY_STATIC
}

export async function mockSearchAvailability(params: SearchParams): Promise<HGSearchResponse> {
  const nights = nightsBetween(params.checkIn, params.checkOut)
  const guestsParam = toHyperGuestGuestsParam(params.rooms)
  logger.info({ propertyId: params.hotelId, checkIn: params.checkIn, nights }, '[MockAdapter] Returning mock search results')
  return buildMockSearchResponse(params.checkIn, nights, guestsParam)
}

let mockBookingCounter = 100000

export async function mockCreateBooking(input: CreateBookingInput): Promise<HGBookingResponse> {
  const bookingId = ++mockBookingCounter
  logger.info({ propertyId: input.propertyId, bookingId }, '[MockAdapter] Returning mock booking confirmation')

  return {
    content: {
      bookingId,
      status: BookingStatus.Confirmed,
      dates: { from: input.checkIn, to: input.checkOut },
      meta: input.meta ?? [],
      payment: {
        type: input.paymentMethod,
        chargeAmount: {
          price: input.rooms[0]?.expectedAmount ?? 0,
          currency: input.rooms[0]?.expectedCurrency ?? 'EUR',
        },
      },
      prices: {
        net: { price: input.rooms[0]?.expectedAmount ?? 0, currency: 'EUR', taxes: [] },
        sell: { price: input.rooms[0]?.expectedAmount ?? 0, currency: 'EUR', taxes: [] },
        commission: { price: 0, currency: 'EUR' },
        bar: { price: input.rooms[0]?.expectedAmount ?? 0, currency: 'EUR' },
        fees: [],
      },
      nightlyBreakdown: [],
      rooms: input.rooms.map((room, i) => ({
        itemId: bookingId * 10 + i,
        roomId: room.roomId ?? 31446,
        ratePlanId: 19080,
        roomCode: room.roomCode ?? 'STD',
        rateCode: room.rateCode,
        status: BookingStatus.Confirmed,
        board: 'BB' as never,
        cancellationPolicy: [],
        guests: room.guests.map((g, gi) => ({
          guestId: bookingId * 100 + i * 10 + gi,
          birthDate: g.birthDate,
          name: { first: g.firstName, last: g.lastName },
          contact: {
            address: 'N/A', city: 'N/A', country: g.country ?? 'N/A',
            nationality: g.country ?? 'N/A', email: g.email ?? 'N/A',
            phone: g.phone ?? 'N/A', state: 'N/A', zip: 'N/A',
          },
          title: g.title,
          age: 30,
        })),
        specialRequests: room.specialRequests ?? [],
        remarks: ['This is a mock booking. No real reservation has been made.'],
        reference: { property: `MOCK-${bookingId}` },
        propertyId: MOCK_PROPERTY_ID,
        prices: {
          net: { price: room.expectedAmount, currency: room.expectedCurrency, taxes: [] },
          sell: { price: room.expectedAmount, currency: room.expectedCurrency, taxes: [] },
          commission: { price: 0, currency: room.expectedCurrency },
          bar: { price: room.expectedAmount, currency: room.expectedCurrency },
          fees: [],
        },
        payment: {
          type: input.paymentMethod,
          chargeAmount: { price: room.expectedAmount, currency: room.expectedCurrency },
        },
        nightlyBreakdown: [],
        financialModel: { keys: [], type: 'default' },
      })),
      reference: { agency: input.agencyReference ?? '' },
      leadGuest: {
        guestId: bookingId * 1000,
        birthDate: input.leadGuest.birthDate,
        name: { first: input.leadGuest.firstName, last: input.leadGuest.lastName },
        contact: {
          address: 'N/A', city: 'N/A',
          country: input.leadGuest.country ?? 'N/A',
          nationality: input.leadGuest.country ?? 'N/A',
          email: input.leadGuest.email ?? 'N/A',
          phone: input.leadGuest.phone ?? 'N/A',
          state: 'N/A', zip: 'N/A',
        },
        title: input.leadGuest.title,
        age: 30,
      },
      transactions: [],
      propertyId: MOCK_PROPERTY_ID,
    },
    financialModel: { keys: [], type: 'default' },
    timestamp: new Date().toISOString(),
  }
}
