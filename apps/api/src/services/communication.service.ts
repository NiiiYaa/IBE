import { prisma } from '../db/client.js'

export interface CommSettings {
  emailSystemServiceDisabled: boolean
  whatsappSystemServiceDisabled: boolean
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
    emailSystemServiceDisabled: false, whatsappSystemServiceDisabled: false,
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

function mapRow(row: {
  emailEnabled: boolean; emailProvider: string; emailFromName: string; emailFromAddress: string
  emailSmtpHost: string; emailSmtpPort: number; emailSmtpUser: string; emailSmtpSecure: boolean
  emailSmtpPassword: string | null; emailApiKey: string | null
  emailSystemServiceDisabled?: boolean
  whatsappEnabled: boolean; whatsappProvider: string; whatsappPhoneNumberId: string
  whatsappBusinessAccountId: string; whatsappAccessToken: string | null
  whatsappTwilioAccountSid: string; whatsappTwilioAuthToken: string | null; whatsappTwilioNumber: string
  whatsappSystemServiceDisabled?: boolean
  smsEnabled: boolean; smsProvider: string; smsFromNumber: string
  smsTwilioAccountSid: string; smsTwilioAuthToken: string | null
  smsVonageApiKey: string; smsVonageApiSecret: string | null
  smsAwsAccessKey: string; smsAwsSecretKey: string | null; smsAwsRegion: string
}): CommSettings {
  return {
    emailSystemServiceDisabled: row.emailSystemServiceDisabled ?? false,
    whatsappSystemServiceDisabled: row.whatsappSystemServiceDisabled ?? false,
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

// ── System-level (cached singleton) ──────────────────────────────────────────

let _systemCommCache: CommSettings | null = null

async function loadSystemCommSettings(): Promise<CommSettings> {
  if (_systemCommCache) return _systemCommCache
  const row = await prisma.systemCommunicationSettings.findFirst()
  _systemCommCache = row ? mapRow(row) : defaults()
  return _systemCommCache
}

function invalidateSystemCommCache() { _systemCommCache = null }

export async function getSystemCommSettings(): Promise<CommSettings> {
  return loadSystemCommSettings()
}

export async function updateSystemCommSettings(data: Partial<CommSettings>): Promise<CommSettings> {
  const existing = await prisma.systemCommunicationSettings.findFirst()
  const row = existing
    ? await prisma.systemCommunicationSettings.update({ where: { id: existing.id }, data: data as never })
    : await prisma.systemCommunicationSettings.create({ data: data as never })
  invalidateSystemCommCache()
  return mapRow(row)
}

// ── Org-level (cascades to system) ───────────────────────────────────────────

export async function getCommSettings(organizationId: number): Promise<CommSettings> {
  const row = await prisma.communicationSettings.findUnique({ where: { organizationId } })
  if (!row) return loadSystemCommSettings()

  const hasOwnEmailCreds = !!(row.emailApiKey || row.emailSmtpPassword)
  const hasOwnWhatsappCreds = !!(row.whatsappAccessToken || row.whatsappTwilioAuthToken)

  // If org has own credentials for both services, no need for system fallback
  if (hasOwnEmailCreds && hasOwnWhatsappCreds) return mapRow(row)

  const sys = await loadSystemCommSettings()
  const orgSettings = mapRow(row)

  return {
    ...orgSettings,
    // Email: use own credentials if set; else check disable flag; else inherit system
    ...(hasOwnEmailCreds ? {} : {
      emailEnabled: row.emailSystemServiceDisabled ? false : sys.emailEnabled,
      emailProvider: sys.emailProvider,
      emailFromName: row.emailFromName || sys.emailFromName,
      emailFromAddress: row.emailFromAddress || sys.emailFromAddress,
      emailSmtpHost: sys.emailSmtpHost,
      emailSmtpPort: sys.emailSmtpPort,
      emailSmtpUser: sys.emailSmtpUser,
      emailSmtpSecure: sys.emailSmtpSecure,
      emailSmtpPassword: sys.emailSmtpPassword,
      emailApiKey: sys.emailApiKey,
    }),
    // WhatsApp: same pattern
    ...(hasOwnWhatsappCreds ? {} : {
      whatsappEnabled: row.whatsappSystemServiceDisabled ? false : sys.whatsappEnabled,
      whatsappProvider: sys.whatsappProvider,
      whatsappPhoneNumberId: sys.whatsappPhoneNumberId,
      whatsappBusinessAccountId: sys.whatsappBusinessAccountId,
      whatsappAccessToken: sys.whatsappAccessToken,
      whatsappTwilioAccountSid: sys.whatsappTwilioAccountSid,
      whatsappTwilioAuthToken: sys.whatsappTwilioAuthToken,
      whatsappTwilioNumber: sys.whatsappTwilioNumber,
    }),
  }
}

export async function updateCommSettings(organizationId: number, data: Partial<CommSettings>): Promise<CommSettings> {
  const row = await prisma.communicationSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  })
  return mapRow(row)
}
