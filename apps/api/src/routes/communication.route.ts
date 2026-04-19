import type { FastifyInstance } from 'fastify'
import { getCommSettings, updateCommSettings } from '../services/communication.service.js'

export async function communicationRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/communication', async (request, reply) => {
    const s = await getCommSettings(request.admin.organizationId!)
    return reply.send({
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
