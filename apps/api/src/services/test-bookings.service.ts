import { searchAvailability } from '../adapters/hyperguest/search.js'
import { createBooking, cancelBooking as hgCancelBooking } from '../adapters/hyperguest/booking.js'
import { GuestTitle, BookingStatus, PaymentFlow } from '@ibe/shared'
import type { HGCancellationPolicy, TestBookingRateResult, TestBookingBookResponse } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

interface RateKeyPayload {
  roomId: number
  ratePlanCode: string
  sellAmount: number
  sellCurrency: string
}

export function encodeRateKey(payload: RateKeyPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export function decodeRateKey(key: string): RateKeyPayload {
  return JSON.parse(Buffer.from(key, 'base64').toString('utf-8')) as RateKeyPayload
}

function isRefundable(policies: HGCancellationPolicy[]): boolean {
  if (policies.length === 0) return true
  return policies.every(p => p.amount === 0)
}

const TEST_LEAD_GUEST = {
  title: GuestTitle.Mr,
  firstName: 'Test',
  lastName: 'Guest',
  birthDate: '1990-01-01',
  email: 'test@hyperguest.com',
  phone: '+10000000000',
}

export async function searchForTestBooking(params: {
  propertyId: number
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}): Promise<TestBookingRateResult[]> {
  const nights = Math.round((Date.parse(params.checkOut) - Date.parse(params.checkIn)) / 86_400_000)

  const hgResponse = await searchAvailability({
    hotelId: params.propertyId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    rooms: [{ adults: params.adults, childAges: params.childrenAges.length > 0 ? params.childrenAges : undefined }],
  })

  const rates: TestBookingRateResult[] = []

  for (const property of hgResponse.results) {
    for (const room of property.rooms) {
      for (const rp of room.ratePlans) {
        const sellAmount = rp.prices.sell.price
        const sellCurrency = rp.prices.sell.currency
        const pricePerNight = nights > 0 ? Math.round((sellAmount / nights) * 100) / 100 : sellAmount

        rates.push({
          rateKey: encodeRateKey({ roomId: room.roomId, ratePlanCode: rp.ratePlanCode, sellAmount, sellCurrency }),
          roomName: room.roomName,
          board: rp.board,
          cancellationPolicy: isRefundable(rp.cancellationPolicies) ? 'R' : 'NR',
          pricePerNight,
          totalPrice: sellAmount,
          currency: sellCurrency,
        })
      }
    }
  }

  logger.info({ propertyId: params.propertyId, rateCount: rates.length }, '[TestBookings] Search complete')
  return rates
}

export async function createTestBooking(params: {
  propertyId: number
  rateKey: string
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}): Promise<TestBookingBookResponse> {
  const { roomId, ratePlanCode, sellAmount, sellCurrency } = decodeRateKey(params.rateKey)

  const hgResponse = await createBooking({
    propertyId: params.propertyId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    leadGuest: TEST_LEAD_GUEST,
    rooms: [{
      roomId,
      rateCode: ratePlanCode,
      expectedAmount: sellAmount,
      expectedCurrency: sellCurrency,
      guests: [],
    }],
    paymentMethod: 'external',
    isTest: true,
  })

  const booking = hgResponse.content

  const persisted = await prisma.booking.create({
    data: {
      hyperGuestBookingId: booking.bookingId,
      propertyId: booking.propertyId,
      status: booking.status,
      checkIn: new Date(booking.dates.from),
      checkOut: new Date(booking.dates.to),
      leadGuestFirstName: 'Test',
      leadGuestLastName: 'Guest',
      leadGuestEmail: 'test@hyperguest.com',
      totalAmount: booking.payment.chargeAmount.price,
      currency: booking.payment.chargeAmount.currency,
      isTest: true,
      paymentMethod: 'external',
      paymentFlow: PaymentFlow.PayAtHotelNoCard,
      bookingChannel: 'b2c',
      cancellationDeadline: null,
      rawResponse: JSON.stringify(booking),
      rooms: {
        create: booking.rooms.map(r => ({
          hyperGuestItemId: r.itemId,
          roomCode: r.roomCode,
          rateCode: r.rateCode,
          board: r.board,
          status: r.status,
          propertyReference: r.reference.property ?? null,
        })),
      },
    },
  })

  logger.info({ bookingId: persisted.id, hyperGuestBookingId: booking.bookingId }, '[TestBookings] Booking created')
  return { bookingId: persisted.id, bookingReference: String(booking.bookingId) }
}

export async function cancelTestBooking(bookingId: number): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, isTest: true },
    select: { hyperGuestBookingId: true, propertyId: true, status: true },
  })

  if (!booking || booking.status === BookingStatus.Cancelled) return false

  await hgCancelBooking(booking.hyperGuestBookingId, booking.propertyId)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.Cancelled } })

  logger.info({ bookingId, hyperGuestBookingId: booking.hyperGuestBookingId }, '[TestBookings] Booking cancelled')
  return true
}
