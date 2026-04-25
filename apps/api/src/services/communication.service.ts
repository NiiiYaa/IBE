import { prisma } from '../db/client.js'
import * as net from 'net'

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

// ── TCP check helper ──────────────────────────────────────────────────────────

function tcpCheck(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    sock.setTimeout(5000)
    sock.connect(port, host, () => { sock.destroy(); resolve() })
    sock.on('timeout', () => { sock.destroy(); reject(new Error('Connection timed out')) })
    sock.on('error', (e) => reject(e))
  })
}

// ── Test connections ──────────────────────────────────────────────────────────

export async function testEmailConnection(orgId: number | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const settings = orgId !== null ? await getCommSettings(orgId) : await getSystemCommSettings()
    const { emailProvider, emailSmtpHost, emailSmtpPort, emailSmtpPassword, emailApiKey } = settings

    if (emailProvider === 'smtp') {
      if (!emailSmtpHost) return { ok: false, error: 'SMTP host not configured' }
      await tcpCheck(emailSmtpHost, emailSmtpPort)
      return { ok: true }
    }

    if (emailProvider === 'sendgrid') {
      if (!emailApiKey) return { ok: false, error: 'SendGrid API key not configured' }
      const res = await fetch('https://api.sendgrid.com/v3/scopes', {
        headers: { Authorization: `Bearer ${emailApiKey}` },
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: `SendGrid returned ${res.status}` }
    }

    if (emailProvider === 'mailgun') {
      if (!emailApiKey) return { ok: false, error: 'Mailgun API key not configured' }
      const credentials = Buffer.from(`api:${emailApiKey}`).toString('base64')
      const res = await fetch('https://api.mailgun.net/v3/domains', {
        headers: { Authorization: `Basic ${credentials}` },
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: `Mailgun returned ${res.status}` }
    }

    return { ok: false, error: `Unknown email provider: ${emailProvider}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function testWhatsappConnection(orgId: number | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const settings = orgId !== null ? await getCommSettings(orgId) : await getSystemCommSettings()
    const { whatsappProvider, whatsappPhoneNumberId, whatsappAccessToken, whatsappTwilioAccountSid, whatsappTwilioAuthToken } = settings

    if (whatsappProvider === 'meta') {
      if (!whatsappAccessToken) return { ok: false, error: 'Meta access token not configured' }
      if (!whatsappPhoneNumberId) return { ok: false, error: 'Phone number ID not configured' }
      const res = await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}?access_token=${whatsappAccessToken}`)
      if (res.ok) return { ok: true }
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return { ok: false, error: body?.error?.message ?? `Meta API returned ${res.status}` }
    }

    if (whatsappProvider === 'twilio') {
      if (!whatsappTwilioAccountSid) return { ok: false, error: 'Twilio Account SID not configured' }
      if (!whatsappTwilioAuthToken) return { ok: false, error: 'Twilio Auth Token not configured' }
      const credentials = Buffer.from(`${whatsappTwilioAccountSid}:${whatsappTwilioAuthToken}`).toString('base64')
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${whatsappTwilioAccountSid}.json`, {
        headers: { Authorization: `Basic ${credentials}` },
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: `Twilio returned ${res.status}` }
    }

    return { ok: false, error: `Unknown WhatsApp provider: ${whatsappProvider}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
