import { search } from '../../services/search.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const searchAvailabilityTool: ToolDefinition = {
  name: 'search_availability',
  description: 'Search for available rooms at a hotel for given dates and guests. Call this when the user specifies check-in/check-out dates and number of guests.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      checkIn: { type: 'string', description: 'Check-in date in YYYY-MM-DD format' },
      checkOut: { type: 'string', description: 'Check-out date in YYYY-MM-DD format' },
      adults: { type: 'number', description: 'Number of adults (default 2)' },
      childAges: { type: 'array', items: { type: 'number' }, description: 'Ages of children if any' },
      currency: { type: 'string', description: 'Preferred currency code e.g. EUR, USD' },
    },
    required: ['propertyId', 'checkIn', 'checkOut'],
  },
}

export interface RoomSummary {
  roomId: number
  roomName: string
  maxOccupancy: number
  bedding: string
  lowestPrice: number
  currency: string
  boardType: string
  boardLabel: string
  isRefundable: boolean
  ratePlanId: number
  ratePlanCode: string
  availableCount: number
  refundablePrice: number | null
  refundableRatePlanId: number | null
  refundableRatePlanCode: string | null
}

export interface SearchResult {
  searchId: string
  propertyId: number
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  currency: string
  rooms: RoomSummary[]
  found: number
}

function pushToFuture(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  if (d >= today) return dateStr
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export async function executeSearchAvailability(args: Record<string, unknown>): Promise<SearchResult | { error: string }> {
  const propertyId = args.propertyId as number
  const checkIn = pushToFuture(args.checkIn as string)
  const checkOut = pushToFuture(args.checkOut as string)
  const adults = (args.adults as number | undefined) ?? 2
  const childAges = (args.childAges as number[] | undefined) ?? []
  const currency = (args.currency as string | undefined) ?? 'EUR'

  try {
    const response = await search({
      hotelId: propertyId,
      checkIn,
      checkOut,
      rooms: [{ adults, ...(childAges.length > 0 ? { childAges } : {}) }],
      currency,
    })

    const result = response.results[0]
    if (!result) return { error: 'No availability found for these dates.' }

    const rooms: RoomSummary[] = result.rooms.map(room => {
      const cheapestRate = room.rates.reduce((min, r) =>
        r.prices.sell.amount < min.prices.sell.amount ? r : min
      )
      const bedding = room.bedding.map(b => `${b.quantity} ${b.type}`).join(', ') || 'Standard'
      const refundableRates = room.rates.filter(r => r.isRefundable)
      const cheapestRefundable = refundableRates.length > 0
        ? refundableRates.reduce((min, r) => r.prices.sell.amount < min.prices.sell.amount ? r : min)
        : null
      return {
        roomId: room.roomId,
        roomName: room.roomName,
        maxOccupancy: room.maxOccupancy,
        bedding,
        lowestPrice: cheapestRate.prices.sell.amount,
        currency: cheapestRate.prices.sell.currency,
        boardType: cheapestRate.board,
        boardLabel: cheapestRate.boardLabel,
        isRefundable: cheapestRate.isRefundable,
        ratePlanId: cheapestRate.ratePlanId,
        ratePlanCode: cheapestRate.ratePlanCode,
        availableCount: room.availableCount,
        refundablePrice: cheapestRefundable ? cheapestRefundable.prices.sell.amount : null,
        refundableRatePlanId: cheapestRefundable ? cheapestRefundable.ratePlanId : null,
        refundableRatePlanCode: cheapestRefundable ? cheapestRefundable.ratePlanCode : null,
      }
    })

    return {
      searchId: response.searchId,
      propertyId,
      checkIn: response.checkIn,
      checkOut: response.checkOut,
      nights: response.nights,
      adults,
      currency: response.currency,
      rooms,
      found: rooms.length,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed'
    logger.warn({ propertyId, checkIn, checkOut, err }, '[AI Tool] search_availability failed')
    return { error: msg }
  }
}
