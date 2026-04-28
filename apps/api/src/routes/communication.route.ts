import type { FastifyInstance } from 'fastify'
import { getCommSettings, updateCommSettings, getSystemCommSettings, updateSystemCommSettings, testEmailConnection, testWhatsappConnection, getPropertyWebjsSettings, upsertPropertyWebjsSettings } from '../services/communication.service.js'
import type { CommSettings } from '../services/communication.service.js'
import { getStatus, getQrDataUrl, disconnectClient, initClient, clientKey } from '../services/whatsapp-manager.service.js'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'

function maskSensitive(s: CommSettings, ownWebjsUrl = '') {
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
    whatsappWebjsServiceUrl: s.whatsappWebjsServiceUrl,
    whatsappWebjsServiceUrlOwn: ownWebjsUrl,
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
    return reply.send(maskSensitive(s, s.whatsappWebjsServiceUrl))
  })

  // PUT /admin/communication/system — update system-level defaults (super only)
  fastify.put('/admin/communication/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const body = request.body as Partial<CommSettings>
    await updateSystemCommSettings(body)
    if (body.whatsappProvider === 'wwebjs' && body.whatsappEnabled) void initClient({})
    return reply.send({ ok: true })
  })

  fastify.get('/admin/communication', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super' && rawOrgId
      ? parseInt(rawOrgId, 10)
      : request.admin.organizationId!
    const s = await getCommSettings(orgId)
    const orgRow = await prisma.communicationSettings.findUnique({
      where: { organizationId: orgId },
      select: { whatsappWebjsServiceUrl: true },
    })
    return reply.send(maskSensitive(s, orgRow?.whatsappWebjsServiceUrl ?? ''))
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

    const { orgId: _omit, ...safeData } = body
    await updateCommSettings(orgId, safeData as never)
    if ((safeData as any).whatsappProvider === 'wwebjs' && (safeData as any).whatsappEnabled) void initClient({ orgId })
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

  // ── Local WhatsApp (Baileys) — direct manager calls ──────────────────────────

  function resolveOrgId(request: any): number | null {
    const rawOrgId = (request.query as Record<string, string>).orgId
    return (request as any).admin.role === 'super'
      ? (rawOrgId ? Number(rawOrgId) : null)
      : (request as any).admin.organizationId as number
  }

  function resolvePropertyId(request: any): number | null {
    const raw = (request.query as Record<string, string>).propertyId
    return raw ? parseInt(raw, 10) : null
  }

  function ctxFromIds(orgId: number | null, propertyId: number | null) {
    if (propertyId) return { propertyId }
    if (orgId) return { orgId }
    return {}
  }

  fastify.get('/admin/communication/wwebjs/status', async (request, reply) => {
    const ctx = ctxFromIds(resolveOrgId(request), null)
    return reply.send({ ...getStatus(ctx), configured: true })
  })

  fastify.get('/admin/communication/wwebjs/qr', async (request, reply) => {
    const ctx = ctxFromIds(resolveOrgId(request), null)
    // Trigger initClient if not yet started (first time after saving settings)
    void initClient(ctx)
    const qr = getQrDataUrl(ctx)
    if (!qr) return reply.status(404).send({ error: 'No QR available' })
    return reply.send({ qr })
  })

  fastify.post('/admin/communication/wwebjs/disconnect', async (request, reply) => {
    const ctx = ctxFromIds(resolveOrgId(request), null)
    await disconnectClient(ctx)
    return reply.send({ ok: true })
  })

  // ── Property-level Local WhatsApp ──────────────────────────────────────────

  fastify.get('/admin/communication/property/wwebjs', async (request, reply) => {
    const propertyId = resolvePropertyId(request)
    if (!propertyId) return reply.status(400).send({ error: 'propertyId required' })
    const row = await getPropertyWebjsSettings(propertyId)
    const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
    const orgSettings = prop ? await getCommSettings(prop.organizationId) : null
    return reply.send({
      whatsappWebjsServiceUrl: row?.whatsappWebjsServiceUrl ?? '',
      whatsappSystemServiceDisabled: row?.whatsappSystemServiceDisabled ?? false,
      inheritedProvider: orgSettings?.whatsappProvider ?? null,
      inheritedWebjsUrl: orgSettings?.whatsappWebjsServiceUrl ?? null,
      inheritedDisabled: orgSettings?.whatsappSystemServiceDisabled ?? false,
    })
  })

  fastify.put('/admin/communication/property/wwebjs', async (request, reply) => {
    const propertyId = resolvePropertyId(request)
    if (!propertyId) return reply.status(400).send({ error: 'propertyId required' })
    const body = request.body as { whatsappWebjsServiceUrl?: string; whatsappSystemServiceDisabled?: boolean }
    if (body.whatsappSystemServiceDisabled !== undefined && (request as any).admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    await upsertPropertyWebjsSettings(propertyId, body)
    return reply.send({ ok: true })
  })

  fastify.get('/admin/communication/property/wwebjs/status', async (request, reply) => {
    const ctx = ctxFromIds(resolveOrgId(request), resolvePropertyId(request))
    return reply.send({ ...getStatus(ctx), configured: true })
  })

  fastify.get('/admin/communication/property/wwebjs/qr', async (request, reply) => {
    const ctx = ctxFromIds(resolveOrgId(request), resolvePropertyId(request))
    void initClient(ctx)
    const qr = getQrDataUrl(ctx)
    if (!qr) return reply.status(404).send({ error: 'No QR available' })
    return reply.send({ qr })
  })

  fastify.post('/admin/communication/property/wwebjs/disconnect', async (request, reply) => {
    const ctx = ctxFromIds(resolveOrgId(request), resolvePropertyId(request))
    await disconnectClient(ctx)
    return reply.send({ ok: true })
  })
}
