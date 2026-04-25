import type { FastifyInstance } from 'fastify'
import { getCommSettings, updateCommSettings, getSystemCommSettings, updateSystemCommSettings, testEmailConnection, testWhatsappConnection } from '../services/communication.service.js'
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
    emailSystemServiceDisabled: s.emailSystemServiceDisabled,
    whatsappEnabled: s.whatsappEnabled,
    whatsappProvider: s.whatsappProvider,
    whatsappPhoneNumberId: s.whatsappPhoneNumberId,
    whatsappBusinessAccountId: s.whatsappBusinessAccountId,
    whatsappAccessTokenSet: !!s.whatsappAccessToken,
    whatsappTwilioAccountSid: s.whatsappTwilioAccountSid,
    whatsappTwilioAuthTokenSet: !!s.whatsappTwilioAuthToken,
    whatsappTwilioNumber: s.whatsappTwilioNumber,
    whatsappSystemServiceDisabled: s.whatsappSystemServiceDisabled,
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
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super' && rawOrgId
      ? parseInt(rawOrgId, 10)
      : request.admin.organizationId!
    const s = await getCommSettings(orgId)
    return reply.send(maskSensitive(s))
  })

  fastify.get('/admin/communication/whatsapp-webhook', async (_request, reply) => {
    return reply.send({
      webhookUrl: `${env.WEB_BASE_URL}/api/v1/webhooks/whatsapp`,
      verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    })
  })

  fastify.put('/admin/communication', async (request, reply) => {
    const body = request.body as Partial<CommSettings> & { orgId?: number }
    const orgId = request.admin.role === 'super' && body.orgId
      ? body.orgId
      : request.admin.organizationId

    if (!orgId) return reply.status(400).send({ error: 'No organization context' })

    // Only super admin can set system service disable flags
    if ((body.emailSystemServiceDisabled !== undefined || body.whatsappSystemServiceDisabled !== undefined)
        && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }

    await updateCommSettings(orgId, body as never)
    return reply.send({ ok: true })
  })

  fastify.post('/admin/communication/email/test', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const rawOrgId = body.orgId ?? (request.query as Record<string, string>).orgId
    const orgId = (request as any).admin.role === 'super'
      ? (rawOrgId ? Number(rawOrgId) : null)
      : (request as any).admin.organizationId as number
    return reply.send(await testEmailConnection(orgId))
  })

  fastify.post('/admin/communication/whatsapp/test', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const rawOrgId = body.orgId ?? (request.query as Record<string, string>).orgId
    const orgId = (request as any).admin.role === 'super'
      ? (rawOrgId ? Number(rawOrgId) : null)
      : (request as any).admin.organizationId as number
    return reply.send(await testWhatsappConnection(orgId))
  })
}
