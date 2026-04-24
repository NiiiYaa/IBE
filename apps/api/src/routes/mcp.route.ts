import type { FastifyInstance } from 'fastify'
import { validateApiKey } from '../services/mcp.service.js'
import { search } from '../services/search.service.js'
import { getPropertyDetail } from '../services/static.service.js'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const SERVER_INFO = { name: 'IBE MCP Server', version: '1.0.0' }
const PROTOCOL_VERSION = '2024-11-05'

const MCP_TOOLS = [
  {
    name: 'search_availability',
    description: 'Search for available rooms at the hotel for given dates and guests.',
    inputSchema: {
      type: 'object',
      properties: {
        checkIn:  { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        adults:   { type: 'integer', description: 'Number of adults', default: 2 },
        children: { type: 'integer', description: 'Number of children', default: 0 },
        propertyId: { type: 'integer', description: 'Property ID (required for chain-level connections)' },
      },
      required: ['checkIn', 'checkOut'],
    },
  },
  {
    name: 'get_property_info',
    description: 'Get hotel name, location, star rating, facilities and description.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'integer', description: 'Property ID (required for chain-level connections)' },
      },
    },
  },
  {
    name: 'get_room_details',
    description: 'Get detailed information about a specific room type.',
    inputSchema: {
      type: 'object',
      properties: {
        roomId:     { type: 'integer', description: 'Room ID from search_availability results' },
        propertyId: { type: 'integer', description: 'Property ID (required for chain-level connections)' },
      },
      required: ['roomId'],
    },
  },
  {
    name: 'create_booking_link',
    description: 'Generate a direct booking URL for the guest to complete payment on the hotel website.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'integer', description: 'Property ID' },
        checkIn:    { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut:   { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        adults:     { type: 'integer', description: 'Number of adults', default: 2 },
        children:   { type: 'integer', description: 'Number of children', default: 0 },
        roomId:     { type: 'integer', description: 'Room ID to pre-select (optional)' },
        ratePlanId: { type: 'integer', description: 'Rate plan ID to pre-select (optional)' },
        searchId:   { type: 'string', description: 'Search ID from search_availability (optional)' },
      },
      required: ['propertyId', 'checkIn', 'checkOut'],
    },
  },
]

function mcpResult(content: string) {
  return { content: [{ type: 'text', text: content }] }
}

function mcpError(message: string) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  defaultPropertyId: number | null,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const pid = (args['propertyId'] as number | undefined) ?? defaultPropertyId ?? 0

  if (toolName === 'get_property_info') {
    if (!pid) return mcpError('propertyId is required for chain-level connections')
    try {
      const [detail, config] = await Promise.all([
        getPropertyDetail(pid),
        prisma.hotelConfig.findUnique({ where: { propertyId: pid } }).catch(() => null),
      ])
      const desc = detail.descriptions.find(d => d.locale === 'en')?.text ?? detail.descriptions[0]?.text ?? ''
      return mcpResult(JSON.stringify({
        propertyId: pid,
        name: config?.displayName || detail.name,
        starRating: detail.starRating,
        city: detail.location.city,
        address: detail.location.address,
        country: detail.location.countryCode,
        description: desc,
        tagline: config?.tagline ?? null,
      }))
    } catch {
      return mcpError(`Property ${pid} not found`)
    }
  }

  if (toolName === 'search_availability') {
    if (!pid) return mcpError('propertyId is required for chain-level connections')
    const checkIn  = args['checkIn']  as string | undefined
    const checkOut = args['checkOut'] as string | undefined
    if (!checkIn || !checkOut) return mcpError('checkIn and checkOut are required')
    const adults   = (args['adults']   as number | undefined) ?? 2
    const children = (args['children'] as number | undefined) ?? 0
    try {
      const results = await search({
        hotelId: pid,
        checkIn,
        checkOut,
        rooms: [{ adults, ...(children > 0 ? { childAges: Array<number>(children).fill(10) } : {}) }],
      })
      const summary = results.results.flatMap(r => r.rooms).map(room => ({
        roomId: room.roomId,
        roomName: room.roomName,
        availableCount: room.availableCount,
        lowestRate: Math.min(...room.rates.map(r => r.prices.sell.amount)),
        currency: results.currency,
        rates: room.rates.slice(0, 3).map(r => ({
          ratePlanId: r.ratePlanId,
          ratePlanName: r.ratePlanName,
          amount: r.prices.sell.amount,
          boardType: r.boardLabel,
        })),
      }))
      return mcpResult(JSON.stringify({ searchId: results.searchId, rooms: summary, currency: results.currency }))
    } catch (err) {
      return mcpError(err instanceof Error ? err.message : 'Search failed')
    }
  }

  if (toolName === 'get_room_details') {
    const roomId = args['roomId'] as number | undefined
    if (!roomId) return mcpError('roomId is required')
    if (!pid) return mcpError('propertyId is required for chain-level connections')
    try {
      const detail = await getPropertyDetail(pid)
      const room = detail.rooms.find(r => r.roomId === roomId)
      if (!room) return mcpError(`Room ${roomId} not found`)
      return mcpResult(JSON.stringify({
        roomId: room.roomId,
        name: room.name,
        description: room.descriptions.find(d => d.locale === 'en')?.text ?? room.descriptions[0]?.text ?? '',
        facilities: room.facilities.map(f => f.name),
        images: room.images.slice(0, 3).map(i => i.url),
        beds: room.beds,
      }))
    } catch {
      return mcpError(`Property ${pid} not found`)
    }
  }

  if (toolName === 'create_booking_link') {
    if (!pid) return mcpError('propertyId is required')
    const checkIn  = args['checkIn']  as string | undefined
    const checkOut = args['checkOut'] as string | undefined
    if (!checkIn || !checkOut) return mcpError('checkIn and checkOut are required')
    const adults   = (args['adults']   as number | undefined) ?? 2
    const children = (args['children'] as number | undefined) ?? 0
    const roomId     = args['roomId']     as number | undefined
    const ratePlanId = args['ratePlanId'] as number | undefined
    const searchId   = args['searchId']   as string | undefined

    const params = new URLSearchParams({
      hotelId: String(pid),
      checkIn,
      checkOut,
      'rooms[0][adults]': String(adults),
      ...(children > 0 ? { 'rooms[0][children]': String(children) } : {}),
    })
    if (roomId)     params.set('roomId',     String(roomId))
    if (ratePlanId) params.set('ratePlanId', String(ratePlanId))
    if (searchId)   params.set('searchId',   searchId)

    const url = `${env.WEB_BASE_URL}/search?${params.toString()}`
    return mcpResult(JSON.stringify({ bookingUrl: url, message: 'Direct the guest to this URL to complete the booking.' }))
  }

  return mcpError(`Unknown tool: ${toolName}`)
}

export async function mcpRoutes(fastify: FastifyInstance) {
  // Single endpoint — handles both org-level and property-level via API key lookup
  fastify.post('/mcp', async (request, reply) => {
    const authHeader = (request.headers['authorization'] as string | undefined) ?? ''
    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    const scope = apiKey ? await validateApiKey(apiKey) : null
    if (!scope) {
      return reply.status(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    }

    const defaultPropertyId = scope.kind === 'property' ? scope.propertyId : null

    // If org-level, resolve a default property for single-property orgs
    let resolvedDefaultPropertyId = defaultPropertyId
    if (scope.kind === 'org' && !resolvedDefaultPropertyId) {
      const first = await prisma.property.findFirst({
        where: { organizationId: scope.orgId, isActive: true },
        orderBy: { propertyId: 'asc' },
        select: { propertyId: true },
      })
      resolvedDefaultPropertyId = first?.propertyId ?? null
    }

    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }

    if (body.jsonrpc !== '2.0') {
      return reply.send({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC version' }, id: body.id ?? null })
    }

    try {
      if (body.method === 'initialize') {
        return reply.send({
          jsonrpc: '2.0',
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
          id: body.id ?? null,
        })
      }

      if (body.method === 'notifications/initialized') {
        return reply.status(204).send()
      }

      if (body.method === 'tools/list') {
        return reply.send({ jsonrpc: '2.0', result: { tools: MCP_TOOLS }, id: body.id ?? null })
      }

      if (body.method === 'tools/call') {
        const p = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined
        const toolName = p?.name ?? ''
        const args = p?.arguments ?? {}
        const result = await handleToolCall(toolName, args, resolvedDefaultPropertyId)
        return reply.send({ jsonrpc: '2.0', result, id: body.id ?? null })
      }

      return reply.send({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${body.method}` },
        id: body.id ?? null,
      })
    } catch (err) {
      logger.error({ err }, '[MCP] Unhandled error')
      return reply.send({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null })
    }
  })
}
