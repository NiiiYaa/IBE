import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { runOrchestrator } from '../ai/orchestrator.js'
import { RedisSession } from '../ai/sessions/redis-session.js'
import { resolveOrgByPhoneNumberId, getOrgPropertyId, sendWhatsAppMessage } from '../services/whatsapp.service.js'

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

  const propertyId = await getOrgPropertyId(org.organizationId)
  const sessionId = `wa:${phoneNumberId}:${from}`

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

  if (result.text) {
    await sendWhatsAppMessage(org.phoneNumberId, org.accessToken, from, result.text)
  }
}
