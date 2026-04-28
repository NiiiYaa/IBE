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

export interface RateOffer {
  ratePlanId: number
  ratePlanCode: string
  boardLabel: string
  boardAbbr: string
  isRefundable: boolean
  price: number
}

export interface RoomSummary {
  roomId: number
  roomName: string
  maxOccupancy: number
  bedding: string
  lowestPrice: number
  currency: string
  availableCount: number
  offers: RateOffer[]
}

const BOARD_ABBR: Record<string, string> = {
  'RO': 'RO', 'ROOM_ONLY': 'RO', 'ROOMONLY': 'RO', 'NO_MEALS': 'RO',
  'BB': 'BB', 'BED_AND_BREAKFAST': 'BB', 'BEDANDBREAKFAST': 'BB', 'BREAKFAST': 'BB',
  'HB': 'HB', 'HALF_BOARD': 'HB', 'HALFBOARD': 'HB',
  'FB': 'FB', 'FULL_BOARD': 'FB', 'FULLBOARD': 'FB',
  'AI': 'AI', 'ALL_INCLUSIVE': 'AI', 'ALLINCLUSIVE': 'AI',
  'SC': 'SC', 'SELF_CATERING': 'SC',
}

function boardAbbr(board: string, label: string): string {
  const upper = board.toUpperCase().replace(/[^A-Z_]/g, '')
  if (BOARD_ABBR[upper]) return BOARD_ABBR[upper]
  // Fallback: match common words in the label
  const l = label.toLowerCase()
  if (l.includes('all inclusive')) return 'AI'
  if (l.includes('full board')) return 'FB'
  if (l.includes('half board')) return 'HB'
  if (l.includes('breakfast')) return 'BB'
  if (l.includes('room only') || l.includes('no meal')) return 'RO'
  // Last resort: first letters of each word
  return label.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
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

export async function executeSearchAvailability(args: Record<string, unknown>, channel?: string): Promise<SearchResult | { error: string }> {
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
    }, undefined, channel)

    const result = response.results[0]
    if (!result) return { error: 'No availability found for these dates.' }

    const rooms: RoomSummary[] = result.rooms.map(room => {
      const bedding = room.bedding.map(b => `${b.quantity} ${b.type}`).join(', ') || 'Standard'

      // One offer per (board, isRefundable) pair — cheapest price wins
      const byKey = new Map<string, RateOffer>()
      for (const rate of room.rates) {
        const key = `${rate.board}-${rate.isRefundable ? '1' : '0'}`
        const existing = byKey.get(key)
        if (!existing || rate.prices.sell.amount < existing.price) {
          byKey.set(key, {
            ratePlanId: rate.ratePlanId,
            ratePlanCode: rate.ratePlanCode,
            boardLabel: rate.boardLabel,
            boardAbbr: boardAbbr(rate.board, rate.boardLabel),
            isRefundable: rate.isRefundable,
            price: rate.prices.sell.amount,
          })
        }
      }
      const offers = [...byKey.values()].sort((a, b) => a.price - b.price)
      const lowestPrice = offers[0]?.price ?? 0
      const currency = room.rates[0]?.prices.sell.currency ?? 'EUR'

      return {
        roomId: room.roomId,
        roomName: room.roomName,
        maxOccupancy: room.maxOccupancy,
        bedding,
        lowestPrice,
        currency,
        availableCount: room.availableCount,
        offers,
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
