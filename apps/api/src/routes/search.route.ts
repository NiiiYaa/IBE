import type { FastifyInstance } from 'fastify'
import { SearchParamsSchema } from '@ibe/shared'
import { search } from '../services/search.service.js'
import { IBE_ERROR_VALIDATION } from '@ibe/shared'
import { extractB2BContext } from '../utils/b2b-context.js'

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get('/search', async (request, reply) => {
    const query = request.query as Record<string, unknown>

    // Parse rooms from query string: rooms[0][adults]=2&rooms[0][childAges][]=5
    const parsedRooms = parseRoomsFromQuery(query)

    const parseResult = SearchParamsSchema.safeParse({
      hotelId: query['hotelId'] ? Number(query['hotelId']) : undefined,
      checkIn: query['checkIn'],
      checkOut: query['checkOut'],
      rooms: parsedRooms,
      nationality: query['nationality'],
      currency: query['currency'],
      promoCode: query['promoCode'],
      affiliateCode: query['affiliateId'] ?? query['affiliateCode'],
    })

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: IBE_ERROR_VALIDATION,
        details: parseResult.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      })
    }

    const b2b = extractB2BContext(fastify, request)
    const results = await search(parseResult.data as import('@ibe/shared').SearchParams, b2b?.buyerOrgId)
    return reply.send(results)
  })
}

function parseRoomsFromQuery(query: Record<string, unknown>) {
  const rooms: Array<{ adults: number; childAges?: number[] }> = []
  let i = 0
  while (query[`rooms[${i}][adults]`] !== undefined) {
    const adults = Number(query[`rooms[${i}][adults]`])
    const rawChildren = query[`rooms[${i}][childAges]`]
    const childAges = Array.isArray(rawChildren)
      ? (rawChildren as string[]).map(Number)
      : rawChildren
        ? [Number(rawChildren)]
        : undefined
    rooms.push({ adults, childAges })
    i++
  }
  // Fallback: single room shorthand ?adults=2
  if (rooms.length === 0 && query['adults']) {
    rooms.push({ adults: Number(query['adults']) })
  }
  return rooms
}
