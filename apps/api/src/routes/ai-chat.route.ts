import type { FastifyInstance } from 'fastify'
import { runOrchestrator } from '../ai/orchestrator.js'
import { resolveAIConfig } from '../services/ai-config.service.js'
import { getCommSettings } from '../services/communication.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'
import { ClientSession } from '../ai/sessions/client-session.js'
import type { ChatMessage } from '../ai/sessions/types.js'
import { logger } from '../utils/logger.js'

function sendChunk(reply: { raw: { write: (s: string) => void } }, data: unknown) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
}

export async function aiChatRoutes(fastify: FastifyInstance) {
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
      }
    }

    void reply.header('Cache-Control', 'public, max-age=60')
    return reply.send({ aiEnabled: !!aiConfig, whatsappNumber })
  })

  // POST /api/v1/ai/chat — guest-facing conversational search
  // Uses SSE to stream text back; tool results are sent as separate events before the text.
  fastify.post('/ai/chat', async (request, reply) => {
    const { message, history, propertyId, orgId, sessionId } = request.body as {
      message: string
      history: ChatMessage[]
      propertyId?: number
      orgId?: number
      sessionId: string
    }

    if (!message?.trim()) {
      return reply.status(400).send({ error: 'message is required' })
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    try {
      const session = new ClientSession(history ?? [])
      const result = await runOrchestrator({
        message,
        session,
        sessionId: sessionId ?? 'anon',
        ...(propertyId ? { propertyId } : {}),
        ...(orgId ? { orgId } : {}),
      })

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
