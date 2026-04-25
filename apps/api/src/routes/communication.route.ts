import type { FastifyInstance } from 'fastify'
import { getCommSettings, updateCommSettings, getSystemCommSettings, updateSystemCommSettings } from '../services/communication.service.js'
import type { CommSettings } from '../services/communication.service.js'
import { env } from '../config/env.js'

function maskSensitive(s: CommSettings) {
  return {
    emailEnabled: s.emailEnabled,
    emailProvider: s.emailProvider,
    emailFromName: s.emailFromName,
    emailFromAddress: s.emailFromAddress,
    emailSmtpHost: s.emailSmtpHost,
    emailSmtpPort: s.emailSmtpPort,
    emailSmtpUser: s.emailSmtpUser,
    emailSmtpSecure: s.emailSmtpSecure,
    emailSmtpPasswordSet: !!s.emailSmtpPassword,
    emailApiKeySet: !!s.emailApiKey,
    whatsappEnabled: s.whatsappEnabled,
    whatsappProvider: s.whatsappProvider,
    whatsappPhoneNumberId: s.whatsappPhoneNumberId,
    whatsappBusinessAccountId: s.whatsappBusinessAccountId,
    whatsappAccessTokenSet: !!s.whatsappAccessToken,
    whatsappTwilioAccountSid: s.whatsappTwilioAccountSid,
    whatsappTwilioAuthTokenSet: !!s.whatsappTwilioAuthToken,
    whatsappTwilioNumber: s.whatsappTwilioNumber,
    smsEnabled: s.smsEnabled,
    smsProvider: s.smsProvider,
    smsFromNumber: s.smsFromNumber,
    smsTwilioAccountSid: s.smsTwilioAccountSid,
    smsTwilioAuthTokenSet: !!s.smsTwilioAuthToken,
    smsVonageApiKey: s.smsVonageApiKey,
    smsVonageApiSecretSet: !!s.smsVonageApiSecret,
    smsAwsAccessKey: s.smsAwsAccessKey,
    smsAwsSecretKeySet: !!s.smsAwsSecretKey,
    smsAwsRegion: s.smsAwsRegion,
  }
}

export async function communicationRoutes(fastify: FastifyInstance) {
  // GET /admin/communication/system — system-level defaults (super only)
  fastify.get('/admin/communication/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const s = await getSystemCommSettings()
    return reply.send(maskSensitive(s))
  })

  // PUT /admin/communication/system — update system-level defaults (super only)
  fastify.put('/admin/communication/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const body = request.body as Partial<CommSettings>
    await updateSystemCommSettings(body)
    return reply.send({ ok: true })
  })

  fastify.get('/admin/communication', async (request, reply) => {
    const s = await getCommSettings(request.admin.organizationId!)
    return reply.send(maskSensitive(s))
  })

  fastify.get('/admin/communication/whatsapp-webhook', async (_request, reply) => {
    return reply.send({
      webhookUrl: `${env.WEB_BASE_URL}/api/v1/webhooks/whatsapp`,
      verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    })
  })

  fastify.put('/admin/communication', async (request, reply) => {
    const body = request.body as Partial<{
      emailEnabled: boolean; emailProvider: string; emailFromName: string
      emailFromAddress: string; emailSmtpHost: string; emailSmtpPort: number
      emailSmtpUser: string; emailSmtpSecure: boolean; emailSmtpPassword: string; emailApiKey: string
      whatsappEnabled: boolean; whatsappProvider: string; whatsappPhoneNumberId: string
      whatsappBusinessAccountId: string; whatsappAccessToken: string
      whatsappTwilioAccountSid: string; whatsappTwilioAuthToken: string; whatsappTwilioNumber: string
      smsEnabled: boolean; smsProvider: string; smsFromNumber: string
      smsTwilioAccountSid: string; smsTwilioAuthToken: string
      smsVonageApiKey: string; smsVonageApiSecret: string
      smsAwsAccessKey: string; smsAwsSecretKey: string; smsAwsRegion: string
    }>

    await updateCommSettings(request.admin.organizationId!, body as never)
    return reply.send({ ok: true })
  })
}
