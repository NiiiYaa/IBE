import type { ToolDefinition } from '../adapters/types.js'
import { env } from '../../config/env.js'

export const prepareBookingTool: ToolDefinition = {
  name: 'prepare_booking',
  description: 'Generate the booking link/params when the user is ready to book a specific room and rate. Call this only when the user has explicitly confirmed which room they want to book.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      roomId: { type: 'number', description: 'Room ID from the search results' },
      ratePlanId: { type: 'number', description: 'Numeric rate plan ID from the search results' },
      searchId: { type: 'string', description: 'Search ID from the search_availability result' },
      checkIn: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
      checkOut: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
      adults: { type: 'number', description: 'Number of adults' },
    },
    required: ['propertyId', 'roomId', 'ratePlanId', 'searchId', 'checkIn', 'checkOut', 'adults'],
  },
}

export interface BookingHandoff {
  url: string
  propertyId: number
  roomId: number
  ratePlanId: number
  searchId: string
  checkIn: string
  checkOut: string
  adults: number
}

export function executePrepareBooking(args: Record<string, unknown>): BookingHandoff {
  const propertyId = args.propertyId as number
  const roomId = args.roomId as number
  const ratePlanId = args.ratePlanId as number
  const searchId = args.searchId as string
  const checkIn = args.checkIn as string
  const checkOut = args.checkOut as string
  const adults = args.adults as number

  const params = new URLSearchParams({
    hotelId: String(propertyId),
    searchId,
    roomId: String(roomId),
    ratePlanId: String(ratePlanId),
    checkIn,
    checkOut,
    'rooms[0][adults]': String(adults),
  })

  return {
    url: `${env.WEB_BASE_URL}/booking?${params.toString()}`,
    propertyId,
    roomId,
    ratePlanId,
    searchId,
    checkIn,
    checkOut,
    adults,
  }
}
