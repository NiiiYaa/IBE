import type { ToolDefinition } from '../adapters/types.js'

export const prepareBookingTool: ToolDefinition = {
  name: 'prepare_booking',
  description: 'Generate the booking link/params when the user is ready to book a specific room and rate. Call this only when the user has explicitly confirmed which room they want to book.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      roomId: { type: 'number', description: 'Room ID from the search results' },
      ratePlanCode: { type: 'string', description: 'Rate plan code from the search results' },
      searchId: { type: 'string', description: 'Search ID from the search_availability result' },
      checkIn: { type: 'string', description: 'Check-in date YYYY-MM-DD' },
      checkOut: { type: 'string', description: 'Check-out date YYYY-MM-DD' },
      adults: { type: 'number', description: 'Number of adults' },
    },
    required: ['propertyId', 'roomId', 'ratePlanCode', 'searchId', 'checkIn', 'checkOut', 'adults'],
  },
}

export interface BookingHandoff {
  url: string
  propertyId: number
  roomId: number
  ratePlanCode: string
  searchId: string
  checkIn: string
  checkOut: string
  adults: number
}

export function executePrepareBooking(args: Record<string, unknown>): BookingHandoff {
  const propertyId = args.propertyId as number
  const roomId = args.roomId as number
  const ratePlanCode = args.ratePlanCode as string
  const searchId = args.searchId as string
  const checkIn = args.checkIn as string
  const checkOut = args.checkOut as string
  const adults = args.adults as number

  const params = new URLSearchParams({
    searchId,
    selectedRoom: String(roomId),
    selectedRate: ratePlanCode,
    checkIn,
    checkOut,
    rooms: JSON.stringify([{ adults }]),
  })

  return {
    url: `/booking?propertyId=${propertyId}&${params.toString()}`,
    propertyId,
    roomId,
    ratePlanCode,
    searchId,
    checkIn,
    checkOut,
    adults,
  }
}
