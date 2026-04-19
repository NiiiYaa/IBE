import { prisma } from '../db/client.js'

export interface CommSettings {
  emailEnabled: boolean
  emailProvider: string
  emailFromName: string
  emailFromAddress: string
  emailSmtpHost: string
  emailSmtpPort: number
  emailSmtpUser: string
  emailSmtpSecure: boolean
  emailSmtpPassword: string | null
  emailApiKey: string | null

  whatsappEnabled: boolean
  whatsappProvider: string
  whatsappPhoneNumberId: string
  whatsappBusinessAccountId: string
  whatsappAccessToken: string | null
  whatsappTwilioAccountSid: string
  whatsappTwilioAuthToken: string | null
  whatsappTwilioNumber: string

  smsEnabled: boolean
  smsProvider: string
  smsFromNumber: string
  smsTwilioAccountSid: string
  smsTwilioAuthToken: string | null
  smsVonageApiKey: string
  smsVonageApiSecret: string | null
  smsAwsAccessKey: string
  smsAwsSecretKey: string | null
  smsAwsRegion: string
}

function defaults(): CommSettings {
  return {
    emailEnabled: false, emailProvider: 'smtp', emailFromName: '', emailFromAddress: '',
    emailSmtpHost: '', emailSmtpPort: 587, emailSmtpUser: '', emailSmtpSecure: true,
    emailSmtpPassword: null, emailApiKey: null,
    whatsappEnabled: false, whatsappProvider: 'meta', whatsappPhoneNumberId: '',
    whatsappBusinessAccountId: '', whatsappAccessToken: null,
    whatsappTwilioAccountSid: '', whatsappTwilioAuthToken: null, whatsappTwilioNumber: '',
    smsEnabled: false, smsProvider: 'twilio', smsFromNumber: '',
    smsTwilioAccountSid: '', smsTwilioAuthToken: null,
    smsVonageApiKey: '', smsVonageApiSecret: null,
    smsAwsAccessKey: '', smsAwsSecretKey: null, smsAwsRegion: '',
  }
}

function fromRow(row: Awaited<ReturnType<typeof prisma.communicationSettings.findUnique>>): CommSettings {
  if (!row) return defaults()
  return {
    emailEnabled: row.emailEnabled, emailProvider: row.emailProvider,
    emailFromName: row.emailFromName, emailFromAddress: row.emailFromAddress,
    emailSmtpHost: row.emailSmtpHost, emailSmtpPort: row.emailSmtpPort,
    emailSmtpUser: row.emailSmtpUser, emailSmtpSecure: row.emailSmtpSecure,
    emailSmtpPassword: row.emailSmtpPassword, emailApiKey: row.emailApiKey,
    whatsappEnabled: row.whatsappEnabled, whatsappProvider: row.whatsappProvider,
    whatsappPhoneNumberId: row.whatsappPhoneNumberId,
    whatsappBusinessAccountId: row.whatsappBusinessAccountId,
    whatsappAccessToken: row.whatsappAccessToken,
    whatsappTwilioAccountSid: row.whatsappTwilioAccountSid,
    whatsappTwilioAuthToken: row.whatsappTwilioAuthToken,
    whatsappTwilioNumber: row.whatsappTwilioNumber,
    smsEnabled: row.smsEnabled, smsProvider: row.smsProvider,
    smsFromNumber: row.smsFromNumber, smsTwilioAccountSid: row.smsTwilioAccountSid,
    smsTwilioAuthToken: row.smsTwilioAuthToken, smsVonageApiKey: row.smsVonageApiKey,
    smsVonageApiSecret: row.smsVonageApiSecret, smsAwsAccessKey: row.smsAwsAccessKey,
    smsAwsSecretKey: row.smsAwsSecretKey, smsAwsRegion: row.smsAwsRegion,
  }
}

export async function getCommSettings(organizationId: number): Promise<CommSettings> {
  const row = await prisma.communicationSettings.findUnique({ where: { organizationId } })
  return fromRow(row)
}

export async function updateCommSettings(organizationId: number, data: Partial<CommSettings>): Promise<CommSettings> {
  const row = await prisma.communicationSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  })
  return fromRow(row)
}
