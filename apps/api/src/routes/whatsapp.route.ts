import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { runOrchestrator } from '../ai/orchestrator.js'
import { RedisSession } from '../ai/sessions/redis-session.js'
import { resolveOrgByPhoneNumberId, sendWhatsAppMessage } from '../services/whatsapp.service.js'
import { getWaSessionContext, setWaSessionContext, clearWaSessionContext } from '../services/communication.service.js'
import { extractPropertyIdFromToolResults } from '../ai/whatsapp-handler.js'

interface WhatsAppWebhookBody {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        phone_number_id: string
        messages?: Array<{
          from: string
          id: string
          type: string
          text?: { body: string }
        }>
        statuses?: unknown[]
      }
      field: string
    }>
  }>
}

export async function whatsappRoutes(fastify: FastifyInstance) {
  // GET /webhooks/whatsapp — Meta webhook verification
  fastify.get('/webhooks/whatsapp', async (request, reply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } =
      request.query as Record<string, string>

    if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      logger.info('[WhatsApp] Webhook verified')
      return reply.status(200).send(challenge)
    }

    return reply.status(403).send({ error: 'Forbidden' })
  })

  // POST /webhooks/whatsapp — inbound messages from Meta
  fastify.post('/webhooks/whatsapp', async (request, reply) => {
    // Acknowledge immediately — Meta requires a 200 within 20s
    void reply.status(200).send({ status: 'ok' })

    const body = request.body as WhatsAppWebhookBody
    if (body.object !== 'whatsapp_business_account') return

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId = value.phone_number_id

        for (const msg of value.messages ?? []) {
          if (msg.type !== 'text' || !msg.text?.body) continue

          const from = msg.from
          const text = msg.text.body

          // Run async — do not block the 200 reply
          processInbound(phoneNumberId, from, text).catch(err => {
            logger.error({ err, phoneNumberId, from }, '[WhatsApp] processInbound error')
          })
        }
      }
    }
  })
}

async function processInbound(phoneNumberId: string, from: string, text: string): Promise<void> {
  const org = await resolveOrgByPhoneNumberId(phoneNumberId)
  if (!org) {
    logger.warn({ phoneNumberId }, '[WhatsApp] No enabled org found for phone_number_id')
    return
  }

  const sessionId = `wa:${phoneNumberId}:${from}`

  // Fresh greeting from IBE button — reset session so hotel context doesn't carry over
  const isFreshGreeting = /^hello,?\s+i['']d like to find out about\b/i.test(text.trim())
  if (isFreshGreeting) {
    const session = new RedisSession()
    await Promise.all([session.save(sessionId, []), clearWaSessionContext(sessionId)])
    logger.info({ from, sessionId }, '[WhatsApp] Fresh greeting — session reset')
  }

  // Use hotel locked from a previous turn; fall back to chain-level (no home property)
  const savedCtx = isFreshGreeting ? null : await getWaSessionContext(sessionId)
  const propertyId = savedCtx?.propertyId

  logger.info({ from, orgId: org.organizationId, propertyId, sessionId }, '[WhatsApp] Routing message')

  const session = new RedisSession()
  const result = await runOrchestrator({
    message: text,
    session,
    sessionId,
    channel: 'whatsapp',
    ...(propertyId ? { propertyId } : {}),
    orgId: org.organizationId,
  })

  // Lock session to the hotel the AI resolved on this turn
  if (!propertyId && result.toolResults.length > 0) {
    const resolvedPropId = extractPropertyIdFromToolResults(result.toolResults)
    if (resolvedPropId) {
      void setWaSessionContext(sessionId, { orgId: org.organizationId, propertyId: resolvedPropId })
      logger.info({ sessionId, propertyId: resolvedPropId }, '[WhatsApp] Session locked to property')
    }
  }

  if (result.text) {
    await sendWhatsAppMessage(org.phoneNumberId, org.accessToken, from, result.text)
  }
}
