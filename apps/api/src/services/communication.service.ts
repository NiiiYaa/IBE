import { prisma } from '../db/client.js'
import * as net from 'net'
import { cacheGet, cacheSet } from '../utils/cache.js'

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
  whatsappWebjsServiceUrl: string

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
    whatsappWebjsServiceUrl: '',
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
  whatsappWebjsServiceUrl: string
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
    whatsappWebjsServiceUrl: row.whatsappWebjsServiceUrl,
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
  const hasOwnWhatsappCreds = !!(row.whatsappAccessToken || row.whatsappTwilioAuthToken || row.whatsappWebjsServiceUrl)

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
      whatsappWebjsServiceUrl: sys.whatsappWebjsServiceUrl,
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

    if (whatsappProvider === 'wwebjs') {
      const { whatsappWebjsServiceUrl } = settings
      if (!whatsappWebjsServiceUrl) return { ok: false, error: 'wwebjs service URL not configured' }
      const res = await fetch(`${whatsappWebjsServiceUrl}/status`).catch(() => null)
      if (!res?.ok) return { ok: false, error: 'Cannot reach wwebjs service' }
      const body = await res.json() as { status: string }
      if (body.status === 'connected') return { ok: true }
      return { ok: false, error: `Local status: ${body.status}` }
    }

    return { ok: false, error: `Unknown WhatsApp provider: ${whatsappProvider}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── WhatsApp session context (persisted in Redis, survives API restarts) ────────
// When a guest messages the system number with no org/property context,
// the AI runs system-wide. Once a specific property is resolved from tool calls,
// we lock the session to that org so all future turns are scoped.

const WA_CTX_TTL = 60 * 60 * 24 // 24 h — same as conversation history

export async function getWaSessionContext(sessionId: string): Promise<{ orgId?: number; propertyId?: number } | null> {
  return cacheGet<{ orgId?: number; propertyId?: number }>(`ai:wa-ctx:${sessionId}`)
}

export async function setWaSessionContext(sessionId: string, ctx: { orgId?: number; propertyId?: number }): Promise<void> {
  await cacheSet(`ai:wa-ctx:${sessionId}`, ctx, WA_CTX_TTL)
}

export async function clearWaSessionContext(sessionId: string): Promise<void> {
  await cacheSet(`ai:wa-ctx:${sessionId}`, null, 1)
}

// ── wwebjs phone registry (in-memory, refreshed on every connect/message) ─────

const _webjsPhoneRegistry = new Map<string, { orgId?: number; propertyId?: number }>()

export function registerWebjsPhone(phone: string, ctx: { orgId?: number; propertyId?: number }) {
  _webjsPhoneRegistry.set(phone, ctx)
}

export function resolveWebjsPhoneContext(phone: string): { orgId?: number; propertyId?: number } | null {
  return _webjsPhoneRegistry.get(phone) ?? null
}

// ── Property-level wwebjs settings ───────────────────────────────────────────

export async function getPropertyWebjsSettings(propertyId: number) {
  return prisma.propertyCommunicationSettings.findUnique({ where: { propertyId } })
}

export async function upsertPropertyWebjsSettings(
  propertyId: number,
  data: { whatsappWebjsServiceUrl?: string; whatsappSystemServiceDisabled?: boolean },
) {
  return prisma.propertyCommunicationSettings.upsert({
    where: { propertyId },
    create: { propertyId, ...data },
    update: data,
  })
}

// Resolve wwebjs service URL + client param: property → org → system
async function resolveWebjsTarget(
  propertyId: number | null,
  orgId: number | null,
): Promise<{ url: string; param: string } | null> {
  if (propertyId !== null) {
    const propRow = await prisma.propertyCommunicationSettings.findUnique({ where: { propertyId } })
    if (propRow?.whatsappSystemServiceDisabled) return null
    if (propRow?.whatsappWebjsServiceUrl) {
      return { url: propRow.whatsappWebjsServiceUrl, param: `propertyId=${propertyId}` }
    }
    if (!orgId) {
      const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
      if (!prop) return null
      orgId = prop.organizationId
    }
  }

  if (orgId !== null) {
    const settings = await getCommSettings(orgId)
    if (!settings.whatsappWebjsServiceUrl || settings.whatsappProvider !== 'wwebjs' || settings.whatsappSystemServiceDisabled) return null
    // Only pass orgId if the org has explicitly opted in to wwebjs (has its own client).
    // Orgs that are purely inheriting the system service use the system client (no param).
    const orgRow = await prisma.communicationSettings.findUnique({
      where: { organizationId: orgId },
      select: { whatsappProvider: true },
    })
    const param = orgRow?.whatsappProvider === 'wwebjs' ? `orgId=${orgId}` : ''
    return { url: settings.whatsappWebjsServiceUrl, param }
  }

  const sys = await getSystemCommSettings()
  if (!sys.whatsappWebjsServiceUrl || sys.whatsappProvider !== 'wwebjs') return null
  return { url: sys.whatsappWebjsServiceUrl, param: '' }
}

export async function proxyWebjsRequest(
  orgId: number | null,
  path: string,
  method = 'GET',
  propertyId: number | null = null,
): Promise<{ status: number; body: unknown }> {
  const target = await resolveWebjsTarget(propertyId, orgId)
  if (!target) return { status: 400, body: { error: 'wwebjs service not available' } }
  const { url, param } = target
  const sep = path.includes('?') ? '&' : '?'
  const fullPath = param ? `${url}${path}${sep}${param}` : `${url}${path}`
  try {
    const res = await fetch(fullPath, { method })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body }
  } catch {
    return { status: 502, body: { error: 'Cannot reach wwebjs service' } }
  }
}

export async function pushWebjsConfig(
  orgId: number | null,
  propertyId: number | null = null,
): Promise<void> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  const target = await resolveWebjsTarget(propertyId, orgId)
  if (!target) return

  const body: Record<string, unknown> = { ibeApiUrl: apiUrl }
  if (propertyId !== null) body.propertyId = propertyId
  else if (orgId !== null) body.orgId = orgId

  try {
    await fetch(`${target.url}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // non-fatal
  }
}
