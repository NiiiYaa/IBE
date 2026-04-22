/**
 * HyperGuest Booking adapter.
 * Handles booking creation and booking list retrieval.
 */

import { randomUUID } from 'node:crypto'
import type {
  HGBookingRequest,
  HGBookingResponse,
  HGBookingContent,
  GuestInfo,
} from '@ibe/shared'
import { GuestTitle } from '@ibe/shared'
import { logger } from '../../utils/logger.js'
import { hgGet, hgPost } from './client.js'
import { mockCreateBooking } from './mock/mock-adapter.js'
import { getHGCredentials, getHGCredentialsForProperty } from '../../services/credentials.service.js'

const MOCK = process.env['HYPERGUEST_MOCK'] === 'true'

export interface BookingListFilter {
  dates?: {
    startDate?: string
    endDate?: string
    createdFrom?: string
    createdTo?: string
  }
  agencyReference?: string
  clientEmail?: string
  limit?: number
  page?: number
}

/**
 * Maps IBE GuestInfo to the HyperGuest guest object shape.
 * Fills optional fields with safe defaults when not provided.
 */
function mapGuest(guest: GuestInfo, isLead: boolean): HGBookingRequest['leadGuest'] {
  return {
    title: guest.title ?? GuestTitle.Mr,
    name: { first: guest.firstName, last: guest.lastName },
    birthDate: guest.birthDate,
    ...(isLead
      ? {
          contact: {
            address: guest.address ?? 'N/A',
            city: guest.city ?? 'N/A',
            country: guest.country ?? 'N/A',
            email: guest.email ?? 'N/A',
            phone: guest.phone ?? 'N/A',
            state: guest.state ?? 'N/A',
            zip: guest.zip ?? 'N/A',
          },
        }
      : {}),
  }
}

export interface CreateBookingInput {
  propertyId: number
  checkIn: string
  checkOut: string
  leadGuest: GuestInfo
  rooms: Array<{
    roomCode?: string
    roomId?: number
    rateCode: string
    expectedAmount: number
    expectedCurrency: string
    guests: GuestInfo[]
    specialRequests?: string[]
  }>
  paymentMethod: string
  agencyReference?: string
  meta?: Array<{ key: string; value: string }>
  isTest?: boolean
}

/**
 * Creates a booking via HyperGuest.
 * Pass buyerOrgId to use a B2B buyer org's token instead of the property's token.
 */
export async function createBooking(input: CreateBookingInput, buyerOrgId?: number): Promise<HGBookingResponse> {
  if (MOCK) return mockCreateBooking(input)

  const creds = buyerOrgId
    ? await getHGCredentials(buyerOrgId)
    : await getHGCredentialsForProperty(input.propertyId)
  const CREATE_URL = `https://${creds.bookingDomain}/2.0/booking/create`

  const payload: HGBookingRequest = {
    dates: { from: input.checkIn, to: input.checkOut },
    propertyId: input.propertyId,
    leadGuest: mapGuest(input.leadGuest, true),
    reference: { agency: input.agencyReference || randomUUID().replace(/-/g, '').slice(0, 20) },
    paymentDetails: {
      type: input.paymentMethod,
      // charge is always false — HyperGuest does not charge unless explicitly arranged
      charge: false,
    },
    rooms: input.rooms.map((room) => ({
      ...(room.roomId ? { roomId: room.roomId } : { roomCode: room.roomCode }),
      rateCode: room.rateCode,
      expectedPrice: { amount: room.expectedAmount, currency: room.expectedCurrency },
      guests: room.guests.map((g) => mapGuest(g, false)),
      specialRequests: room.specialRequests,
    })),
    meta: input.meta,
    isTest: input.isTest ?? false,
    groupBooking: false,
  }

  logger.info(
    { propertyId: input.propertyId, checkIn: input.checkIn, isTest: input.isTest },
    '[Booking] Creating booking',
  )

  const response = await hgPost<HGBookingRequest, HGBookingResponse>(CREATE_URL, payload, creds)

  logger.info(
    {
      propertyId: input.propertyId,
      bookingId: response.content.bookingId,
      status: response.content.status,
    },
    '[Booking] Booking created',
  )

  return response
}

/**
 * Cancels a booking via HyperGuest.
 */
export async function cancelBooking(bookingId: number, propertyId: number): Promise<void> {
  if (MOCK) {
    logger.info({ bookingId }, '[Booking] Mock cancel booking')
    return
  }
  const creds = await getHGCredentialsForProperty(propertyId)
  const CANCEL_URL = `https://${creds.bookingDomain}/2.0/booking/cancel`
  await hgPost<{ bookingId: number }, unknown>(CANCEL_URL, { bookingId }, creds)
  logger.info({ bookingId }, '[Booking] Booking cancelled via HyperGuest')
}

/**
 * Retrieves a list of bookings matching the given filters.
 */
export async function listBookings(filter: BookingListFilter): Promise<HGBookingContent[]> {
  logger.debug({ filter }, '[Booking] Listing bookings')
  const { bookingDomain } = await getHGCredentials()
  const LIST_URL = `https://${bookingDomain}/2.0/booking/list`
  const response = await hgPost<BookingListFilter, HGBookingContent[]>(LIST_URL, filter)
  return response
}
