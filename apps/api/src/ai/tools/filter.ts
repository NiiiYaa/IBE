import type { ToolDefinition } from '../adapters/types.js'
import type { RoomSummary } from './search.js'

export const filterResultsTool: ToolDefinition = {
  name: 'filter_results',
  description: 'Filter or sort a previous set of search results by price, board type, refundability, or occupancy. Use this when the user asks to narrow down options.',
  parameters: {
    type: 'object',
    properties: {
      rooms: { type: 'array', description: 'The rooms array from a previous search_availability result' },
      maxPrice: { type: 'number', description: 'Maximum price per night' },
      minPrice: { type: 'number', description: 'Minimum price per night' },
      refundableOnly: { type: 'boolean', description: 'Only show refundable rates' },
      boardType: { type: 'string', description: 'Filter by board type: RO, BB, HB, FB, AI' },
      minOccupancy: { type: 'number', description: 'Minimum max-occupancy for the room' },
      sortBy: { type: 'string', enum: ['price_asc', 'price_desc', 'occupancy'], description: 'Sort order' },
    },
    required: ['rooms'],
  },
}

export function executeFilterResults(args: Record<string, unknown>): { rooms: RoomSummary[]; found: number } {
  let rooms = (args.rooms as RoomSummary[]) ?? []

  if (args.maxPrice !== undefined) rooms = rooms.filter(r => r.lowestPrice <= (args.maxPrice as number))
  if (args.minPrice !== undefined) rooms = rooms.filter(r => r.lowestPrice >= (args.minPrice as number))
  if (args.refundableOnly === true) rooms = rooms.filter(r => r.isRefundable)
  if (args.boardType) rooms = rooms.filter(r => r.boardType === args.boardType)
  if (args.minOccupancy !== undefined) rooms = rooms.filter(r => r.maxOccupancy >= (args.minOccupancy as number))

  const sortBy = args.sortBy as string | undefined
  if (sortBy === 'price_asc') rooms = [...rooms].sort((a, b) => a.lowestPrice - b.lowestPrice)
  else if (sortBy === 'price_desc') rooms = [...rooms].sort((a, b) => b.lowestPrice - a.lowestPrice)
  else if (sortBy === 'occupancy') rooms = [...rooms].sort((a, b) => b.maxOccupancy - a.maxOccupancy)

  return { rooms, found: rooms.length }
}
