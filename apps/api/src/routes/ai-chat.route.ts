import type { FastifyInstance } from 'fastify'
import { runOrchestrator } from '../ai/orchestrator.js'
import { runWhatsAppTurn } from '../ai/whatsapp-handler.js'
import { resolveAIConfig } from '../services/ai-config.service.js'
import { getCommSettings, registerWebjsPhone, resolveWebjsPhoneContext, getWaSessionContext, setWaSessionContext } from '../services/communication.service.js'
import { getStatus as getWaStatus } from '../services/whatsapp-manager.service.js'
import { prisma } from '../db/client.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'
import { ClientSession } from '../ai/sessions/client-session.js'
import { RedisSession } from '../ai/sessions/redis-session.js'
import type { ChatMessage } from '../ai/sessions/types.js'
import { logger } from '../utils/logger.js'

function sendChunk(reply: { raw: { write: (s: string) => void } }, data: unknown) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
}

function extractPropertyIdFromToolResults(toolResults: { tool: string; data: unknown }[]): number | null {
  for (const tr of toolResults) {
    const d = tr.data as Record<string, unknown> | null
    if (!d) continue
    if (typeof d.propertyId === 'number') return d.propertyId
    // search_availability wraps results under rooms[]
    const rooms = d.rooms
    if (Array.isArray(rooms) && rooms.length > 0) {
      const first = rooms[0] as Record<string, unknown>
      if (typeof first.propertyId === 'number') return first.propertyId
    }
    // list_chain_hotels returns hotels[]
    const hotels = d.hotels
    if (Array.isArray(hotels) && hotels.length > 0) {
      const first = hotels[0] as Record<string, unknown>
      if (typeof first.propertyId === 'number') return first.propertyId
    }
  }
  return null
}

export async function aiChatRoutes(fastify: FastifyInstance) {
  // POST /api/v1/wwebjs/phone-register — called by wwebjs service on connect + each message
  fastify.post('/wwebjs/phone-register', async (request, reply) => {
    const { phone, orgId, propertyId } = request.body as { phone: string; orgId?: number; propertyId?: number }
    if (phone) registerWebjsPhone(phone, {
      ...(orgId !== undefined ? { orgId } : {}),
      ...(propertyId !== undefined ? { propertyId } : {}),
    })
    return reply.send({ ok: true })
  })

  // GET /api/v1/ai/enabled?propertyId=X — public: is AI configured for this property/org?
  fastify.get('/ai/enabled', async (request, reply) => {
    const { propertyId: rawId } = request.query as { propertyId?: string }
    const propertyId = rawId ? parseInt(rawId, 10) : undefined
    const config = await resolveAIConfig(propertyId && !isNaN(propertyId) ? propertyId : undefined)
    void reply.header('Cache-Control', 'public, max-age=60')
    return reply.send({ enabled: !!config })
  })

  // GET /api/v1/ai/chat-config?propertyId=X — public: which conversation channels are available?
  // Returns AI enabled flag + WhatsApp contact number (if configured with Twilio).
  fastify.get('/ai/chat-config', async (request, reply) => {
    const { propertyId: rawId } = request.query as { propertyId?: string }
    const propertyId = rawId ? parseInt(rawId, 10) : NaN

    const pid = !isNaN(propertyId) ? propertyId : undefined
    const [aiConfig, orgId] = await Promise.all([
      resolveAIConfig(pid),
      pid ? getOrgIdForProperty(pid) : Promise.resolve(undefined),
    ])

    let whatsappNumber: string | null = null
    if (orgId) {
      const comms = await getCommSettings(orgId)
      if (comms.whatsappEnabled && comms.whatsappProvider === 'twilio' && comms.whatsappTwilioNumber) {
        whatsappNumber = comms.whatsappTwilioNumber
      } else if (comms.whatsappEnabled && comms.whatsappProvider === 'meta' && comms.whatsappPhoneNumberId) {
        // Meta phoneNumberId is not the consumer-facing number; surface it only if it looks like a phone number
        const cleaned = comms.whatsappPhoneNumberId.replace(/\D/g, '')
        if (cleaned.length >= 10 && cleaned.length <= 15) whatsappNumber = comms.whatsappPhoneNumberId
      } else if (comms.whatsappEnabled && comms.whatsappProvider === 'wwebjs') {
        // Query the embedded Baileys manager for the connected phone number.
        // Org-level clients are keyed by orgId; system client (key="system") serves all inheriting orgs.
        const orgCtx = { orgId }
        const orgStatus = getWaStatus(orgCtx)
        if (orgStatus.status === 'connected' && orgStatus.phoneNumber) {
          whatsappNumber = orgStatus.phoneNumber
        } else {
          // Fall back to system client (inheriting orgs share the system number)
          const sysStatus = getWaStatus({})
          if (sysStatus.status === 'connected' && sysStatus.phoneNumber) {
            whatsappNumber = sysStatus.phoneNumber
          }
        }
      }
    }

    void reply.header('Cache-Control', 'public, max-age=60')
    return reply.send({ aiEnabled: !!aiConfig, whatsappNumber })
  })

  // POST /api/v1/ai/chat — guest-facing conversational search
  // Uses SSE to stream text back; tool results are sent as separate events before the text.
  // Also used by the wwebjs bridge (channel: 'whatsapp') — in that case history is stored server-side.
  fastify.post('/ai/chat', async (request, reply) => {
    const { message, history, sessionId, channel, webjsPhone } = request.body as {
      message: string
      history?: ChatMessage[]
      propertyId?: number
      orgId?: number
      sessionId: string
      channel?: string
      webjsPhone?: string
    }
    let { propertyId, orgId } = request.body as { propertyId?: number; orgId?: number }

    if (!message?.trim()) {
      return reply.status(400).send({ error: 'message is required' })
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    try {
      // If WhatsApp channel sent no org/property context, resolve it:
      // 1. From the in-memory phone registry (org-specific wwebjs client)
      // 2. From a previously saved Redis session context (guest already identified their hotel)
      let waCtxAlreadySaved = false
      if (channel === 'whatsapp' && !orgId && !propertyId) {
        if (webjsPhone) {
          const phoneCtx = resolveWebjsPhoneContext(webjsPhone)
          if (phoneCtx) { orgId = phoneCtx.orgId; propertyId = phoneCtx.propertyId }
        }
        if (!orgId && !propertyId) {
          const savedCtx = await getWaSessionContext(sessionId)
          if (savedCtx) {
            orgId = savedCtx.orgId; propertyId = savedCtx.propertyId; waCtxAlreadySaved = true
          }
        }
      }

      // Async channels (whatsapp, mcp) store history server-side; browser channels send history inline
      const resolvedChannel = (channel as 'aiSearchBar' | 'whatsapp' | 'mcp') ?? 'aiSearchBar'
      const session = resolvedChannel === 'whatsapp' || resolvedChannel === 'mcp'
        ? new RedisSession()
        : new ClientSession(history ?? [])

      const result = await runOrchestrator({
        message,
        session,
        sessionId: sessionId ?? 'anon',
        channel: resolvedChannel,
        ...(propertyId ? { propertyId } : {}),
        ...(orgId ? { orgId } : {}),
      })

      // If this was a system-wide WhatsApp session and the AI just resolved a specific
      // property via tool calls, lock the session to that org for all future turns.
      if (channel === 'whatsapp' && !waCtxAlreadySaved && !orgId && !propertyId && result.toolResults.length > 0) {
        const resolvedPropId = extractPropertyIdFromToolResults(result.toolResults)
        if (resolvedPropId) {
          const prop = await prisma.property.findUnique({ where: { propertyId: resolvedPropId }, select: { organizationId: true } })
          if (prop) void setWaSessionContext(sessionId, { orgId: prop.organizationId, propertyId: resolvedPropId })
        }
      }

      // Send tool results first so the client can render them before the text
      for (const tr of result.toolResults) {
        sendChunk(reply, { type: 'tool_result', tool: tr.tool, data: tr.data })
      }

      // Stream text word-by-word for a conversational feel
      if (result.text) {
        const words = result.text.split(/(?<=\s)|(?=\s)/)
        for (const word of words) {
          sendChunk(reply, { type: 'text', delta: word })
        }
      }

      sendChunk(reply, { type: 'done', history: result.updatedHistory })
    } catch (err) {
      logger.error({ err, sessionId }, '[AIChat] Unhandled error')
      sendChunk(reply, { type: 'error', message: 'Unexpected error. Please try again.' })
    } finally {
      reply.raw.end()
    }

    return reply
  })
}
