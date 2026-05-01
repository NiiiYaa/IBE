import type { FastifyInstance } from 'fastify'
import { validateApiKey } from '../services/mcp.service.js'
import { isJwt, validateMcpJwt, getOAuthScope } from '../services/oauth.service.js'
import { search } from '../services/search.service.js'
import { getPropertyDetail } from '../services/static.service.js'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const WIDGET_URI  = 'hotel://widget/room-results'

const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Room Availability</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #111;
      background: #fff;
      padding: 12px;
    }

    #app { display: flex; flex-direction: column; gap: 10px; }

    .status {
      color: #888;
      font-size: 13px;
      text-align: center;
      padding: 24px 0;
    }

    .card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      transition: box-shadow .15s;
    }
    .card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }

    .card-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .room-name {
      font-size: 15px;
      font-weight: 600;
      color: #111;
    }

    .room-meta {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }

    .rates { display: flex; flex-direction: column; gap: 4px; }

    .rate-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #374151;
    }
    .rate-name { color: #6b7280; }
    .rate-amount { font-weight: 600; color: #111; }

    .card-footer {
      border-top: 1px solid #f3f4f6;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .lowest-price {
      font-size: 13px;
      color: #6b7280;
    }
    .lowest-price strong {
      font-size: 16px;
      font-weight: 700;
      color: #111;
    }

    .book-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #2563eb;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 999px;
      text-decoration: none;
      transition: background .15s;
      white-space: nowrap;
    }
    .book-btn:hover { background: #1d4ed8; }

    .avail-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: #15803d;
      background: #dcfce7;
      border-radius: 999px;
      padding: 2px 8px;
    }
    .avail-badge.low {
      color: #b45309;
      background: #fef3c7;
    }
  </style>
</head>
<body>
  <div id="app"><p class="status">Loading availability…</p></div>

  <script>
    let toolInput = null

    window.addEventListener('message', (event) => {
      const msg = event.data
      if (!msg || msg.jsonrpc !== '2.0') return

      if (msg.method === 'ui/initialize') {
        reply(event, msg.id, {})
        return
      }

      if (msg.method === 'ui/notifications/tool-input') {
        toolInput = msg.params?.input ?? {}
        return
      }

      if (msg.method === 'ui/notifications/tool-result') {
        const result = msg.params?.result ?? {}
        const meta   = result._meta ?? {}
        const rooms  = meta.rooms ?? result.structuredContent?.rooms ?? []
        render(rooms, meta)
      }
    })

    function reply(event, id, result) {
      const target = event.source ?? window.parent
      const origin = event.origin && event.origin !== 'null' ? event.origin : '*'
      target.postMessage({ jsonrpc: '2.0', id, result }, origin)
    }

    function fmt(amount, currency) {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency', currency,
          minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(amount)
      } catch {
        return currency + ' ' + Math.round(amount)
      }
    }

    function bookingUrl(room, rate, meta) {
      if (!meta.webBaseUrl || !meta.propertyId) return null
      const p = new URLSearchParams({
        hotelId:           String(meta.propertyId),
        checkIn:           meta.checkIn  ?? '',
        checkOut:          meta.checkOut ?? '',
        'rooms[0][adults]': String(meta.adults ?? 2),
        roomId:            String(room.roomId),
        ratePlanId:        String(rate.ratePlanId),
        searchId:          meta.searchId ?? '',
      })
      return meta.webBaseUrl + '/search?' + p
    }

    function render(rooms, meta) {
      const app = document.getElementById('app')
      if (!rooms.length) {
        app.innerHTML = '<p class="status">No rooms available for your selection.</p>'
        return
      }

      const currency = meta.currency ?? 'USD'

      app.innerHTML = rooms.map(function(room) {
        const bestRate = room.rates && room.rates[0]
        const url = bestRate ? bookingUrl(room, bestRate, meta) : null
        const low = room.availableCount <= 3
        const availLabel = low
          ? 'Only ' + room.availableCount + ' left'
          : room.availableCount + ' available'

        const ratesHtml = (room.rates ?? []).slice(0, 3).map(function(r) {
          return '<div class="rate-row"><span class="rate-name">' + r.ratePlanName + (r.boardType ? ' &middot; ' + r.boardType : '') + '</span><span class="rate-amount">' + fmt(r.amount, currency) + '</span></div>'
        }).join('')

        return '<div class="card"><div class="card-body"><div><p class="room-name">' + room.roomName + '</p><p class="room-meta"><span class="avail-badge' + (low ? ' low' : '') + '">' + availLabel + '</span></p></div><div class="rates">' + ratesHtml + '</div></div><div class="card-footer"><div class="lowest-price">From <strong>' + fmt(room.lowestRate, currency) + '</strong><br><span style="font-size:11px">per night</span></div>' + (url ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="book-btn">Book now</a>' : '<span style="font-size:12px;color:#6b7280">Contact hotel</span>') + '</div></div>'
      }).join('')
    }
  <\/script>
</body>
</html>`

const SERVER_INFO = { name: 'IBE MCP Server', version: '1.0.0' }
const PROTOCOL_VERSION = '2024-11-05'

const MCP_TOOLS = [
  {
    name: 'search_availability',
    description: 'Search for available rooms at the hotel for given dates and guests.',
    inputSchema: {
      type: 'object',
      properties: {
        checkIn:    { type: 'string',  description: 'Check-in date (YYYY-MM-DD)' },
        checkOut:   { type: 'string',  description: 'Check-out date (YYYY-MM-DD)' },
        adults:     { type: 'integer', description: 'Number of adults', default: 2 },
        children:   { type: 'integer', description: 'Number of children', default: 0 },
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
        checkIn:    { type: 'string',  description: 'Check-in date (YYYY-MM-DD)' },
        checkOut:   { type: 'string',  description: 'Check-out date (YYYY-MM-DD)' },
        adults:     { type: 'integer', description: 'Number of adults', default: 2 },
        children:   { type: 'integer', description: 'Number of children', default: 0 },
        roomId:     { type: 'integer', description: 'Room ID to pre-select (optional)' },
        ratePlanId: { type: 'integer', description: 'Rate plan ID to pre-select (optional)' },
        searchId:   { type: 'string',  description: 'Search ID from search_availability (optional)' },
      },
      required: ['propertyId', 'checkIn', 'checkOut'],
    },
  },
]

// ── SSE session store ─────────────────────────────────────────────────────────
// Maps sessionId → { raw response stream, resolved default property }
interface SseSession {
  write: (data: string) => void
  end: () => void
  defaultPropertyId: number | null
}
const sseSessions = new Map<string, SseSession>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function mcpResult(content: string) {
  return { content: [{ type: 'text', text: content }] }
}

function mcpError(message: string) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}

async function resolveDefaultProperty(scope: Awaited<ReturnType<typeof validateApiKey>>): Promise<number | null> {
  if (!scope) return null
  if (scope.kind === 'property') return scope.propertyId
  const first = await prisma.property.findFirst({
    where: { organizationId: scope.orgId, isActive: true },
    orderBy: { propertyId: 'asc' },
    select: { propertyId: true },
  })
  return first?.propertyId ?? null
}

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  defaultPropertyId: number | null,
): Promise<{ content: { type: string; text: string }[]; structuredContent?: unknown; _meta?: unknown; isError?: boolean }> {
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
      }, undefined, 'mcp')
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
      const structuredContent = { searchId: results.searchId, rooms: summary, currency: results.currency }
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
        structuredContent,
        _meta: {
          ui: { resourceUri: WIDGET_URI },
          ...structuredContent,
          propertyId: pid,
          checkIn,
          checkOut,
          adults,
          webBaseUrl: env.WEB_BASE_URL,
        },
      }
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
    const adults     = (args['adults']     as number | undefined) ?? 2
    const children   = (args['children']   as number | undefined) ?? 0
    const roomId     = args['roomId']     as number | undefined
    const ratePlanId = args['ratePlanId'] as number | undefined
    const searchId   = args['searchId']   as string | undefined

    const params = new URLSearchParams({
      hotelId: String(pid), checkIn, checkOut,
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

async function dispatchJsonRpc(
  body: { jsonrpc: string; method: string; params?: unknown; id?: string | number | null },
  defaultPropertyId: number | null,
): Promise<object | null> {
  if (body.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC version' }, id: body.id ?? null }
  }

  if (body.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {}, resources: {} }, serverInfo: SERVER_INFO },
      id: body.id ?? null,
    }
  }

  if (body.method === 'notifications/initialized') return null // 204 / 202

  if (body.method === 'tools/list') {
    return { jsonrpc: '2.0', result: { tools: MCP_TOOLS }, id: body.id ?? null }
  }

  if (body.method === 'resources/list') {
    return {
      jsonrpc: '2.0',
      result: {
        resources: [{
          uri:      WIDGET_URI,
          name:     'Room Results Widget',
          mimeType: 'text/html;profile=mcp-app',
        }],
      },
      id: body.id ?? null,
    }
  }

  if (body.method === 'resources/read') {
    const uri = (body.params as { uri?: string } | undefined)?.uri
    if (uri !== WIDGET_URI) {
      return { jsonrpc: '2.0', error: { code: -32002, message: 'Resource not found' }, id: body.id ?? null }
    }
    return {
      jsonrpc: '2.0',
      result: {
        contents: [{ uri: WIDGET_URI, mimeType: 'text/html;profile=mcp-app', text: WIDGET_HTML }],
      },
      id: body.id ?? null,
    }
  }

  if (body.method === 'tools/call') {
    const p = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined
    const result = await handleToolCall(p?.name ?? '', p?.arguments ?? {}, defaultPropertyId)
    return { jsonrpc: '2.0', result, id: body.id ?? null }
  }

  return { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${body.method}` }, id: body.id ?? null }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function mcpRoutes(fastify: FastifyInstance) {

  // ── Streamable HTTP (Claude Desktop, Cursor, Windsurf, OpenAI, Gemini, Grok, OAuth) ──
  fastify.post('/mcp', async (request, reply) => {
    const authHeader = (request.headers['authorization'] as string | undefined) ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    let scope: Awaited<ReturnType<typeof validateApiKey>> = null
    if (token) {
      if (isJwt(token)) {
        const jwt = await validateMcpJwt(token)
        if (jwt) scope = await getOAuthScope(jwt.sub)
      } else {
        scope = await validateApiKey(token)
      }
    }
    if (!scope) {
      return reply.status(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    }

    const defaultPropertyId = await resolveDefaultProperty(scope)
    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }

    try {
      const response = await dispatchJsonRpc(body, defaultPropertyId)
      if (!response) return reply.status(204).send()
      return reply.send(response)
    } catch (err) {
      logger.error({ err }, '[MCP] Unhandled error')
      return reply.send({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null })
    }
  })

  // ── Key-in-URL endpoint (ChatGPT App — no Bearer header support) ──────────
  // ChatGPT only supports OAuth 2.1 or no auth; embed the key in the path instead.
  fastify.post('/mcp/:apiKey', async (request, reply) => {
    const { apiKey } = request.params as { apiKey: string }
    const scope = await validateApiKey(apiKey)
    if (!scope) {
      return reply.status(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    }
    const defaultPropertyId = await resolveDefaultProperty(scope)
    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }
    try {
      const response = await dispatchJsonRpc(body, defaultPropertyId)
      if (!response) return reply.status(204).send()
      return reply.send(response)
    } catch (err) {
      logger.error({ err }, '[MCP] Unhandled error')
      return reply.send({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null })
    }
  })

  // ── SSE transport — GET (n8n connects here) ───────────────────────────────
  fastify.get('/mcp', async (request, reply) => {
    const authHeader = (request.headers['authorization'] as string | undefined) ?? ''
    // n8n may also pass token as query param ?token=...
    const queryToken = (request.query as Record<string, string>).token ?? ''
    const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (authHeader || queryToken)
    const scope = raw ? await validateApiKey(raw) : null
    if (!scope) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const defaultPropertyId = await resolveDefaultProperty(scope)
    const sessionId = crypto.randomUUID()

    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const session: SseSession = {
      write: (data: string) => { try { res.write(data) } catch { /* client disconnected */ } },
      end:   () => { try { res.end() } catch { /* already ended */ } },
      defaultPropertyId,
    }
    sseSessions.set(sessionId, session)

    // Send the endpoint URL where n8n should POST messages
    const messageUrl = `/api/v1/mcp/message?sessionId=${sessionId}`
    session.write(`event: endpoint\ndata: ${messageUrl}\n\n`)

    // Heartbeat every 25s to keep the connection alive through proxies
    const heartbeat = setInterval(() => session.write(': ping\n\n'), 25_000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      sseSessions.delete(sessionId)
      logger.info({ sessionId }, '[MCP SSE] session closed')
    })

    // Keep connection open — hijack prevents Fastify from auto-finalizing
  })

  // ── SSE transport — POST (n8n sends messages here) ───────────────────────
  fastify.post('/mcp/message', async (request, reply) => {
    const sessionId = (request.query as Record<string, string>).sessionId ?? ''
    const session = sseSessions.get(sessionId)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found or expired' })
    }

    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: string | number | null }

    try {
      const response = await dispatchJsonRpc(body, session.defaultPropertyId)
      if (response) {
        session.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`)
      }
      return reply.status(202).send()
    } catch (err) {
      logger.error({ err }, '[MCP SSE] Unhandled error')
      const errResponse = { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: body.id ?? null }
      session.write(`event: message\ndata: ${JSON.stringify(errResponse)}\n\n`)
      return reply.status(202).send()
    }
  })
}
